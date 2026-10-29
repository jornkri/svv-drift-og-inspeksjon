import { html } from "lit";
import type { PortalDataService } from "../data/PortalDataService.ts";
import { services } from "../services.ts";
import { LightElement } from "../ui/base.ts";

/** ?diagnose=1 – viser lag, tabeller og felt i webkartet for å fylle inn feltmappingen. */
export class SvvDiagnose extends LightElement {
  private rows: Awaited<ReturnType<PortalDataService["diagnose"]>> = [];
  private loading = true;

  override async connectedCallback() {
    super.connectedCallback();
    this.rows = await (services().data as PortalDataService).diagnose();
    this.loading = false;
    this.requestUpdate();
  }

  protected override render() {
    const { cfg } = services();
    return html`<div class="diagnose">
      <h1>Diagnose – webkart ${cfg.webmapId || "(ikke satt)"}</h1>
      <p>Bruk titlene eller URL-ene under i <code>.env</code> (VITE_LAYERS_VA osv.) og juster feltmappingen i <code>src/config.ts</code>.</p>
      ${this.loading
        ? html`<p role="status">Laster webkartet …</p>`
        : this.rows.map(
            (r) => html`<section>
              <h2>${r.tittel} <small>(${r.type})</small></h2>
              <code>${r.url}</code>
              <ul>
                ${r.felt.map((f) => html`<li><code>${f}</code></li>`)}
              </ul>
            </section>`,
          )}
    </div>`;
  }
}

customElements.define("svv-diagnose", SvvDiagnose);
