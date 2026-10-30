import type Point from "@arcgis/core/geometry/Point.js";
import { html, nothing } from "lit";
import type { Fotovedlegg, ObjektTreff } from "../../data/DataService.ts";
import { AVVIKSTYPER, TILSTANDSGRADER, type Tilstandsgrad } from "../../data/schema.ts";
import { formatDistance, formatUtm } from "../../map/coords.ts";
import { services } from "../../services.ts";
import { tilbake } from "../../state/router.ts";
import { store } from "../../state/store.ts";
import { dataChanged, ensureTasks } from "../../tasks/task-store.ts";
import { isOpen } from "../../tasks/tasks.ts";
import { StoreElement, fmtDateTime } from "../../ui/base.ts";
import { icons } from "../../ui/icons.ts";
import { isSimGps, startFieldRuntime } from "../field-runtime.ts";
import { watchCompass } from "../gps.ts";
import { autoFields, changeObject, draftId, prefill, toInspeksjon, unlock, validate, type InspeksjonUtkast } from "../prefill.ts";
import { inspectionSync, offlineQueue } from "../sync-setup.ts";
import { KONSEKVENSGRADER, driftskrav, tiltakstid } from "../../handbok/r610.ts";
import { hentAadt } from "../../nvdb/vegobjekter.ts";
import { finnObjekt } from "../../nvdb/oppslag.ts";

/** Inspeksjonsskjema med autoutfylte felt fra objektet. */
export class SvvInspectionForm extends StoreElement {
  private u: InspeksjonUtkast | null = null;
  private feil: string[] = [];
  private velger = false;
  private sokTreff: ObjektTreff[] = [];
  private sender = false;
  private retning: number | null = null;
  private stopCompass: (() => void) | null = null;
  private urls = new Map<string, string>();
  private ingenObjekt = false;
  private aadt: { globalid: string; verdi: Awaited<ReturnType<typeof hentAadt>> | undefined } | null = null;
  /** Autolagring av utkastet (ventende tidtaker) */
  private lagreTimer = 0;
  private sokNr = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    const felt = this.store.state.felt || window.matchMedia("(max-width: 768px)").matches;
    if (felt || isSimGps()) void startFieldRuntime();
    this.stopCompass = watchCompass((d) => (this.retning = d));
    void ensureTasks().then(() => this.load());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // Ventende endringer lagres før skjemaet forlates (tilbake, annen fane i bunnmenyen)
    if (this.lagreTimer) void this.autolagre();
    this.stopCompass?.();
    this.urls.forEach((u) => URL.revokeObjectURL(u));
  }

  private oppgaveFor(globalid: string): string | null {
    return (
      store
        .get()
        .oppgaver.filter((o) => o.objekt_globalid === globalid && isOpen(o))
        .sort((a, b) => a.frist.localeCompare(b.frist))[0]?.oppgave_id ?? null
    );
  }

  private posisjon() {
    const g = store.get().gps;
    return g.x != null && g.y != null ? { x: g.x, y: g.y, noyaktighet: g.noyaktighet } : null;
  }

  private async load() {
    const s = store.get();
    const target = s.inspeksjon?.globalid ?? s.valgtNaer ?? s.naer[0]?.objekt.globalid ?? null;
    if (!target) {
      this.ingenObjekt = true;
      this.velger = true;
      this.requestUpdate();
      return;
    }
    const draft = await offlineQueue().getDraft(draftId(target)).catch(() => undefined);
    if (draft) {
      // Åpnet fra en oppgave: koblingen til oppgaven går foran den som ble lagret i utkastet
      this.u = { ...draft, laast: true, oppgaveId: s.inspeksjon?.oppgaveId ?? draft.oppgaveId };
      this.requestUpdate();
      return;
    }
    const { data } = services();
    const hit = await finnObjekt(target).catch(() => null);
    if (!hit) {
      // F.eks. uten dekning: la brukeren velge objekt i stedet for et tomt skjema
      store.notify(store.get().online ? "Fant ikke objektet" : "Kan ikke hente objektet uten dekning", "feil");
      this.ingenObjekt = true;
      this.velger = true;
      this.requestUpdate();
      return;
    }
    const insp = await data.getInspections(target).catch(() => []);
    const naer = s.naer.find((n) => n.objekt.globalid === target);
    this.u = prefill(hit.objekt, insp, {
      id: draftId(target),
      inspektor: data.user.navn,
      now: new Date(),
      posisjon: this.posisjon(),
      oppgaveId: s.inspeksjon?.oppgaveId ?? this.oppgaveFor(target),
      avstand_m: naer?.avstand ?? null,
    });
    this.requestUpdate();
  }

  protected override updated(): void {
    const id = this.u?.objekt.globalid;
    if (!id || this.aadt?.globalid === id) return;
    this.aadt = { globalid: id, verdi: undefined };
    const { cfg } = services();
    void finnObjekt(id)
      .then((t) => {
        const c = t?.geometry.extent?.center ?? (t?.geometry.type === "point" ? (t.geometry as Point) : null);
        return c ? hentAadt({ baseUrl: cfg.nvdb.baseUrl, client: cfg.nvdb.client }, c.x, c.y) : null;
      })
      .catch(() => null)
      .then((v) => {
        if (this.aadt?.globalid !== id) return;
        this.aadt = { globalid: id, verdi: v };
        this.requestUpdate();
      });
  }

  private renderSjekkliste(u: InspeksjonUtkast) {
    const k = driftskrav(u.objekt);
    if (!k || !k.sjekkpunkter.length) return nothing;
    const valgt = u.sjekkliste ?? {};
    return html`<fieldset class="sjekkliste">
      <legend class="felt__etikett">Sjekkpunkter · ${k.type} <span class="sekundar">(valgfritt)</span></legend>
      <p class="sekundar liten">Fra ${k.intervallKilde.split(" ")[0]}. Marker det du har kontrollert.</p>
      <ol class="sjekkliste__liste">
        ${k.sjekkpunkter.map((p, i) => {
          const v = valgt[i];
          const sett = (nytt: "ok" | "avvik") => {
            const neste = { ...valgt };
            if (v === nytt) delete neste[i];
            else neste[i] = nytt;
            this.set({ sjekkliste: neste });
          };
          return html`<li class="sjekkliste__punkt">
            <span class="sjekkliste__tekst">${p.tekst}<span class="kravliste__kilde">${p.kilde}</span></span>
            <span class="sjekkliste__valg" role="group" aria-label="Resultat for sjekkpunkt ${i + 1}">
              <button type="button" class="sjekkliste__knapp ${v === "ok" ? "is-ok" : ""}" aria-pressed=${v === "ok"} @click=${() => sett("ok")}>OK</button>
              <button type="button" class="sjekkliste__knapp ${v === "avvik" ? "is-avvik" : ""}" aria-pressed=${v === "avvik"} @click=${() => sett("avvik")}>Avvik</button>
            </span>
          </li>`;
        })}
      </ol>
    </fieldset>`;
  }

  private renderKonsekvens(u: InspeksjonUtkast) {
    if (u.tilstandsgrad == null || u.tilstandsgrad === 0) return nothing;
    const a = this.aadt?.globalid === u.objekt.globalid ? this.aadt.verdi : undefined;
    const aadt = a?.aadt ?? null;
    const dager = u.konsekvensgrad != null ? tiltakstid(u.konsekvensgrad, aadt) : null;
    const frist = dager != null ? new Date(Date.now() + dager * 86_400_000) : null;
    return html`<fieldset class="radiogruppe konsekvens">
      <legend class="felt__etikett">Konsekvensgrad (R610:2025 tabell 1.3—1)</legend>
      <div class="konsekvens__valg">
        ${KONSEKVENSGRADER.map(
          (k) => html`<label class="avkrysning konsekvens__rad">
            <input type="radio" name="kg" .checked=${u.konsekvensgrad === k.kg} @change=${() => this.set({ konsekvensgrad: k.kg })} />
            <span><strong>KG ${k.kg} – ${k.navn}</strong><span class="sekundar liten">${k.beskrivelse}</span></span>
          </label>`,
        )}
      </div>
      <p class="sekundar liten" role="status">
        ${a === undefined
          ? "Henter ÅDT fra NVDB …"
          : a
            ? `ÅDT ${a.aadt.toLocaleString("nb-NO")}${a.aar ? ` (${a.aar})` : ""} fra NVDB${a.vegref ? `, ${a.vegref}` : ""}.`
            : "Fant ikke ÅDT i NVDB – bruker kolonnen for ÅDT 0–3000."}
        ${dager != null && frist ? html` <strong>Tiltakstid ${dager} dager – utbedres innen ${frist.toLocaleDateString("nb-NO")}.</strong>` : nothing}
        ${u.konsekvensgrad === 3 ? html` Ved fare: sikre stedet straks etter kravene til trafikkberedskap (R610 Krav 1.3—7).` : nothing}
      </p>
    </fieldset>`;
  }

  private set(patch: Partial<InspeksjonUtkast>) {
    if (!this.u) return;
    this.u = { ...this.u, ...patch };
    if (this.feil.length) this.feil = validate(this.u);
    this.requestUpdate();
    // Utkastet lagres fortløpende, så ingenting går tapt ved tilbake, omlasting eller tomt batteri
    clearTimeout(this.lagreTimer);
    this.lagreTimer = window.setTimeout(() => void this.autolagre(), 800);
  }

  private async autolagre() {
    clearTimeout(this.lagreTimer);
    this.lagreTimer = 0;
    if (!this.u || this.sender) return;
    await offlineQueue()
      .saveDraft({ ...this.u, posisjon: this.u.posisjon ?? this.posisjon() })
      .catch((e: unknown) => console.warn("Kunne ikke lagre utkastet", e));
  }

  private async velgObjekt(t: ObjektTreff, avstand: number | null) {
    const { data } = services();
    const insp = await data.getInspections(t.objekt.globalid).catch(() => []);
    const now = new Date();
    if (this.u) {
      const gammel = this.u.id;
      this.u = changeObject(this.u, t.objekt, insp, { now, oppgaveId: this.oppgaveFor(t.objekt.globalid), avstand_m: avstand });
      // Registreringene følger med til det nye objektet; utkastet for det gamle fjernes
      if (gammel !== this.u.id) void offlineQueue().deleteDraft(gammel).catch(() => undefined);
      void this.autolagre();
    } else {
      this.u = prefill(t.objekt, insp, {
        id: draftId(t.objekt.globalid),
        inspektor: data.user.navn,
        now,
        posisjon: this.posisjon(),
        oppgaveId: this.oppgaveFor(t.objekt.globalid),
        avstand_m: avstand,
      });
    }
    this.velger = false;
    this.ingenObjekt = false;
    this.sokTreff = [];
    store.set({ inspeksjon: { globalid: t.objekt.globalid, oppgaveId: this.u.oppgaveId } });
    this.requestUpdate();
  }

  private async onPhotos(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = "";
    const g = store.get().gps;
    const nye: Fotovedlegg[] = files.map((f) => ({
      id: crypto.randomUUID(),
      blob: f,
      navn: f.name || `bilde-${Date.now()}.jpg`,
      x: g.x,
      y: g.y,
      retning: this.retning ?? g.retning,
      noyaktighet_m: g.noyaktighet,
      tidspunkt: new Date().toISOString(),
    }));
    this.set({ bilder: [...(this.u?.bilder ?? []), ...nye] });
  }

  private photoUrl(b: Fotovedlegg): string {
    let u = this.urls.get(b.id);
    if (!u) {
      u = URL.createObjectURL(b.blob);
      this.urls.set(b.id, u);
    }
    return u;
  }

  private async saveDraft() {
    if (!this.u) return;
    clearTimeout(this.lagreTimer);
    this.lagreTimer = 0;
    try {
      await offlineQueue().saveDraft({ ...this.u, posisjon: this.u.posisjon ?? this.posisjon() });
      store.notify("Utkastet er lagret på enheten", "suksess");
    } catch (e) {
      store.notify(`Kunne ikke lagre utkastet: ${e instanceof Error ? e.message : String(e)}`, "feil");
    }
  }

  private async submit() {
    if (!this.u || this.sender) return;
    const u = { ...this.u, posisjon: this.posisjon() ?? this.u.posisjon };
    this.feil = validate(u);
    if (this.feil.length) {
      this.requestUpdate();
      await this.updateComplete;
      this.querySelector<HTMLElement>(".feiloppsummering")?.focus();
      return;
    }
    clearTimeout(this.lagreTimer);
    this.lagreTimer = 0;
    this.sender = true;
    this.requestUpdate();
    try {
      const r = await inspectionSync().submitOrQueue(toInspeksjon(u, new Date()), u.bilder);
      await offlineQueue().deleteDraft(u.id).catch(() => undefined);
      if (r.status === "sendt") {
        const feilet = r.resultat.vedleggFeilet;
        if (feilet > 0) {
          store.notify(
            `Inspeksjonen av ${u.objekt.navn} er sendt, men ${feilet} av ${u.bilder.length} bilder ble ikke lastet opp. Ta dem på nytt i en ny inspeksjon.`,
            "feil",
          );
        } else {
          store.notify(`Inspeksjonen av ${u.objekt.navn} er sendt`, "suksess");
        }
        dataChanged();
      } else {
        store.notify(
          r.grunn === "Enheten er frakoblet" ? "Lagret i kø – sendes automatisk når du får dekning" : `Lagret i kø og sendes på nytt automatisk. ${r.grunn}.`,
          "info",
        );
      }
      store.set({ inspeksjon: null, selection: null });
      // Erstatter skjemaet i historikken, så tilbakeknappen ikke åpner et nytt, tomt skjema
      if (this.isConnected) tilbake();
    } catch (e) {
      store.notify(`Kunne ikke sende eller lagre inspeksjonen: ${e instanceof Error ? e.message : String(e)}`, "feil");
    } finally {
      this.sender = false;
      this.requestUpdate();
    }
  }

  private async sok(q: string) {
    const nr = ++this.sokNr;
    const treff = q.trim().length >= 2 ? await services().data.search(q, 6).catch(() => []) : [];
    // Et eldre svar skal ikke overskrive et nyere søk
    if (nr !== this.sokNr) return;
    this.sokTreff = treff;
    this.requestUpdate();
  }

  protected override render() {
    const u = this.u;
    const s = this.store.state;
    return html`
      <div class="skjemaside">
        <header class="skjemaside__hode">
          <button class="ikonknapp ikonknapp--stor" aria-label="Tilbake" @click=${() => tilbake()}>${icons.back()}</button>
          <div class="skjemaside__tittel">
            <h1>Inspeksjon${u ? ` · ${u.objekt.objekt_id}` : ""}</h1>
            <span class="sekundar">${u ? [this.skjemanavn(u), u.oppgaveId].filter(Boolean).join(" · ") : "Velg objekt"}</span>
          </div>
          <span class="merke merke--noytral" title="Utkastet lagres automatisk på enheten">Utkast</span>
        </header>

        <div class="skjemaside__innhold">
          ${this.feil.length
            ? html`<div class="feiloppsummering" role="alert" tabindex="-1">
                <strong>Rett opp før innsending:</strong>
                <ul>
                  ${this.feil.map((f) => html`<li>${f}</li>`)}
                </ul>
              </div>`
            : nothing}
          ${u ? this.renderAuto(u) : nothing}
          ${this.velger || this.ingenObjekt ? this.renderVelger() : nothing}
          ${u ? this.renderFelt(u) : nothing}
          ${u
            ? html`<div class="registrert">
                <span>Registrert av: ${u.inspektor} · ${fmtDateTime(new Date().toISOString())}</span>
                <span
                  >Posisjon:
                  ${s.gps.x != null && s.gps.y != null
                    ? `${formatUtm(s.gps.x, s.gps.y)}${s.gps.noyaktighet != null ? ` (±${Math.round(s.gps.noyaktighet)} m)` : ""}`
                    : "ikke tilgjengelig"}</span
                >
              </div>`
            : nothing}
        </div>

        <div class="skjemaside__fot">
          <button class="knapp knapp--sekundar knapp--hoy" ?disabled=${!u} @click=${() => this.saveDraft()}>Lagre utkast</button>
          <button class="knapp knapp--primar knapp--hoy" ?disabled=${!u || this.sender} @click=${() => this.submit()}>
            ${this.sender ? "Sender …" : "Send inn"}
          </button>
        </div>
      </div>
    `;
  }

  private skjemanavn(u: InspeksjonUtkast): string {
    const o = this.store.state.oppgaver.find((x) => x.oppgave_id === u.oppgaveId);
    return o?.skjema ?? `Inspeksjon ${u.objekt.fag.toLowerCase()}`;
  }

  private renderAuto(u: InspeksjonUtkast) {
    return html`<section class="autoboks ${u.laast ? "" : "autoboks--opplast"}" aria-labelledby="auto-tittel">
      <div class="autoboks__hode">
        ${icons.locate(18)}
        <h2 id="auto-tittel">${u.avstand_m != null ? `Autoutfylt fra nærmeste objekt (${formatDistance(u.avstand_m)})` : "Autoutfylt fra objektet"}</h2>
      </div>
      <dl class="autoboks__felt">
        ${autoFields(u).map((f) => html`<div><dt>${f.k}</dt><dd>${f.v}</dd></div>`)}
      </dl>
      ${u.laast
        ? html`<button
            class="knapp knapp--blaa"
            @click=${() => {
              this.u = unlock(u);
              this.velger = true;
              this.requestUpdate();
            }}
          >
            Feil objekt? Velg annet
          </button>`
        : html`<p class="autoboks__hint">Feltene er låst opp. Velg riktig objekt under.</p>`}
    </section>`;
  }

  private renderVelger() {
    const naer = this.store.state.naer;
    return html`<section class="velger" aria-labelledby="velger-tittel">
      <h2 id="velger-tittel" class="felt__etikett">Velg objekt</h2>
      ${naer.length
        ? html`<ul class="velger__liste" aria-label="Objekter i nærheten">
            ${naer.map(
              (n) => html`<li>
                <button class="naerknapp" @click=${() => this.velgObjekt(n, n.avstand)}>
                  <span>${n.objekt.objekt_id} · ${n.objekt.navn}</span><span>${formatDistance(n.avstand)}</span>
                </button>
              </li>`,
            )}
          </ul>`
        : html`<p class="sekundar">Ingen objekter i nærheten. Søk etter objekt-ID eller navn.</p>`}
      <label class="felt">
        <span class="visually-hidden">Søk etter objekt</span>
        <input class="felt__input" type="search" placeholder="Søk objekt-ID eller navn" @input=${(e: Event) => this.sok((e.target as HTMLInputElement).value)} />
      </label>
      ${this.sokTreff.length
        ? html`<ul class="velger__liste" aria-label="Søkeresultater">
            ${this.sokTreff.map(
              (t) => html`<li>
                <button class="naerknapp" @click=${() => this.velgObjekt(t, null)}><span>${t.objekt.objekt_id} · ${t.objekt.navn}</span><span>${t.objekt.fag}</span></button>
              </li>`,
            )}
          </ul>`
        : nothing}
      ${this.u && !this.ingenObjekt
        ? html`<button
            class="knapp knapp--sekundar"
            @click=${() => {
              this.u = { ...this.u!, laast: true };
              this.velger = false;
              this.requestUpdate();
            }}
          >
            Behold ${this.u.objekt.objekt_id}
          </button>`
        : nothing}
    </section>`;
  }

  private renderFelt(u: InspeksjonUtkast) {
    return html`
      <fieldset class="tg">
        <legend class="felt__etikett">Tilstandsgrad <span aria-hidden="true">*</span></legend>
        <div class="tg__valg">
          ${TILSTANDSGRADER.map(
            (t) => html`<label class="tg__seg ${u.tilstandsgrad === t.tg ? "is-valgt" : ""}">
              <input
                type="radio"
                name="tilstandsgrad"
                class="visually-hidden"
                .checked=${u.tilstandsgrad === t.tg}
                @change=${() =>
                  // TG 0 er «ingen avvik»: avvikstype og konsekvensgrad fra et tidligere valg gjelder ikke lenger
                  this.set({ tilstandsgrad: t.tg as Tilstandsgrad, ...(t.tg === 0 ? { avvikstype: "Ingen avvik", konsekvensgrad: null } : {}) })}
                aria-label="TG ${t.tg} – ${t.navn}"
              />
              <span class="tg__nr" aria-hidden="true">${t.tg}</span><span class="tg__navn" aria-hidden="true">${t.navn}</span>
            </label>`,
          )}
        </div>
      </fieldset>

      ${this.renderSjekkliste(u)}

      <label class="felt">
        <span class="felt__etikett">Avvikstype <span aria-hidden="true">*</span></span>
        <select required @change=${(e: Event) => this.set({ avvikstype: (e.target as HTMLSelectElement).value })}>
          <option value="" ?selected=${!u.avvikstype}>Velg …</option>
          ${AVVIKSTYPER.map((a) => html`<option value=${a} ?selected=${u.avvikstype === a}>${a}</option>`)}
        </select>
      </label>

      <fieldset class="radiogruppe">
        <legend class="felt__etikett">Behov for tiltak <span aria-hidden="true">*</span></legend>
        <div class="radiogruppe__valg">
          ${(["ja", "nei"] as const).map(
            (v) => html`<label class="avkrysning">
              <input type="radio" name="tiltak" .checked=${u.tiltak_behov === v} @change=${() => this.set({ tiltak_behov: v })} />
              ${v === "ja" ? "Ja" : "Nei"}
            </label>`,
          )}
        </div>
      </fieldset>

      ${this.renderKonsekvens(u)}

      <label class="felt">
        <span class="felt__etikett">Kommentar</span>
        <textarea rows="3" .value=${u.kommentar} @input=${(e: Event) => this.set({ kommentar: (e.target as HTMLTextAreaElement).value })}></textarea>
      </label>

      <div class="felt">
        <span class="felt__etikett" id="bilder-tittel">Bilder (${u.bilder.length})</span>
        <div class="bildegrid" role="group" aria-labelledby="bilder-tittel">
          ${u.bilder.map(
            (b) => html`<figure class="bildegrid__bilde">
              <img src=${this.photoUrl(b)} alt="Bilde tatt ${fmtDateTime(b.tidspunkt)}" />
              <figcaption>${b.retning != null ? `${Math.round(b.retning)}°` : ""}</figcaption>
              <button
                class="ikonknapp ikonknapp--liten bildegrid__fjern"
                aria-label="Fjern bilde"
                @click=${() => this.set({ bilder: u.bilder.filter((x) => x.id !== b.id) })}
              >
                ${icons.close(14)}
              </button>
            </figure>`,
          )}
          <label class="bildegrid__ny">
            <input class="visually-hidden" type="file" accept="image/*" capture="environment" multiple @change=${this.onPhotos} />
            ${icons.camera(24)}<span>Ta bilde</span>
          </label>
        </div>
        <span class="sekundar">Bildene får posisjon og retning automatisk.</span>
      </div>
    `;
  }
}

customElements.define("svv-inspection-form", SvvInspectionForm);
