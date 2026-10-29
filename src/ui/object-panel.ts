import { html, nothing } from "lit";
import type { ObjektTreff } from "../data/DataService.ts";
import type { Dokument, HistorikkPost, Inspeksjon, Objekt } from "../data/schema.ts";
import { mmiBadgeText, phaseOf } from "../filters/mmi.ts";
import { services } from "../services.ts";
import { navigate, objectLink, setObjectParam } from "../state/router.ts";
import { store } from "../state/store.ts";
import { isOpen } from "../tasks/tasks.ts";
import { StoreElement, fmtDate, fmtDateTime, fmtNumber } from "./base.ts";
import { icons } from "./icons.ts";

type Tab = "oversikt" | "dokumenter" | "inspeksjoner" | "historikk";

export const TG_FARGE = ["#1d7721", "#e27500", "#e27500", "#b63434"] as const;
export const tgTekst = (tg: number) => (tg === 0 ? "OK" : tg === 1 ? "Mindre avvik" : tg === 2 ? "Avvik" : "Alvorlig avvik");

/** Starter inspeksjon av et objekt (med eventuell åpen oppgave). */
export function startInspection(globalid: string): void {
  const oppgave = store
    .get()
    .oppgaver.filter((o) => o.objekt_globalid === globalid && isOpen(o))
    .sort((a, b) => a.frist.localeCompare(b.frist))[0];
  store.set({ inspeksjon: { globalid, oppgaveId: oppgave?.oppgave_id ?? null } });
  navigate("inspeksjon");
}

/** Objektpanel til høyre: tittel, merker, nøkkeltall, handlinger og faner. */
export class SvvObjectPanel extends StoreElement {
  static override properties = { dim: { type: String } };
  declare dim: "2d" | "3d";

  private tab: Tab = "oversikt";
  private loadedFor: string | null = null;
  private treff: ObjektTreff | null = null;
  private docs: Dokument[] = [];
  private insp: Inspeksjon[] = [];
  private hist: HistorikkPost[] = [];


  private get currentId(): string | null {
    const sel = this.store.state.selection;
    return sel ? (sel.globalids[sel.index] ?? null) : null;
  }

  protected override willUpdate(): void {
    const id = this.currentId;
    const key = `${id}:${this.store.state.dataVersjon}`;
    if (id && key !== this.loadedFor) {
      this.loadedFor = key;
      void this.load(id);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    setObjectParam(null);
  }

  private async load(id: string) {

    const { data } = services();
    const t = await data.getObject(id);
    if (this.currentId !== id) return;
    this.treff = t;
    if (t) {
      setObjectParam(t.objekt.objekt_id);
      const [docs, insp] = await Promise.all([data.getDocuments(id), data.getInspections(id)]);
      if (this.currentId !== id) return;
      this.docs = docs;
      this.insp = insp;
      this.hist = await data.getHistory(t.objekt);
    }

    this.requestUpdate();
  }

  private step(d: 1 | -1) {
    const sel = this.store.state.selection;
    if (!sel) return;
    const n = sel.globalids.length;
    store.set({ selection: { ...sel, index: (sel.index + d + n) % n } });
  }

  private async share(o: Objekt) {
    const url = objectLink(o.objekt_id);
    try {
      await navigator.clipboard.writeText(url);
      store.notify("Lenke til objektet er kopiert", "suksess");
    } catch {
      store.notify(`Kopier lenken: ${url}`, "info");
    }
  }

  protected override render() {
    const sel = this.store.state.selection;
    const t = this.treff;
    if (!sel) return nothing;
    if (!t) {
      return html`<aside class="objektpanel" aria-label="Objektinformasjon"><div class="laster" role="status">Laster objekt …</div></aside>`;
    }
    const o = t.objekt;
    const fase = phaseOf(o.mmi);
    const neste = this.store.state.oppgaver
      .filter((x) => x.objekt_globalid === o.globalid && isOpen(x))
      .sort((a, b) => a.frist.localeCompare(b.frist))[0];
    const statusCls = o.status_inspeksjon === "OK" ? "merke--ok" : o.status_inspeksjon === "Avvik" ? "merke--avvik" : "merke--noytral";
    const statusTekst = o.status_inspeksjon === "OK" ? "Inspisert · OK" : o.status_inspeksjon === "Avvik" ? "Inspisert · Avvik" : "Ikke inspisert";

    return html`
      <aside class="objektpanel" aria-labelledby="objekt-tittel">
        <div class="objektpanel__topp">
          <div class="objektpanel__sti">
            <nav aria-label="Plassering i fagstrukturen" class="sti">
              <span>${o.fag}</span><span aria-hidden="true">›</span><span>${o.fagmodell ?? "–"}</span><span aria-hidden="true">›</span><span>${o.objekttype}</span>
            </nav>
            <span class="objektpanel__fyll"></span>
            ${sel.globalids.length > 1
              ? html`<button class="ikonknapp ikonknapp--ramme" aria-label="Forrige treff" @click=${() => this.step(-1)}>${icons.chevronLeft()}</button>
                  <span aria-live="polite">${sel.index + 1} av ${sel.globalids.length}</span>
                  <button class="ikonknapp ikonknapp--ramme" aria-label="Neste treff" @click=${() => this.step(1)}>${icons.chevronRight()}</button>`
              : nothing}
            <button class="ikonknapp" aria-label="Lukk objektpanel" @click=${() => store.set({ selection: null })}>${icons.close()}</button>
          </div>
          <div>
            <h2 id="objekt-tittel" class="objektpanel__tittel">${o.navn}</h2>
            <div class="objektpanel__undertittel">${o.objekt_id} · ${o.objekttype}</div>
          </div>
          <div class="merker">
            <span class="merke merke--mmi" style="--fase:${fase?.farge ?? "#858d90"}">
              <span class="farge" style="background:${fase?.farge ?? "#858d90"}" aria-hidden="true"></span>${mmiBadgeText(o.mmi)}
            </span>
            <span class="merke ${statusCls}">${statusTekst}</span>
            <span class="merke merke--ramme">Rev. ${o.revisjon ?? "–"}</span>
          </div>
          <dl class="nokkeltall">
            <div><dt>Lengde</dt><dd>${o.lengde_m != null ? `${fmtNumber(o.lengde_m)} m` : "–"}</dd></div>
            <div><dt>Kote min–maks</dt><dd>${fmtNumber(o.kote_min)}–${fmtNumber(o.kote_max)}</dd></div>
            <div><dt>Vegreferanse</dt><dd class="liten">${o.vegreferanse ?? "–"}</dd></div>
            <div><dt>Neste inspeksjon</dt><dd class="liten">${neste ? `${fmtDate(neste.frist)} · ${neste.oppgave_id}` : "Ikke planlagt"}</dd></div>
          </dl>
          <button class="knapp knapp--primar knapp--full" @click=${() => startInspection(o.globalid)}>Start inspeksjon</button>
          <div class="knapperad knapperad--tre">
            ${this.dim === "3d"
              ? html`<button class="knapp knapp--sekundar" @click=${() => navigate("kart")}>Vis i 2D</button>`
              : html`<button class="knapp knapp--sekundar" @click=${() => {
                  store.set({ zoomTil: o.globalid });
                  navigate("3d");
                }}>Vis i 3D</button>`}
            <button class="knapp knapp--sekundar" @click=${() => store.set({ zoomTil: o.globalid })}>Zoom til</button>
            <button class="knapp knapp--sekundar" @click=${() => this.share(o)}>${icons.link(16)} Del lenke</button>
          </div>
        </div>

        <div role="tablist" class="faner faner--panel" aria-label="Objektdetaljer">
          ${(
            [
              ["oversikt", "Oversikt"],
              ["dokumenter", `Dokumenter ${this.docs.length}`],
              ["inspeksjoner", `Inspeksjoner ${this.insp.length}`],
              ["historikk", "Historikk"],
            ] as [Tab, string][]
          ).map(
            ([id, label]) => html`<button
              role="tab"
              id="objfane-${id}"
              class="fane ${this.tab === id ? "is-valgt" : ""}"
              aria-selected=${this.tab === id}
              aria-controls="objektpanel-fane"
              tabindex=${this.tab === id ? 0 : -1}
              @click=${() => {
                this.tab = id;
                this.requestUpdate();
              }}
            >
              ${label}
            </button>`,
          )}
        </div>
        <div id="objektpanel-fane" class="objektpanel__fane" role="tabpanel" aria-labelledby="objfane-${this.tab}">
          ${this.tab === "oversikt" ? this.renderOversikt(o) : nothing}
          ${this.tab === "dokumenter" ? this.renderDocs() : nothing}
          ${this.tab === "inspeksjoner" ? this.renderInsp() : nothing}
          ${this.tab === "historikk" ? this.renderHist() : nothing}
        </div>
      </aside>
    `;
  }

  private renderOversikt(o: Objekt) {
    const sections: { title: string; rows: [string, string][] }[] = [
      ...(this.dim === "3d"
        ? [{ title: "IFC", rows: [["IFC-klasse", o.ifc_klasse ?? "–"], ["GlobalId", o.ifc_guid ?? "–"], ["Modellfil", o.modellfil ?? "–"]] as [string, string][] }]
        : []),
      {
        title: o.fag === "VA" ? "RØR" : "OBJEKT",
        rows: [
          ["Objekt-ID", o.objekt_id],
          ["Objekttype", o.objekttype],
          ["Fag", o.fag],
          ["MMI", o.mmi != null ? String(o.mmi).padStart(3, "0") : "–"],
        ],
      },
      { title: "MENGDE", rows: [["Lengde", o.lengde_m != null ? `${fmtNumber(o.lengde_m)} m` : "–"]] },
      {
        title: "PLASSERING",
        rows: [
          ["Vegreferanse", o.vegreferanse ?? "–"],
          ["Kote (min–maks)", `${fmtNumber(o.kote_min)} – ${fmtNumber(o.kote_max)}`],
          ["Prosjekt", o.prosjekt ?? "–"],
        ],
      },
      {
        title: "KILDE",
        rows: [
          ["Fagmodell", o.fagmodell ?? "–"],
          ["Modellfil", o.modellfil ?? "–"],
          ["Modellert av", o.modellert_av ?? "–"],
          ["Revisjon", `${o.revisjon ?? "–"} (${fmtDate(o.rev_dato)})`],
          ["Lastet inn", fmtDateTime(o.lastet_inn)],
          ...(this.dim === "2d" ? ([["IFC GlobalId", o.ifc_guid ?? "–"]] as [string, string][]) : []),
        ],
      },
    ];
    return html`${sections.map(
      (s) => html`<section class="egenskaper">
        <h3 class="kategori">${s.title}</h3>
        <dl>
          ${s.rows.map(([k, v]) => html`<div class="egenskaper__rad"><dt>${k}</dt><dd>${v}</dd></div>`)}
        </dl>
      </section>`,
    )}`;
  }

  private renderDocs() {
    if (!this.docs.length) return html`<p class="tom">Ingen dokumenter er knyttet til objektet.</p>`;
    return html`<ul class="dokliste">
      ${this.docs.map(
        (d) => html`<li>
          <a class="dok" href=${d.url} target="_blank" rel="noopener">
            <span class="dok__ikon" aria-hidden="true">${d.type === "FDV" ? "FDV" : "PDF"}</span>
            <span class="dok__tekst"
              ><span class="dok__tittel">${d.tittel}</span><span class="dok__meta">${d.type}${d.revisjon ? ` · Rev. ${d.revisjon}` : ""}</span></span
            >
            ${icons.external()}<span class="visually-hidden">(åpnes i ny fane)</span>
          </a>
        </li>`,
      )}
    </ul>`;
  }

  private renderInsp() {
    if (!this.insp.length) return html`<p class="tom">Objektet er ikke inspisert ennå.</p>`;
    return html`<ol class="tidslinje">
      ${this.insp.map(
        (i) => html`<li class="tidslinje__punkt">
          <span class="tidslinje__prikk" style="background:${TG_FARGE[i.tilstandsgrad]}" aria-hidden="true"></span>
          <div class="tidslinje__innhold">
            <div class="tidslinje__hode"><strong>${tgTekst(i.tilstandsgrad)} · TG ${i.tilstandsgrad}</strong><span>${fmtDate(i.tidspunkt)}</span></div>
            ${i.avvikstype && i.avvikstype !== "Ingen avvik" ? html`<span>${i.avvikstype}</span>` : nothing}
            <span>${i.kommentar || "Ingen kommentar."}</span>
            <span class="sekundar">${i.inspektor} · ${i.antall_bilder ?? 0} bilder</span>
            ${i.antall_bilder
              ? html`<div class="bilderad" aria-label="${i.antall_bilder} bilder">
                  ${Array.from({ length: Math.min(4, i.antall_bilder) }, (_, k) => html`<span class="bilderad__bilde">Bilde ${k + 1}</span>`)}
                </div>`
              : nothing}
          </div>
        </li>`,
      )}
    </ol>`;
  }

  private renderHist() {
    return html`<ul class="historikk">
      ${this.hist.map((h) => html`<li><span class="historikk__tid">${fmtDateTime(h.tidspunkt)}</span><span>${h.tekst}</span></li>`)}
    </ul>`;
  }
}

customElements.define("svv-object-panel", SvvObjectPanel);

