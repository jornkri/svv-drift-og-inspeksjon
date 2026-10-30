import { html, nothing } from "lit";
import type { DiagnoseRad, PortalDataService } from "../data/PortalDataService.ts";
import { services } from "../services.ts";
import { LightElement } from "../ui/base.ts";

/** ?diagnose=1 – lag, tabeller og felt i webkartet, og rollen appen har gitt hvert lag. */
export class SvvDiagnose extends LightElement {
  private rows: DiagnoseRad[] = [];
  private loading = true;
  private kopiert = false;

  override async connectedCallback() {
    super.connectedCallback();
    this.rows = await (services().data as PortalDataService).diagnose();
    this.loading = false;
    this.requestUpdate();
  }

  private async kopier() {
    const { cfg, data } = services();
    const p = data as PortalDataService;
    const json = JSON.stringify({ portal: cfg.portalUrl, webkart: cfg.webmapId, webscene: cfg.websceneId, automatisk: !!p.auto, lokalt: p.lokalt, lag: this.rows }, null, 2);
    await navigator.clipboard.writeText(json).catch(() => undefined);
    this.kopiert = true;
    this.requestUpdate();
  }

  protected override render() {
    const { cfg, data } = services();
    const p = data as PortalDataService;
    return html`<div class="diagnose">
      <h1>Diagnose – webkart ${cfg.webmapId || "(ikke satt)"}</h1>
      <p>
        Portal: <code>${cfg.portalUrl}</code> · innlogget som <strong>${data.user.navn}</strong> · lagene er
        ${p.auto ? "kartlagt automatisk ut fra feltene" : "konfigurert i .env"}.
        ${p.lokalt.length ? html`<br />Mangler tabell for ${p.lokalt.join(" og ")} – lagres lokalt i nettleseren.` : nothing}
      </p>
      <p>
        <button class="knapp knapp--primar" ?disabled=${this.loading} @click=${() => this.kopier()}>Kopier som JSON</button>
        <a class="knapp knapp--sekundar" href=${location.pathname}>Til appen</a>
        ${this.kopiert ? html`<span role="status">Kopiert.</span>` : nothing}
      </p>
      ${this.loading
        ? html`<p role="status">Laster webkartet …</p>`
        : this.rows.map(
            (r) => html`<section>
              <h2>${r.tittel} <small>(${r.type}${r.wkid ? `, wkid ${r.wkid}` : ""})</small></h2>
              <p><strong>${r.rolle}</strong>${r.redigerbar ? " · redigerbar" : " · kun lesing"}</p>
              ${r.mangler.length ? html`<p>Mangler felt: <code>${r.mangler.join(", ")}</code></p>` : nothing}
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
