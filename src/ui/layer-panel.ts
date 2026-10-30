import { html, nothing, type SVGTemplateResult, type TemplateResult } from "lit";
import { FAG, type Fag } from "../data/schema.ts";
import { typesByFag } from "../filters/counts.ts";
import { typeKey } from "../filters/filters.ts";
import { PHASES, phaseRange } from "../filters/mmi.ts";
import { services } from "../services.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "./base.ts";
import { icons } from "./icons.ts";
import { swatch } from "./legend.ts";
import { NVDB_MAKS_SKALA, nvdbSynlig } from "../map/nvdb-objekter-layer.ts";
import { hasGdoAccess } from "../map/basemaps.ts";
import { NVDB_FARGE, NVDB_TYPER, type NvdbFag, type NvdbType } from "../nvdb/vegobjekter.ts";
import type { TemalagDef } from "../config.ts";
import "./tema-legende.ts";
import { feltbilder } from "../data/feltbilder.ts";
import { fagIkon, gruppeIkon, temaIkon } from "./tema-ikoner.ts";

const NVDB_FAG: NvdbFag[] = ["VA", "Elektro", "Veg", "Kontekst"];

/** Avkrysning for en gruppe: på når alle er på, delvis når noen er på. */
function gruppeBoks(paa: number, totalt: number, navn: string, sett: (paa: boolean) => void) {
  return html`<input
    type="checkbox"
    aria-label="Vis alle i ${navn}"
    .checked=${totalt > 0 && paa === totalt}
    .indeterminate=${paa > 0 && paa < totalt}
    @change=${(e: Event) => sett((e.target as HTMLInputElement).checked)}
  />`;
}

export function nvdbSwatch(t: NvdbType) {
  const c = `rgb(${NVDB_FARGE.join(",")})`;
  const cls =
    t.geometri === "punkt"
      ? { circle: "symbol--punkt symbol--fylt", triangle: "symbol--trekant", square: "symbol--kvadrat", diamond: "symbol--diamant" }[t.form ?? "circle"]
      : t.geometri === "flate"
        ? "symbol--flate symbol--skravert"
        : (t.bredde ?? 2.5) >= 6
          ? "symbol--tykk symbol--svak"
          : t.strek && t.strek !== "solid"
            ? t.strek.includes("dot") ? "symbol--prikket" : "symbol--stiplet"
            : (t.bredde ?? 2.5) >= 4 ? "symbol--tykk" : "symbol--linje";
  return html`<span class="symbol ${cls}" style="--c:${c}" aria-hidden="true"></span>`;
}

/** Flytende lagpanel med fanene Lag og Tegnforklaring. */
export class SvvLayerPanel extends StoreElement {
  private types: Record<string, string[]> = {};
  /** Åpne/lukkede grupper (brukerens valg mens panelet er åpent) */
  private apne = new Map<string, boolean>();
  private antallBilder = 0;

  override async connectedCallback() {
    super.connectedCallback();
    const stats = await services().data.objectStats();

    this.types = typesByFag(stats);
    this.requestUpdate();
    this.antallBilder = (await feltbilder()).length;
    this.requestUpdate();
  }

  private toggleType(fag: Fag, type: string) {
    const k = typeKey(fag, type);
    const cur = store.get().filters.skjulteTyper;
    store.setFilters({ skjulteTyper: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
  }

  private toggleFag(fag: Fag, on: boolean) {
    const keys = (this.types[fag] ?? []).map((t) => typeKey(fag, t));
    const cur = store.get().filters.skjulteTyper.filter((k) => !keys.includes(k));
    store.setFilters({ skjulteTyper: on ? cur : [...cur, ...keys] });
  }

  private tab(id: "lag" | "tegnforklaring", label: string) {
    const sel = this.store.state.layerPanelTab === id;
    return html`<button
      role="tab"
      id="lagfane-${id}"
      class="fane ${sel ? "is-valgt" : ""}"
      aria-selected=${sel}
      aria-controls="lagpanel-innhold"
      tabindex=${sel ? 0 : -1}
      @click=${() => store.set({ layerPanelTab: id })}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          store.set({ layerPanelTab: id === "lag" ? "tegnforklaring" : "lag" });
          requestAnimationFrame(() => this.querySelector<HTMLElement>(".fane.is-valgt")?.focus());
        }
      }}
    >
      ${label}
    </button>`;
  }

  /**
   * Sammenleggbar laggruppe: knapp (pil, ikon, navn, antall) og gruppeavkrysning ved siden av
   * hverandre (ikke nestet), og radene under når gruppen er åpen.
   */
  private gruppe(g: {
    id: string;
    navn: string;
    /** Navn for skjermleser når navnet går igjen i flere seksjoner (f.eks. «VA») */
    etikett?: string;
    ikon: SVGTemplateResult;
    paa: number;
    totalt: number;
    antall: string;
    aktiv?: boolean;
    apen: boolean;
    sett: (paa: boolean) => void;
    rader: () => unknown;
  }): TemplateResult {
    const apen = this.apne.get(g.id) ?? g.apen;
    return html`<div class="temagruppe ${apen ? "is-apen" : ""}">
      <div class="temagruppe__hode">
        <button
          class="temagruppe__knapp"
          aria-expanded=${apen}
          aria-controls=${g.id}
          @click=${() => {
            this.apne.set(g.id, !apen);
            this.requestUpdate();
          }}
        >
          <span class="temagruppe__pil" aria-hidden="true">${icons.chevronRight(16)}</span>
          <span class="temaikon" aria-hidden="true">${g.ikon}</span>
          <span class="temagruppe__navn">${g.navn}</span>
          <span class="temagruppe__antall ${g.aktiv ? "is-aktiv" : ""}">${g.antall}</span>
        </button>
        ${gruppeBoks(g.paa, g.totalt, g.etikett ?? g.navn, g.sett)}
      </div>
      ${apen ? html`<div class="temagruppe__lag" id=${g.id}>${g.rader()}</div>` : nothing}
    </div>`;
  }

  /** Overskrift for en seksjon i lagpanelet, med «Slå av alle» når noe er på. */
  private seksjon(navn: string, paa: number, totalt: string, slaAv: () => void, tittel?: string) {
    return html`<div class="laggruppe__hode laggruppe__hode--tekst" title=${tittel ?? nothing}>
      <span class="kategori">${navn}</span>
      ${paa ? html`<button class="lenkeknapp" @click=${slaAv}>Slå av alle (${paa})</button>` : html`<span class="laggruppe__antall">${totalt}</span>`}
    </div>`;
  }

  protected override render() {
    const s = this.store.state;
    return html`
      <section id="lagpanel" class="lagpanel" aria-label="Lag og tegnforklaring">
        <div class="lagpanel__hode">
          <div role="tablist" class="faner" aria-label="Lagpanel">${this.tab("lag", "Lag")}${this.tab("tegnforklaring", "Tegnforklaring")}</div>
          <button class="ikonknapp" aria-label="Skjul lagpanel" @click=${() => store.set({ layerPanelOpen: false })}>${icons.close()}</button>
        </div>
        <div id="lagpanel-innhold" class="lagpanel__innhold" role="tabpanel" aria-labelledby="lagfane-${s.layerPanelTab}">
          ${s.layerPanelTab === "lag" ? this.renderLayers() : this.renderLegend()}
        </div>
      </section>
    `;
  }

  private renderLayers() {
    const s = this.store.state;
    const hidden = new Set(s.filters.skjulteTyper);
    const perType = s.counts?.perType ?? {};
    const paaFag = (fag: Fag) => (this.types[fag] ?? []).filter((t) => !hidden.has(typeKey(fag, t))).length;
    const fagMedTyper = FAG.filter((f) => (this.types[f] ?? []).length);
    const typerPaa = fagMedTyper.reduce((n, f) => n + paaFag(f), 0);
    const nvdbPaa = NVDB_TYPER.filter((t) => nvdbSynlig(t.id)).length;
    const nvdbFag = NVDB_FAG.filter((f) => NVDB_TYPER.some((t) => t.fag === f));
    const vegnett = s.referanse.nvdb ?? true;
    return html`
      <div class="laggruppe">
        ${this.seksjon("FAGMODELLER (BIM)", typerPaa, `${s.counts?.total ?? ""}`, () => fagMedTyper.forEach((f) => this.toggleFag(f, false)))}
        ${fagMedTyper.map((fag) => {
          const types = this.types[fag] ?? [];
          const n = paaFag(fag);
          const fagOff = s.filters.fag !== "Alle" && s.filters.fag !== fag;
          return this.gruppe({
            id: `faggruppe-${fag}`,
            navn: fag,
            etikett: `${fag} i fagmodellen`,
            ikon: fagIkon(fag),
            paa: n,
            totalt: types.length,
            antall: fagOff ? "filtrert" : n === 0 ? "av" : n < types.length ? `${n} av ${types.length}` : `${s.counts?.perFag[fag] ?? ""}`,
            aktiv: n > 0 && n < types.length,
            apen: false,
            sett: (v) => this.toggleFag(fag, v),
            rader: () => html`${fagOff ? html`<p class="laggruppe__merknad">Skjult av fagfilteret</p>` : nothing}
              ${types.map(
                (t) => html`<label class="temarad">
                  <input type="checkbox" .checked=${!hidden.has(typeKey(fag, t))} @change=${() => this.toggleType(fag, t)} />
                  ${swatch(fag, t)}
                  <span class="lagrad__navn">${t}</span>
                  <span class="lagrad__antall">${perType[typeKey(fag, t)] ?? ""}</span>
                </label>`,
              )}`,
          });
        })}
      </div>
      <div class="laggruppe">
        ${this.seksjon("NVDB", nvdbPaa + (vegnett ? 1 : 0), "", () =>
          store.set({ referanse: { ...s.referanse, nvdb: false }, nvdbTyper: Object.fromEntries(NVDB_TYPER.map((t) => [t.id, false])) }),
        )}
        ${s.route === "3d"
          ? nothing
          : html`<label class="temagruppe__hode temagruppe__enkel">
              <span class="temagruppe__pil" aria-hidden="true"></span>
              <span class="temaikon" aria-hidden="true">${fagIkon("Vegnett")}</span>
              <span class="temagruppe__navn">Vegnett</span>
              <input type="checkbox" .checked=${vegnett} @change=${() => store.set({ referanse: { ...s.referanse, nvdb: !vegnett } })} />
            </label>`}
        ${nvdbFag.map((fag) => {
          const typer = NVDB_TYPER.filter((t) => t.fag === fag);
          const n = typer.filter((t) => nvdbSynlig(t.id)).length;
          const antall = typer.reduce((a, t) => a + (s.nvdbAntall[t.id] ?? 0), 0);
          return this.gruppe({
            id: `nvdbgruppe-${fag}`,
            navn: fag === "Kontekst" ? "Skilt, bru og fart" : fag,
            etikett: `NVDB ${fag === "Kontekst" ? "skilt, bru og fart" : fag}`,
            ikon: fagIkon(fag),
            paa: n,
            totalt: typer.length,
            antall: n === 0 ? "av" : n < typer.length ? `${n} av ${typer.length}` : antall ? String(antall) : "",
            aktiv: n > 0 && n < typer.length,
            apen: false,
            sett: (v) => store.set({ nvdbTyper: { ...s.nvdbTyper, ...Object.fromEntries(typer.map((t) => [t.id, v])) } }),
            rader: () =>
              typer.map(
                (t) => html`<label class="temarad">
                  <input type="checkbox" .checked=${nvdbSynlig(t.id)} @change=${() => store.set({ nvdbTyper: { ...s.nvdbTyper, [t.id]: !nvdbSynlig(t.id) } })} />
                  ${nvdbSwatch(t)}
                  <span class="lagrad__navn">${t.navn}</span>
                  <span class="lagrad__antall">${s.nvdbAntall[t.id] ?? ""}</span>
                </label>`,
              ),
          });
        })}
        ${Object.keys(s.nvdbAntall).length === 0 && nvdbPaa
          ? html`<p class="laggruppe__merknad">Zoom inn til 1:${NVDB_MAKS_SKALA.toLocaleString("nb-NO")} eller nærmere for å hente vegobjekter.</p>`
          : nothing}
      </div>
      ${s.route === "3d"
        ? html`<p class="laggruppe__merknad">Vegnett, feltbilder og temalag vises i 2D-kartet.</p>`
        : html`${this.renderFeltbilder()} ${this.renderTema()}`}
    `;
  }

  private renderFeltbilder() {
    if (!this.antallBilder) return nothing;
    const paa = this.store.state.referanse.feltbilder ?? true;
    return html`<div class="laggruppe">
      <div class="laggruppe__hode laggruppe__hode--tekst" title="Klikk på et bilde i kartet for å se det. Bildene kobles også automatisk til objektene (fanen Bilder).">
        <span class="kategori">FELTBILDER</span>
      </div>
      <label class="temagruppe__hode temagruppe__enkel">
        <span class="temagruppe__pil" aria-hidden="true"></span>
        <span class="temaikon" aria-hidden="true">${icons.camera(16)}</span>
        <span class="temagruppe__navn">Bilder fra mobil og drone</span>
        <span class="temagruppe__antall">${this.antallBilder}</span>
        <input type="checkbox" .checked=${paa} @change=${() => store.set({ referanse: { ...this.store.state.referanse, feltbilder: !paa } })} />
      </label>
    </div>`;
  }

  private bildeLegend() {
    if (!this.antallBilder || !(this.store.state.referanse.feltbilder ?? true)) return nothing;
    return html`<h3 class="kategori">FELTBILDER</h3>
      <div class="tegnforklaring__rad"><span class="symbol symbol--punkt" style="--c:rgb(0,95,158);background:#fff" aria-hidden="true"></span> Bilde fra mobil</div>
      <div class="tegnforklaring__rad"><span class="symbol symbol--trekant" style="--c:rgb(0,95,158)" aria-hidden="true"></span> Bilde fra drone</div>
      <div class="tegnforklaring__rad"><span class="symbol symbol--flate" style="--c:rgb(0,95,158)" aria-hidden="true"></span> Synsfelt (kameraretning, vises når du zoomer inn)</div>`;
  }

  private renderTema() {
    const s = this.store.state;
    const { cfg } = services();
    if (!hasGdoAccess() || (!cfg.gdo.temalag.length && !cfg.gdo.flyfoto.aar.length)) {
      return html`<div class="laggruppe">
        <div class="laggruppe__hode laggruppe__hode--tekst"><span class="kategori">TEMA (GEODATA ONLINE)</span></div>
        <p class="laggruppe__merknad">Krever tilgang til Geodata Online.</p>
      </div>`;
    }
    const grupper = [...new Set(cfg.gdo.temalag.map((t) => t.gruppe))];
    const paa = (l: TemalagDef[]) => l.filter((t) => s.referanse[`tema:${t.id}`]).length;
    const sett = (l: TemalagDef[], v: boolean) => store.set({ referanse: { ...s.referanse, ...Object.fromEntries(l.map((t) => [`tema:${t.id}`, v])) } });
    const totaltPaa = paa(cfg.gdo.temalag);
    return html`<div class="laggruppe">
        ${this.seksjon("TEMA", totaltPaa, `${cfg.gdo.temalag.length} lag`, () => sett(cfg.gdo.temalag, false), "Klikk i kartet for å se informasjon fra temalagene som er slått på.")}
        ${grupper.map((g) => {
          const lag = cfg.gdo.temalag.filter((t) => t.gruppe === g);
          const n = paa(lag);
          return this.gruppe({
            id: `temagruppe-${grupper.indexOf(g)}`,
            navn: g,
            ikon: gruppeIkon(g),
            paa: n,
            totalt: lag.length,
            antall: n ? `${n} av ${lag.length}` : `${lag.length}`,
            aktiv: n > 0,
            // Grupper med aktive lag er åpne; brukerens valg huskes mens panelet er åpent
            apen: n > 0,
            sett: (v) => sett(lag, v),
            rader: () =>
              lag.map(
                (t) => html`<label class="temarad" title=${t.beskrivelse}>
                    <input
                      type="checkbox"
                      .checked=${!!s.referanse[`tema:${t.id}`]}
                      @change=${() => store.set({ referanse: { ...s.referanse, [`tema:${t.id}`]: !s.referanse[`tema:${t.id}`] } })}
                    />
                    <span class="temaikon" aria-hidden="true">${temaIkon(t)}</span>
                    <span class="lagrad__navn">${t.navn}</span>
                  </label>
                  ${s.referanse[`tema:${t.id}`] ? html`<svv-tema-legende class="temarad__legende" .def=${t} kompakt></svv-tema-legende>` : nothing}`,
              ),
          });
        })}
      </div>
      <div class="laggruppe">
        <label class="laggruppe__hode laggruppe__hode--tekst" for="flyfoto-aar"><span class="kategori">HISTORISKE FLYFOTO</span></label>
        <select
          id="flyfoto-aar"
          class="lagpanel__velger"
          @change=${(e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            store.set({ flyfotoAar: v ? Number(v) : null });
          }}
        >
          <option value="" ?selected=${s.flyfotoAar == null}>Av</option>
          ${[...cfg.gdo.flyfoto.aar].reverse().map((a) => html`<option value=${a} ?selected=${s.flyfotoAar === a}>${a}</option>`)}
        </select>
        <p class="laggruppe__merknad">Sammenlign dagens situasjon med eldre flybilder (Geodata Online).</p>
      </div>`;
  }

  private temaLegend() {
    const s = this.store.state;
    const aktive = services().cfg.gdo.temalag.filter((t) => s.referanse[`tema:${t.id}`]);
    if (!aktive.length) return nothing;
    return html`<h3 class="kategori">TEMADATA</h3>
      ${aktive.map(
        (t) => html`<h4 class="tegnforklaring__lag"><span class="temaikon" aria-hidden="true">${temaIkon(t)}</span>${t.navn}</h4>
          <svv-tema-legende .def=${t}></svv-tema-legende>`,
      )}`;
  }

  private nvdbLegend() {
    const typer = NVDB_TYPER.filter((t) => nvdbSynlig(t.id));
    if (!typer.length) return nothing;
    return html`<h3 class="kategori">NVDB (I DRIFT)</h3>
      ${typer.map((t) => html`<div class="tegnforklaring__rad">${nvdbSwatch(t)} ${t.navn}</div>`)}
      <p class="tegnforklaring__hint">Ekte vegobjekter fra NVDB vises mørkt for å skilles fra modellobjektene.</p>`;
  }

  private renderLegend() {
    const s = this.store.state;
    if (s.colorByMmi) {
      const sel = new Set(s.filters.phases);
      return html`<div class="tegnforklaring">
        <h3 class="kategori">FARGE ETTER MMI</h3>
        ${PHASES.filter((p) => sel.has(p.id)).map(
          (p) => html`<div class="tegnforklaring__rad"><span class="farge" style="background:${p.farge}" aria-hidden="true"></span>${p.navn} (${phaseRange(p)})</div>`,
        )}
        <p class="tegnforklaring__hint">Symbolformen viser fag: linje (VA), stiplet linje (elektro), flate (veg).</p>
        ${this.nvdbLegend()} ${this.bildeLegend()} ${this.temaLegend()}
      </div>`;
    }
    return html`<div class="tegnforklaring">
      ${FAG.map(
        (fag) => html`<h3 class="kategori">${fag.toUpperCase()}</h3>
          ${(this.types[fag] ?? []).map((t) => html`<div class="tegnforklaring__rad">${swatch(fag, t)} ${t}</div>`)}`,
      )}
      ${this.nvdbLegend()} ${this.bildeLegend()} ${this.temaLegend()}
    </div>`;
  }
}

customElements.define("svv-layer-panel", SvvLayerPanel);
