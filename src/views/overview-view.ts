import { html, nothing } from "lit";
import type { ObjektStat, ObjektTreff } from "../data/DataService.ts";
import { FAG, type Inspeksjon } from "../data/schema.ts";
import { PHASES, phaseRange } from "../filters/mmi.ts";
import { andelInspisertSiste12, avviksliste, fristerPerFag, latestPerObject, type FristRad, perMaaned, phasePerFag, statusPerFag, tgFordeling } from "../reports/stats.ts";
import { services } from "../services.ts";
import { navigate } from "../state/router.ts";
import { store, velgObjekter } from "../state/store.ts";
import { dataChanged, ensureTasks } from "../tasks/task-store.ts";
import { isOpen, isoDay, taskStats } from "../tasks/tasks.ts";
import { StoreElement, fmtDate } from "../ui/base.ts";
import { columns, stackedBars } from "../ui/charts.ts";
import { tgTekst } from "../ui/object-panel.ts";
import { FRIST_KLASSE, FRIST_TEKST } from "../ui/driftskrav.ts";
import { intervallKort } from "../handbok/r610.ts";

const PLAN_ANTALL = 12;

/** Kontor: oversikt med nøkkeltall, tilstand, MMI-fremdrift, aktivitet og avviksliste. */
export class SvvOverviewView extends StoreElement {
  private stats: ObjektStat[] = [];
  private insp: Inspeksjon[] = [];
  private navn = new Map<string, ObjektTreff | null>();
  private loadedVersion = -1;
  /** Objekter med en oppgave som opprettes nå (hindrer dobbeltklikk og duplikater) */
  private opptatt = new Set<string>();

  override connectedCallback(): void {
    super.connectedCallback();
    void ensureTasks();
  }

  protected override willUpdate(): void {
    const v = this.store.state.dataVersjon;
    if (v !== this.loadedVersion) {
      this.loadedVersion = v;
      void this.load();
    }
  }

  private async load() {
    const { data } = services();
    [this.stats, this.insp] = await Promise.all([data.objectStats(), data.allInspections()]);
    const plan = fristerPerFag(this.stats, latestPerObject(this.insp), new Date()).rader.slice(0, PLAN_ANTALL).map((r) => r.globalid);
    const avvik = [...this.stats.filter((s) => s.status_inspeksjon === "Avvik").map((s) => s.globalid), ...plan];
    await Promise.all(avvik.filter((id) => !this.navn.has(id)).map(async (id) => this.navn.set(id, await data.getObject(id).catch(() => null))));
    this.requestUpdate();
  }

  private async opprettOppgave(globalid: string, i: Inspeksjon | null) {
    const { data } = services();
    const obj = this.navn.get(globalid)?.objekt;
    if (!obj) {
      store.notify("Objektet er ikke lastet ennå – prøv igjen om et øyeblikk", "feil");
      return;
    }
    if (this.opptatt.has(globalid)) return;
    this.opptatt.add(globalid);
    this.requestUpdate();
    const frist = new Date();
    frist.setDate(frist.getDate() + (i && i.tilstandsgrad >= 3 ? 7 : 14));
    try {
      const id = await data.createTask({
        tittel: `Utbedre avvik: ${i?.avvikstype && i.avvikstype !== "Ingen avvik" ? i.avvikstype.toLowerCase() : "registrert avvik"}`,
        beskrivelse: i?.kommentar || (i ? `Avvik registrert ved inspeksjon ${fmtDate(i.tidspunkt)}.` : "Avvik registrert ved inspeksjon."),
        objekt_globalid: globalid,
        fag: obj.fag,
        frist: isoDay(frist),
        prioritet: i && i.tilstandsgrad >= 3 ? "Høy" : "Middels",
        status: "Ny",
        tildelt: data.user.navn,
        skjema: null,
      });
      store.notify(`Oppgave ${id} er opprettet for ${obj.navn}`, "suksess");
      dataChanged();
    } catch (e) {
      store.notify(`Kunne ikke opprette oppgave: ${e instanceof Error ? e.message : String(e)}`, "feil");
    } finally {
      this.opptatt.delete(globalid);
      this.requestUpdate();
    }
  }

  private async planleggInspeksjon(r: FristRad) {
    const { data } = services();
    const obj = this.navn.get(r.globalid)?.objekt;
    if (!obj) {
      store.notify("Objektet er ikke lastet ennå – prøv igjen om et øyeblikk", "feil");
      return;
    }
    if (this.opptatt.has(r.globalid)) return;
    this.opptatt.add(r.globalid);
    this.requestUpdate();
    const idag = new Date();
    const frist = r.frist && r.frist > idag ? r.frist : new Date(idag.getTime() + 14 * 86_400_000);
    try {
      const id = await data.createTask({
        tittel: `Inspeksjon etter R610 (${intervallKort(r.intervallMnd)})`,
        beskrivelse: `Periodisk inspeksjon av ${obj.objekttype.toLowerCase()} etter R610:2025.${r.siste ? ` Sist inspisert ${fmtDate(r.siste.tidspunkt)}.` : ""}`,
        objekt_globalid: r.globalid,
        fag: obj.fag,
        frist: isoDay(frist),
        prioritet: r.status === "forfalt" ? "Høy" : "Middels",
        status: "Ny",
        tildelt: data.user.navn,
        skjema: null,
      });
      store.notify(`Oppgave ${id} er opprettet for ${obj.navn}`, "suksess");
      dataChanged();
    } catch (e) {
      store.notify(`Kunne ikke opprette oppgave: ${e instanceof Error ? e.message : String(e)}`, "feil");
    } finally {
      this.opptatt.delete(r.globalid);
      this.requestUpdate();
    }
  }

  protected override render() {
    const s = this.store.state;
    const today = new Date();
    const latest = latestPerObject(this.insp);
    const andel = andelInspisertSiste12(this.stats, latest, today);
    const avvik = avviksliste(this.stats, latest);
    const ts = taskStats(s.oppgaver, today);
    const status = statusPerFag(this.stats);
    const faser = phasePerFag(this.stats);
    const tg = tgFordeling(latest.values());
    const mnd = perMaaned(this.insp, today);
    const frister = fristerPerFag(this.stats, latest, today);
    const sumFrist = (g: "forfalt" | "snart") => FAG.reduce((a, f) => a + frister.perFag[f][g], 0);
    const apenOppgave = (gid: string) => s.oppgaver.find((o) => o.objekt_globalid === gid && isOpen(o));

    return html`<div class="oversikt">
      <header class="oversikt__hode">
        <div>
          <h1>Oversikt</h1>
          <p class="sekundar">Tilstand og fremdrift – ${services().cfg.prosjekt.navn} · per ${fmtDate(today.toISOString())}</p>
        </div>
        <button class="knapp knapp--sekundar" @click=${() => window.print()}>Skriv ut rapport</button>
      </header>

      <dl class="nokkelkort">
        <div class="nokkelkort__kort"><dt>OBJEKTER</dt><dd>${this.stats.length.toLocaleString("nb-NO")}</dd></div>
        <div class="nokkelkort__kort nokkelkort__kort--blaa">
          <dt>INSPISERT SISTE 12 MND.</dt>
          <dd>${Math.round(andel * 100)} %</dd>
        </div>
        <div class="nokkelkort__kort nokkelkort__kort--rod"><dt>OBJEKTER MED AVVIK</dt><dd>${avvik.length}</dd></div>
        <div class="nokkelkort__kort">
          <dt>INSPEKSJON FORFALT (R610)</dt>
          <dd>${sumFrist("forfalt")}${sumFrist("snart") ? html` <small>(+${sumFrist("snart")} innen 30 dager)</small>` : nothing}</dd>
        </div>
        <div class="nokkelkort__kort nokkelkort__kort--oransje">
          <dt>ÅPNE OPPGAVER</dt>
          <dd>${ts.apne}${ts.overFrist ? html` <small>(${ts.overFrist} over frist)</small>` : nothing}</dd>
        </div>
      </dl>

      <div class="oversikt__grid">
        <section class="kort" aria-labelledby="ov-status">
          <h2 id="ov-status">Inspeksjonsstatus per fag</h2>
          ${stackedBars(
            FAG.map((f) => ({
              label: f,
              segments: [
                { key: "OK", label: "OK", value: status[f].OK, color: "#1d7721" },
                { key: "Ikke inspisert", label: "Ikke inspisert", value: status[f]["Ikke inspisert"], color: "#697277" },
                { key: "Avvik", label: "Avvik", value: status[f].Avvik, color: "#b63434", hatch: true },
              ],
            })),
            { title: "Inspeksjonsstatus per fag" },
          )}
        </section>

        <section class="kort" aria-labelledby="ov-mmi">
          <h2 id="ov-mmi">MMI-fremdrift per fag</h2>
          ${stackedBars(
            FAG.map((f) => ({
              label: f,
              segments: PHASES.map((p) => ({ key: p.id, label: `${p.navn} (${phaseRange(p)})`, value: faser[f][p.id], color: p.farge })),
            })),
            { title: "MMI-fremdrift per fag" },
          )}
        </section>

        <section class="kort" aria-labelledby="ov-frist">
          <h2 id="ov-frist">Inspeksjonsfrist etter R610:2025</h2>
          ${stackedBars(
            FAG.map((f) => ({
              label: f,
              segments: [
                { key: "ok", label: "I rute", value: frister.perFag[f].ok, color: "#1d7721" },
                { key: "snart", label: "Forfaller innen 30 dager", value: frister.perFag[f].snart, color: "#e27500" },
                { key: "aldri", label: "Aldri inspisert", value: frister.perFag[f].aldri, color: "#697277" },
                { key: "forfalt", label: "Forfalt", value: frister.perFag[f].forfalt, color: "#b63434", hatch: true },
              ],
            })),
            { title: "Inspeksjonsfrist etter R610:2025 per fag" },
          )}
          <p class="sekundar liten">Intervall per objekttype fra R610:2025 (f.eks. stikkrenne hvert 5. år, rekkverk og skilt hver 12. måned), regnet fra siste inspeksjon.</p>
        </section>

        <section class="kort" aria-labelledby="ov-tg">
          <h2 id="ov-tg">Tilstandsgrad i siste inspeksjon</h2>
          ${columns(
            tg.map((n, i) => ({ label: `TG ${i} – ${tgTekst(i)}`, value: n })),
            { title: "Antall objekter per tilstandsgrad i siste inspeksjon", color: "#065e7f", unit: "objekter" },
          )}
        </section>

        <section class="kort" aria-labelledby="ov-mnd">
          <h2 id="ov-mnd">Inspeksjoner per måned</h2>
          ${columns(
            mnd.map((m) => ({ label: m.label, value: m.n })),
            { title: "Antall inspeksjoner per måned, siste 12 måneder", color: "#077197", unit: "inspeksjoner" },
          )}
        </section>
      </div>

      <section class="kort kort--bred" aria-labelledby="ov-avvik">
        <div class="kort__hode">
          <h2 id="ov-avvik">Avvik</h2>
          <span class="sekundar">${avvik.length} objekter, alvorligste først</span>
        </div>
        <div class="tabellramme">
          <table class="tabell">
            <caption class="visually-hidden">Objekter med avvik</caption>
            <thead>
              <tr>
                <th scope="col">Objekt</th>
                <th scope="col">Fag</th>
                <th scope="col">TG</th>
                <th scope="col">Avvikstype</th>
                <th scope="col">Kommentar</th>
                <th scope="col">Inspisert</th>
                <th scope="col">Oppgave</th>
              </tr>
            </thead>
            <tbody>
              ${avvik.map((r) => {
                const o = this.navn.get(r.globalid)?.objekt;
                const opg = apenOppgave(r.globalid);
                return html`<tr>
                  <td>
                    <a
                      href="?objekt=${o?.objekt_id ?? ""}#/kart"
                      @click=${(e: Event) => {
                        e.preventDefault();
                        velgObjekter([r.globalid], { zoom: true });
                        navigate("kart");
                      }}
                      >${o?.navn ?? "…"}</a
                    >
                  </td>
                  <td>${r.fag}</td>
                  <td>${r.siste ? html`<span class="pille ${r.siste.tilstandsgrad >= 3 ? "pille--rod" : "pille--oransje"}">TG ${r.siste.tilstandsgrad}</span>` : "–"}</td>
                  <td>${r.siste?.avvikstype ?? "–"}</td>
                  <td class="tabell__tekst">${r.siste?.kommentar ?? ""}</td>
                  <td>${r.siste ? `${fmtDate(r.siste.tidspunkt)} · ${r.siste.inspektor}` : "–"}</td>
                  <td>
                    ${opg
                      ? html`<a
                          href="#/oppgaver"
                          @click=${(e: Event) => {
                            e.preventDefault();
                            store.set({ oppgaveValgt: opg.oppgave_id });
                            navigate("oppgaver");
                          }}
                          >${opg.oppgave_id}</a
                        >`
                      : html`<button class="knapp knapp--sekundar knapp--liten" ?disabled=${this.opptatt.has(r.globalid)} @click=${() => this.opprettOppgave(r.globalid, r.siste)}>
                          ${this.opptatt.has(r.globalid) ? "Oppretter …" : "Opprett oppgave"}
                        </button>`}
                  </td>
                </tr>`;
              })}
              ${avvik.length ? nothing : html`<tr><td colspan="7" class="tom">Ingen registrerte avvik.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>

      <section class="kort kort--bred" aria-labelledby="ov-plan">
        <div class="kort__hode">
          <h2 id="ov-plan">Inspeksjonsplan (R610:2025)</h2>
          <span class="sekundar">Neste ${PLAN_ANTALL} frister, regnet fra siste inspeksjon</span>
        </div>
        <div class="tabellramme">
          <table class="tabell">
            <caption class="visually-hidden">Neste inspeksjonsfrister etter R610</caption>
            <thead>
              <tr>
                <th scope="col">Objekt</th>
                <th scope="col">Type</th>
                <th scope="col">Intervall</th>
                <th scope="col">Sist inspisert</th>
                <th scope="col">Frist</th>
                <th scope="col">Status</th>
                <th scope="col">Oppgave</th>
              </tr>
            </thead>
            <tbody>
              ${frister.rader.slice(0, PLAN_ANTALL).map((r) => {
                const o = this.navn.get(r.globalid)?.objekt;
                const opg = apenOppgave(r.globalid);
                return html`<tr>
                  <td>
                    <a
                      href="?objekt=${o?.objekt_id ?? ""}#/kart"
                      @click=${(e: Event) => {
                        e.preventDefault();
                        velgObjekter([r.globalid], { zoom: true });
                        navigate("kart");
                      }}
                      >${o?.navn ?? "…"}</a
                    >
                  </td>
                  <td>${r.objekttype}</td>
                  <td>${intervallKort(r.intervallMnd)}</td>
                  <td>${r.siste ? fmtDate(r.siste.tidspunkt) : "Aldri"}</td>
                  <td>${r.frist ? fmtDate(r.frist.toISOString()) : "Snarest"}</td>
                  <td><span class="pille ${FRIST_KLASSE[r.status]}">${FRIST_TEKST[r.status]}</span></td>
                  <td>
                    ${opg
                      ? html`<a
                          href="#/oppgaver"
                          @click=${(e: Event) => {
                            e.preventDefault();
                            store.set({ oppgaveValgt: opg.oppgave_id });
                            navigate("oppgaver");
                          }}
                          >${opg.oppgave_id}</a
                        >`
                      : html`<button
                          class="knapp knapp--sekundar knapp--liten"
                          aria-label="Planlegg inspeksjon av ${o?.navn ?? r.objekttype}"
                          ?disabled=${this.opptatt.has(r.globalid)}
                          @click=${() => this.planleggInspeksjon(r)}
                        >
                          ${this.opptatt.has(r.globalid) ? "Oppretter …" : "Planlegg"}
                        </button>`}
                  </td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>`;
  }
}

customElements.define("svv-overview-view", SvvOverviewView);
