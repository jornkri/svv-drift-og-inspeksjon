import { html, nothing } from "lit";
import { FAG, STATUS_INSPEKSJON, type Fag, type StatusInspeksjon } from "../data/schema.ts";
import { DEFAULT_FILTERS, extraCount, isDirty } from "../filters/filters.ts";
import { DEFAULT_PHASES, PHASES, isDefaultSelection, mmiLabel, stripWeights } from "../filters/mmi.ts";
import { FAG_STIL } from "../map/renderers.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "./base.ts";
import { icons } from "./icons.ts";
import { installPopoverBehavior, togglePopover } from "./popover.ts";
import "./mmi-popover.ts";

/** Filterlinjen øverst i kartet (2D og 3D). */
export class SvvFilterBar extends StoreElement {
  private cleanup: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.cleanup = installPopoverBehavior();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.cleanup?.();
  }

  private chip(active: boolean, open: boolean) {
    return `chip ${active ? "is-aktiv" : ""} ${open ? "is-apen" : ""}`;
  }

  protected override render() {
    const s = this.store.state;
    const f = s.filters;
    const c = s.counts;
    const weights = c ? stripWeights(c.perPhase) : null;
    const sel = new Set(f.phases);
    const nExtra = extraCount(f);

    return html`
      <div class="filterlinje" role="toolbar" aria-label="Filter">
        <button
          class="chip chip--lag ${s.layerPanelOpen ? "is-paa" : ""}"
          aria-pressed=${s.layerPanelOpen}
          aria-controls="lagpanel"
          @click=${() => store.set({ layerPanelOpen: !s.layerPanelOpen })}
        >
          ${icons.layers(18)} Lag
        </button>
        <span class="filterlinje__skille" aria-hidden="true"></span>

        <div class="popwrap">
          <button
            class=${this.chip(f.fag !== "Alle", s.popover === "fag")}
            aria-haspopup="true"
            aria-expanded=${s.popover === "fag"}
            @click=${() => togglePopover("fag")}
          >
            <span>Fag: <b>${f.fag}</b></span>${icons.chevronDown()}
          </button>
          ${s.popover === "fag"
            ? html`<div class="popover popover--smal" data-popover="fag" role="group" aria-label="Velg fag">
                ${(["Alle", ...FAG] as (Fag | "Alle")[]).map(
                  (x) => html`<label class="valgrad">
                    <input
                      type="radio"
                      name="fag"
                      .checked=${f.fag === x}
                      @change=${() => {
                        store.setFilters({ fag: x });
                        store.set({ popover: null });
                      }}
                    />
                    <span class="valgrad__farge" style="background:${x === "Alle" ? "#ffffff" : FAG_STIL[x].farge}"></span>
                    <span class="valgrad__navn">${x === "Alle" ? "Alle fag" : x}</span>
                    <span class="valgrad__antall">${x === "Alle" ? (c?.total ?? "") : (c?.perFag[x] ?? "")}</span>
                  </label>`,
                )}
              </div>`
            : nothing}
        </div>

        <div class="popwrap">
          <button
            class=${this.chip(!isDefaultSelection(f.phases), s.popover === "mmi")}
            aria-haspopup="dialog"
            aria-expanded=${s.popover === "mmi"}
            @click=${() => togglePopover("mmi")}
          >
            <span class="ministripe" aria-hidden="true">
              ${PHASES.map(
                (p) => html`<span style="flex:${weights ? weights[p.id] : 1} 1 0;background:${p.farge};opacity:${sel.has(p.id) ? 1 : 0.18}"></span>`,
              )}
            </span>
            <span>MMI: <b>${mmiLabel(f.phases)}</b></span>${icons.chevronDown()}
          </button>
          ${s.popover === "mmi" ? html`<svv-mmi-popover></svv-mmi-popover>` : nothing}
        </div>

        <div class="popwrap">
          <button
            class=${this.chip(f.inspeksjon !== "Alle", s.popover === "inspeksjon")}
            aria-haspopup="true"
            aria-expanded=${s.popover === "inspeksjon"}
            @click=${() => togglePopover("inspeksjon")}
          >
            <span>Inspeksjon: <b>${f.inspeksjon}</b></span>${icons.chevronDown()}
          </button>
          ${s.popover === "inspeksjon"
            ? html`<div class="popover popover--smal" data-popover="inspeksjon" role="group" aria-label="Inspeksjonsstatus">
                ${(["Alle", ...STATUS_INSPEKSJON] as (StatusInspeksjon | "Alle")[]).map(
                  (x) => html`<label class="valgrad">
                    <input
                      type="radio"
                      name="inspeksjon"
                      .checked=${f.inspeksjon === x}
                      @change=${() => {
                        store.setFilters({ inspeksjon: x });
                        store.set({ popover: null });
                      }}
                    />
                    <span class="valgrad__navn">${x}</span>
                  </label>`,
                )}
              </div>`
            : nothing}
        </div>

        <div class="popwrap">
          <button
            class="${this.chip(nExtra > 0, s.popover === "ekstra")} chip--stiplet"
            aria-haspopup="dialog"
            aria-expanded=${s.popover === "ekstra"}
            @click=${() => togglePopover("ekstra")}
          >
            ${icons.plus(16)} Filter${nExtra ? html` <b>(${nExtra})</b>` : nothing}
          </button>
          ${s.popover === "ekstra" ? this.renderExtra() : nothing}
        </div>

        <span class="tellerboks">
          <span role="status" aria-live="polite" data-testid="antall"><b>${c?.shown ?? "…"}</b> av ${c?.total ?? "…"}</span>
          ${isDirty(f)
            ? html`<button class="tellerboks__nullstill" @click=${() => store.set({ filters: { ...DEFAULT_FILTERS, phases: [...DEFAULT_PHASES] } })}>
                Nullstill
              </button>`
            : nothing}
        </span>
      </div>
    `;
  }

  private renderExtra() {
    const f = this.store.state.filters;
    const upd = (k: "revisjon" | "modellfil" | "datoFra" | "datoTil") => (e: Event) =>
      store.setFilters({ [k]: (e.target as HTMLInputElement).value });
    return html`<div class="popover" data-popover="ekstra" role="dialog" aria-label="Flere filtre">
      <div class="popover__hode"><h2 class="popover__tittel">Flere filtre</h2></div>
      <div class="skjema skjema--kompakt">
        <label class="felt">
          <span class="felt__etikett">Revisjon</span>
          <input class="felt__input" type="text" .value=${f.revisjon} @change=${upd("revisjon")} placeholder="f.eks. A" />
        </label>
        <label class="felt">
          <span class="felt__etikett">Modellfil inneholder</span>
          <input class="felt__input" type="text" .value=${f.modellfil} @change=${upd("modellfil")} placeholder="f.eks. overvann" />
        </label>
        <div class="felt-rad">
          <label class="felt">
            <span class="felt__etikett">Revidert fra</span>
            <input class="felt__input" type="date" .value=${f.datoFra} @change=${upd("datoFra")} />
          </label>
          <label class="felt">
            <span class="felt__etikett">Revidert til</span>
            <input class="felt__input" type="date" .value=${f.datoTil} @change=${upd("datoTil")} />
          </label>
        </div>
      </div>
      <div class="popover__fot">
        <button class="knapp knapp--sekundar" @click=${() => store.setFilters({ revisjon: "", modellfil: "", datoFra: "", datoTil: "" })}>Tøm</button>
        <button class="knapp knapp--primar" @click=${() => store.set({ popover: null })}>Ferdig</button>
      </div>
    </div>`;
  }
}

customElements.define("svv-filter-bar", SvvFilterBar);
