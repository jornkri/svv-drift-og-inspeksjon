import { html, nothing } from "lit";
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
import { NVDB_FARGE, NVDB_TYPER, type NvdbType } from "../nvdb/vegobjekter.ts";

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

  override async connectedCallback() {
    super.connectedCallback();
    const stats = await services().data.objectStats();

    this.types = typesByFag(stats);
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
    return html`
      ${FAG.map((fag) => {
        const types = this.types[fag] ?? [];
        const onCount = types.filter((t) => !hidden.has(typeKey(fag, t))).length;
        const fagOff = s.filters.fag !== "Alle" && s.filters.fag !== fag;
        return html`<div class="laggruppe">
          <label class="laggruppe__hode">
            <input
              type="checkbox"
              .checked=${onCount === types.length}
              .indeterminate=${onCount > 0 && onCount < types.length}
              @change=${(e: Event) => this.toggleFag(fag, (e.target as HTMLInputElement).checked)}
            />
            <span class="kategori">${fag.toUpperCase()}</span>
            <span class="laggruppe__antall">${s.counts?.perFag[fag] ?? ""}</span>
          </label>
          ${fagOff ? html`<p class="laggruppe__merknad">Skjult av fagfilteret</p>` : nothing}
          ${types.map(
            (t) => html`<label class="lagrad">
              <input type="checkbox" .checked=${!hidden.has(typeKey(fag, t))} @change=${() => this.toggleType(fag, t)} />
              ${swatch(fag, t)}
              <span class="lagrad__navn">${t}</span>
              <span class="lagrad__antall">${perType[typeKey(fag, t)] ?? ""}</span>
            </label>`,
          )}
        </div>`;
      })}
      <div class="laggruppe">
        <div class="laggruppe__hode laggruppe__hode--tekst"><span class="kategori">REFERANSE</span></div>
        <label class="lagrad">
          <input
            type="checkbox"
            .checked=${s.referanse.nvdb ?? true}
            @change=${() => store.set({ referanse: { ...s.referanse, nvdb: !(s.referanse.nvdb ?? true) } })}
          />
          <span class="symbol symbol--linje" style="--c:#697277" aria-hidden="true"></span>
          <span class="lagrad__navn">NVDB vegnett</span>
          <span class="lagrad__antall">–</span>
        </label>
      </div>
      <div class="laggruppe">
        <div class="laggruppe__hode laggruppe__hode--tekst"><span class="kategori">NVDB VEGOBJEKTER (I DRIFT)</span></div>
        ${Object.keys(s.nvdbAntall).length === 0
          ? html`<p class="laggruppe__merknad">Zoom inn til 1:${NVDB_MAKS_SKALA.toLocaleString("nb-NO")} eller nærmere for å hente vegobjekter.</p>`
          : nothing}
        ${NVDB_TYPER.map(
          (t) => html`<label class="lagrad">
            <input type="checkbox" .checked=${nvdbSynlig(t.id)} @change=${() => store.set({ nvdbTyper: { ...s.nvdbTyper, [t.id]: !nvdbSynlig(t.id) } })} />
            ${nvdbSwatch(t)}
            <span class="lagrad__navn">${t.navn}</span>
            <span class="lagrad__antall">${s.nvdbAntall[t.id] ?? ""}</span>
          </label>`,
        )}
      </div>
      ${this.renderTema()}
    `;
  }

  private renderTema() {
    const s = this.store.state;
    const { cfg, data } = services();
    if (!hasGdoAccess() && data.mode !== "portal") {
      return html`<div class="laggruppe">
        <div class="laggruppe__hode laggruppe__hode--tekst"><span class="kategori">TEMA (GEODATA ONLINE)</span></div>
        <p class="laggruppe__merknad">Krever tilgang til Geodata Online.</p>
      </div>`;
    }
    const grupper = [...new Set(cfg.gdo.temalag.map((t) => t.gruppe))];
    return html`<div class="laggruppe">
        <div class="laggruppe__hode laggruppe__hode--tekst"><span class="kategori">TEMA (GEODATA ONLINE)</span></div>
        ${grupper.map(
          (g) => html`<p class="laggruppe__undertittel">${g}</p>
            ${cfg.gdo.temalag
              .filter((t) => t.gruppe === g)
              .map(
                (t) => html`<label class="lagrad" title=${t.beskrivelse}>
                  <input
                    type="checkbox"
                    .checked=${!!s.referanse[`tema:${t.id}`]}
                    @change=${() => store.set({ referanse: { ...s.referanse, [`tema:${t.id}`]: !s.referanse[`tema:${t.id}`] } })}
                  />
                  <span class="lagrad__navn">${t.navn}</span>
                </label>`,
              )}`,
        )}
        <p class="laggruppe__merknad">Klikk i kartet for å se informasjon fra temalagene som er slått på.</p>
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
        ${this.nvdbLegend()}
      </div>`;
    }
    return html`<div class="tegnforklaring">
      ${FAG.map(
        (fag) => html`<h3 class="kategori">${fag.toUpperCase()}</h3>
          ${(this.types[fag] ?? []).map((t) => html`<div class="tegnforklaring__rad">${swatch(fag, t)} ${t}</div>`)}`,
      )}
      ${this.nvdbLegend()}
    </div>`;
  }
}

customElements.define("svv-layer-panel", SvvLayerPanel);
