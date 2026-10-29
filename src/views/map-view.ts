import "@arcgis/map-components/components/arcgis-scale-bar";
import type { ArcgisMap } from "@arcgis/map-components/components/arcgis-map";
import { html, nothing } from "lit";
import { setup2DMap, type Map2D } from "../map/setup-2d.ts";
import { services } from "../services.ts";
import { StoreElement } from "../ui/base.ts";
import "../ui/filter-bar.ts";
import "../ui/layer-panel.ts";
import "../ui/map-controls.ts";
import "../ui/coord-bar.ts";
import "../ui/mmi-legend.ts";
import "../ui/object-panel.ts";

export const MAP_ID = "kart-2d";

/** Kontor: 2D-kart med filterlinje, lagpanel, verktøy og objektpanel. */
export class SvvMapView extends StoreElement {
  private kart: Map2D | null = null;
  private disposed = false;

  protected override firstUpdated(): void {
    void setup2DMap(this.querySelector<ArcgisMap>("arcgis-map")!, MAP_ID).then((k) => {
      if (this.disposed) return k.dispose();
      this.kart = k;
      this.setAttribute("data-klar", "");
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.disposed = true;
    this.kart?.dispose();
  }

  protected override render() {
    const s = this.store.state;
    return html`
      <div class="kartflate">
        <div class="kartflate__kart">
          <arcgis-map id=${MAP_ID} popup-disabled aria-label="Kart over ${services().cfg.prosjekt.navn}"></arcgis-map>
          <svv-filter-bar></svv-filter-bar>
          ${s.layerPanelOpen ? html`<svv-layer-panel></svv-layer-panel>` : nothing}
          <svv-map-controls dim="2d"></svv-map-controls>
          ${s.colorByMmi ? html`<svv-mmi-legend></svv-mmi-legend>` : nothing}
          <svv-coord-bar dim="2d"></svv-coord-bar>
        </div>
        ${s.selection ? html`<svv-object-panel dim="2d"></svv-object-panel>` : nothing}
      </div>
    `;
  }
}

customElements.define("svv-map-view", SvvMapView);
