import { html, nothing } from "lit";
import type { ObjektTreff } from "../data/DataService.ts";
import type { Dokument, Inspeksjon } from "../data/schema.ts";
import { driftskrav, intervallKort, nesteInspeksjon } from "../handbok/r610.ts";
import { mmiBadgeText } from "../filters/mmi.ts";
import { formatUtm } from "../map/coords.ts";
import { services } from "../services.ts";
import { navigate, setObjectParam } from "../state/router.ts";
import { ensureTasks } from "../tasks/task-store.ts";
import { isOpen } from "../tasks/tasks.ts";
import { StoreElement, fmtDate, fmtDateTime, fmtNumber } from "../ui/base.ts";
import { FRIST_KLASSE, FRIST_TEKST } from "../ui/driftskrav.ts";
import { icons } from "../ui/icons.ts";
import { kildeFraTreff } from "../ui/lengdeprofil.ts";
import "../ui/nvdb-naer.ts";
import { tgTekst } from "../ui/object-panel.ts";

/**
 * Objektrapport for utskrift/PDF: objektdata, driftskrav (R610), lengdeprofil,
 * inspeksjonshistorikk, oppgaver, dokumenter og NVDB-objekter i nærheten.
 */
export class SvvReportView extends StoreElement {
  private treff: ObjektTreff | null = null;
  private insp: Inspeksjon[] = [];
  private docs: Dokument[] = [];
  private lastetFor: string | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    void ensureTasks();
  }

  private get valgtId(): string | null {
    const sel = this.store.state.selection;
    return sel ? (sel.globalids[sel.index] ?? null) : null;
  }

  protected override willUpdate(): void {
    const id = this.valgtId;
    const key = `${id}:${this.store.state.dataVersjon}`;
    if (id && key !== this.lastetFor) {
      this.lastetFor = key;
      void this.load(id);
    }
  }

  private async load(id: string) {
    const { data } = services();
    const [t, insp, docs] = await Promise.all([data.getObject(id), data.getInspections(id), data.getDocuments(id)]);
    if (this.valgtId !== id) return;
    this.treff = t;
    if (t) setObjectParam(t.objekt.objekt_id);
    this.insp = [...insp].sort((a, b) => b.tidspunkt.localeCompare(a.tidspunkt));
    this.docs = docs;
    this.requestUpdate();
  }

  protected override render() {
    if (!this.valgtId) {
      return html`<div class="rapport"><p class="tom">Velg et objekt i kartet og trykk «Rapport».</p>
        <button class="knapp knapp--primar" @click=${() => navigate("kart")}>Til kartet</button></div>`;
    }
    const t = this.treff;
    if (!t) return html`<div class="laster" role="status">Laster rapport …</div>`;
    const o = t.objekt;
    const { cfg, data } = services();
    const krav = driftskrav(o);
    const siste = this.insp[0] ?? null;
    const n = nesteInspeksjon(siste?.tidspunkt ?? null, krav?.intervallMnd ?? null, new Date());
    const oppgaver = this.store.state.oppgaver.filter((x) => x.objekt_globalid === o.globalid);
    const c = t.geometry.extent?.center ?? (t.geometry.type === "point" ? (t.geometry as unknown as { x: number; y: number }) : null);
    const rad = (k: string, v: string) => html`<div class="egenskaper__rad"><dt>${k}</dt><dd>${v}</dd></div>`;

    return html`<article class="rapport" aria-labelledby="rapport-tittel">
      <div class="rapport__verktoy">
        <button class="knapp knapp--sekundar" @click=${() => navigate("kart")}>${icons.back(16)} Tilbake til kartet</button>
        <button class="knapp knapp--primar" @click=${() => window.print()}>${icons.print(16)} Skriv ut / lagre som PDF</button>
      </div>

      <header class="rapport__hode">
        <div>
          <p class="kategori">OBJEKTRAPPORT · ${cfg.prosjekt.navn.toUpperCase()}</p>
          <h1 id="rapport-tittel">${o.navn}</h1>
          <p class="sekundar">${o.objekt_id} · ${o.fag} · ${o.objekttype} · ${mmiBadgeText(o.mmi)}</p>
        </div>
        <div>
          <img class="rapport__logo" src="${import.meta.env.BASE_URL}svv-logo-print.svg" alt="Statens vegvesen" width="110" height="58" />
          <dl class="rapport__meta">
            ${rad("Utskrevet", fmtDateTime(new Date().toISOString()))}
            ${rad("Av", data.user.navn)}
          </dl>
        </div>
      </header>

      <div class="rapport__grid">
        <section class="egenskaper">
          <h2 class="kategori">OBJEKT</h2>
          <dl>
            ${rad("Vegreferanse", o.vegreferanse ?? "–")}
            ${rad("Posisjon", c ? formatUtm(c.x, c.y) : "–")}
            ${rad("Lengde", o.lengde_m != null ? `${fmtNumber(o.lengde_m)} m` : "–")}
            ${rad("Kote (min–maks)", `${fmtNumber(o.kote_min)} – ${fmtNumber(o.kote_max)}`)}
            ${rad("Fagmodell", o.fagmodell ?? "–")}
            ${rad("Modellfil", o.modellfil ?? "–")}
            ${rad("Revisjon", `${o.revisjon ?? "–"} (${fmtDate(o.rev_dato)})`)}
            ${rad("IFC GlobalId", o.ifc_guid ?? "–")}
          </dl>
        </section>

        <section class="egenskaper">
          <h2 class="kategori">TILSTAND OG FRIST</h2>
          <dl>
            ${rad("Status", o.status_inspeksjon)}
            ${rad("Siste inspeksjon", siste ? `${fmtDate(siste.tidspunkt)} · TG ${siste.tilstandsgrad} (${tgTekst(siste.tilstandsgrad)})` : "Aldri")}
            ${rad("Intervall (R610:2025)", krav ? intervallKort(krav.intervallMnd) : "–")}
            <div class="egenskaper__rad">
              <dt>Neste frist</dt>
              <dd>${n.frist ? `${fmtDate(n.frist.toISOString())} ` : ""}<span class="pille ${FRIST_KLASSE[n.status]}">${FRIST_TEKST[n.status]}</span></dd>
            </div>
            ${rad("Åpne oppgaver", String(oppgaver.filter(isOpen).length))}
          </dl>
          ${krav ? html`<p class="kravliste__kilde">${krav.intervallKilde}</p>` : nothing}
        </section>
      </div>

      ${t.geometry.type === "polyline"
        ? html`<section class="rapport__seksjon"><svv-lengdeprofil .kilde=${kildeFraTreff(t)}></svv-lengdeprofil></section>`
        : nothing}

      <section class="rapport__seksjon">
        <h2 class="kategori">INSPEKSJONSHISTORIKK (${this.insp.length})</h2>
        ${this.insp.length
          ? html`<table class="tabell tabell--kompakt">
              <caption class="visually-hidden">Inspeksjoner av ${o.navn}</caption>
              <thead><tr><th scope="col">Dato</th><th scope="col">TG</th><th scope="col">Avvik</th><th scope="col">Tiltak</th><th scope="col">Kommentar</th><th scope="col">Inspektør</th></tr></thead>
              <tbody>
                ${this.insp.map(
                  (i) => html`<tr>
                    <td>${fmtDate(i.tidspunkt)}</td>
                    <td>TG ${i.tilstandsgrad}${i.konsekvensgrad != null ? html`<br /><span class="sekundar">KG ${i.konsekvensgrad}</span>` : nothing}</td>
                    <td>${i.avvikstype}</td>
                    <td>${i.tiltak_behov === "ja" ? "Ja" : "Nei"}</td>
                    <td class="tabell__tekst">${i.kommentar || "–"}${i.sjekkliste ? html`<pre class="rapport__sjekkliste">${i.sjekkliste}</pre>` : nothing}</td>
                    <td>${i.inspektor}</td>
                  </tr>`,
                )}
              </tbody>
            </table>`
          : html`<p class="tom">Objektet er ikke inspisert.</p>`}
      </section>

      <section class="rapport__seksjon">
        <h2 class="kategori">OPPGAVER (${oppgaver.length})</h2>
        ${oppgaver.length
          ? html`<table class="tabell tabell--kompakt">
              <caption class="visually-hidden">Oppgaver for ${o.navn}</caption>
              <thead><tr><th scope="col">ID</th><th scope="col">Tittel</th><th scope="col">Frist</th><th scope="col">Prioritet</th><th scope="col">Status</th><th scope="col">Tildelt</th></tr></thead>
              <tbody>
                ${oppgaver.map(
                  (x) => html`<tr><td>${x.oppgave_id}</td><td>${x.tittel}</td><td>${fmtDate(x.frist)}</td><td>${x.prioritet}</td><td>${x.status}</td><td>${x.tildelt}</td></tr>`,
                )}
              </tbody>
            </table>`
          : html`<p class="tom">Ingen oppgaver.</p>`}
      </section>

      ${krav && krav.sjekkpunkter.length
        ? html`<section class="rapport__seksjon">
            <h2 class="kategori">SJEKKPUNKTER VED INSPEKSJON · ${krav.type.toUpperCase()}</h2>
            <ul class="kravliste">
              ${krav.sjekkpunkter.map((p) => html`<li>${p.tekst} <span class="kravliste__kilde">${p.kilde}</span></li>`)}
            </ul>
          </section>`
        : nothing}

      <div class="rapport__grid">
        <section class="egenskaper">
          <h2 class="kategori">DOKUMENTER (${this.docs.length})</h2>
          <ul class="kravliste">
            ${this.docs.map((d) => html`<li><a href=${d.url} target="_blank" rel="noopener">${d.tittel}</a> <span class="kravliste__kilde">${d.type}${d.revisjon ? ` · Rev. ${d.revisjon}` : ""}</span></li>`)}
          </ul>
        </section>
        <svv-nvdb-naer .treff=${t}></svv-nvdb-naer>
      </div>

      <footer class="rapport__fot sekundar liten">
        Kilder: prosjektmodell (${data.mode === "mock" ? "testdata" : "SVV-portal"}), NVDB API Les (NLOD), Geodata Online, Statens vegvesen R610:2025.
      </footer>
    </article>`;
  }
}

customElements.define("svv-report-view", SvvReportView);
