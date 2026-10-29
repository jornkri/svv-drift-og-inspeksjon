import { html } from "lit";
import { PHASES } from "../filters/mmi.ts";
import { StoreElement } from "./base.ts";

/** Vannrett MMI-fargeforklaring nederst i kartet. */
export class SvvMmiLegend extends StoreElement {
  protected override render() {
    const sel = new Set(this.store.state.filters.phases);
    return html`<div class="mmiforklaring" role="group" aria-label="MMI-fargeforklaring">
      <span class="mmiforklaring__etikett">MMI</span>
      ${PHASES.filter((p) => sel.has(p.id)).map(
        (p) => html`<span class="mmiforklaring__fase"><span class="farge" style="background:${p.farge}" aria-hidden="true"></span>${p.navn}</span>`,
      )}
    </div>`;
  }
}

customElements.define("svv-mmi-legend", SvvMmiLegend);
