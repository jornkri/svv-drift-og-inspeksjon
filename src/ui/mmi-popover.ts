import { html } from "lit";
import { PHASES, PRESETS, isSameSelection, normalize, phaseRange, stripWeights, type PhaseId } from "../filters/mmi.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "./base.ts";

/** MMI-boksen: fargestripe, avkrysningsliste, snarveier og «Fargelegg kartet etter MMI». */
export class SvvMmiPopover extends StoreElement {
  private toggle(id: PhaseId) {
    const sel = new Set(store.get().filters.phases);
    if (sel.has(id)) sel.delete(id);
    else sel.add(id);
    store.setFilters({ phases: normalize(sel) });
  }

  protected override render() {
    const s = this.store.state;
    const sel = new Set(s.filters.phases);
    const counts = s.counts?.perPhase;
    const w = counts ? stripWeights(counts) : null;
    return html`
      <div class="popover popover--mmi" data-popover="mmi" role="dialog" aria-label="Filtrer på MMI">
        <div class="popover__hode">
          <h2 class="popover__tittel">MMI-nivå</h2>
          <a href="https://www.mmi-veilederen.no/grunnleggende-mmi-nivaer.html" target="_blank" rel="noopener">MMI-veilederen</a>
        </div>
        <p class="popover__hint">Klikk i stripen eller listen for å slå faser av og på.</p>
        <div class="mmistripe" role="group" aria-label="MMI-faser som fargestripe">
          ${PHASES.map(
            (p) => html`<button
              class="mmistripe__seg ${sel.has(p.id) ? "is-paa" : ""}"
              style="flex:${w ? w[p.id] : 1} 1 0;background:${p.farge}"
              aria-pressed=${sel.has(p.id)}
              aria-label="${p.navn} ${phaseRange(p)}, ${counts?.[p.id] ?? 0} objekter"
              title="${p.navn} (${phaseRange(p)})"
              @click=${() => this.toggle(p.id)}
            ></button>`,
          )}
        </div>
        <div class="mmistripe__skala" aria-hidden="true"><span>000</span><span>300</span><span>400</span><span>600</span></div>
        <fieldset class="mmiliste">
          <legend class="visually-hidden">MMI-faser</legend>
          ${PHASES.map(
            (p) => html`<label class="mmiliste__rad ${sel.has(p.id) ? "is-paa" : ""}">
              <input type="checkbox" .checked=${sel.has(p.id)} @change=${() => this.toggle(p.id)} />
              <span class="farge" style="background:${p.farge}" aria-hidden="true"></span>
              <span class="mmiliste__navn">${p.navn}</span>
              <span class="mmiliste__spenn">${phaseRange(p)}</span>
              <span class="mmiliste__antall">${counts?.[p.id] ?? ""}</span>
            </label>`,
          )}
        </fieldset>
        <div class="mmisnarveier" role="group" aria-label="Snarveier">
          ${PRESETS.map(
            (p) => html`<button
              class="snarvei ${isSameSelection(p.phases, s.filters.phases) ? "is-valgt" : ""}"
              aria-pressed=${isSameSelection(p.phases, s.filters.phases)}
              @click=${() => store.setFilters({ phases: [...p.phases] })}
            >
              ${p.label}
            </button>`,
          )}
        </div>
        <div class="popover__fot popover__fot--gra">
          <label class="avkrysning">
            <input type="checkbox" .checked=${s.colorByMmi} @change=${() => store.set({ colorByMmi: !s.colorByMmi })} />
            Fargelegg kartet etter MMI
          </label>
          <button class="knapp knapp--primar" @click=${() => store.set({ popover: null })}>Ferdig</button>
        </div>
      </div>
    `;
  }
}

customElements.define("svv-mmi-popover", SvvMmiPopover);
