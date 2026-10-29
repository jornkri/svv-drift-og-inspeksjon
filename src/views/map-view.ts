import "@arcgis/map-components/components/arcgis-map";
import "@arcgis/map-components/components/arcgis-scale-bar";
import Graphic from "@arcgis/core/Graphic.js";
import EsriMap from "@arcgis/core/Map.js";
import Point from "@arcgis/core/geometry/Point.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import type MapView from "@arcgis/core/views/MapView.js";
import type { ArcgisMap } from "@arcgis/map-components/components/arcgis-map";
import { html, nothing, type PropertyValues } from "lit";
import { createBasemap, hasGdoAccess, portalBasemaps } from "../map/basemaps.ts";
import { setMapContext } from "../map/map-context.ts";
import { NvdbVegnettLayer } from "../map/nvdb-layer.ts";
import { ObjectLayerController } from "../map/object-layers.ts";
import { services } from "../services.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "../ui/base.ts";
import "../ui/filter-bar.ts";
import "../ui/layer-panel.ts";
import "../ui/map-controls.ts";
import "../ui/coord-bar.ts";
import "../ui/mmi-legend.ts";
import "../ui/object-panel.ts";
import type { BasemapId } from "../config.ts";
import type Basemap from "@arcgis/core/Basemap.js";

export const MAP_ID = "kart-2d";

/** Kontor: 2D-kart med filterlinje, lagpanel, verktøy og objektpanel. */
export class SvvMapView extends StoreElement {
  private objects: ObjectLayerController | null = null;
  private nvdb: NvdbVegnettLayer | null = null;
  private markor = new GraphicsLayer({ id: "markor", listMode: "hide" });
  private basemaps: Partial<Record<BasemapId, Basemap>> = {};
  private unsubs: (() => void)[] = [];
  private viewHandles: { remove(): void }[] = [];
  ready = false;

  protected override firstUpdated(_c: PropertyValues): void {
    void this.init();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubs.forEach((u) => u());
    this.viewHandles.forEach((h) => h.remove());
    this.objects?.destroy();
    this.nvdb?.detach();
    setMapContext(null);
  }

  private async init() {
    const { cfg, data } = services();
    const el = this.querySelector<ArcgisMap>("arcgis-map")!;
    await customElements.whenDefined("arcgis-map");

    if (data.mode === "portal" && "portal" in data) {
      // Bakgrunnskart fra portalens bakgrunnskartgruppe (token håndteres av Enterprise)
      const portal = (data as unknown as { portal: import("@arcgis/core/portal/Portal.js").default }).portal;
      this.basemaps = await portalBasemaps(cfg, portal).catch(() => ({}));
    }
    const initialBasemap = this.basemapFor(store.get().basemap);
    const map = new EsriMap({ ...(initialBasemap ? { basemap: initialBasemap } : {}) });
    el.map = map;
    el.spatialReference = new SpatialReference({ wkid: cfg.wkid });
    el.center = new Point({ x: cfg.prosjekt.senter[0], y: cfg.prosjekt.senter[1], spatialReference: { wkid: cfg.wkid } });
    el.scale = cfg.prosjekt.skala;
    el.constraints = { minScale: 1_500_000, maxScale: 150, rotationEnabled: false } as never;
    await el.viewOnReady();
    const view = el.view as MapView;
    view.background = { color: [236, 238, 237, 1] } as never;

    this.nvdb = new NvdbVegnettLayer(cfg);
    this.nvdb.layer.visible = store.get().referanse.nvdb ?? true;
    map.add(this.nvdb.layer);
    for (const ref of await data.createReferenceLayers()) map.add(ref);

    this.objects = new ObjectLayerController(view, "2d", data);
    await this.objects.start();
    map.add(this.markor);
    this.nvdb.attach(view);
    setMapContext({ dim: "2d", elementId: MAP_ID, view, objects: this.objects });

    this.viewHandles.push(
      view.on("click", (e) => void this.onClick(e)),
    );
    this.unsubs.push(
      store.select((s) => s.basemap, (id) => {
        map.basemap = this.basemapFor(id) ?? (null as never);
      }),
      store.select((s) => s.referanse, (r) => {
        if (this.nvdb) this.nvdb.layer.visible = r.nvdb ?? true;
      }),
      store.select((s) => s.zoomTil, () => void this.consumeZoom()),
      store.select((s) => s.markor, (m) => void this.showMarkor(m)),
      store.select((s) => s.dataVersjon, () => void this.objects?.refreshStats()),
    );
    this.ready = true;
    this.setAttribute("data-klar", "");
    void this.consumeZoom();
    void this.showMarkor(store.get().markor);
  }

  private basemapFor(id: BasemapId): Basemap | null {
    const { cfg, data } = services();
    if (this.basemaps[id]) return this.basemaps[id]!;
    if (data.mode === "mock" && !hasGdoAccess()) return null;
    const def = cfg.gdo.basemaps.find((b) => b.id === id);
    if (!def) return null;
    const bm = createBasemap(def, "2d");
    this.basemaps[id] = bm;
    return bm;
  }

  private async onClick(e: { x: number; y: number; stopPropagation(): void }) {
    if (!this.objects || document.body.dataset.maaling === "aktiv") return;
    const ids = await this.objects.hitTest(e);
    store.set({ selection: ids.length ? { globalids: ids, index: 0 } : null, popover: null });
  }

  private async consumeZoom() {
    const id = store.get().zoomTil;
    if (!id || !this.objects) return;
    store.set({ zoomTil: null });
    const hit = await services().data.getObject(id);
    if (hit) await this.objects.goTo(hit.geometry);
  }

  private async showMarkor(m: { x: number; y: number; tekst: string } | null) {
    this.markor.removeAll();
    if (!m || !this.objects) return;
    const geometry = new Point({ x: m.x, y: m.y, spatialReference: { wkid: 25833 } });
    this.markor.add(
      new Graphic({
        geometry,
        symbol: new SimpleMarkerSymbol({ style: "circle", size: 16, color: [255, 150, 0, 1], outline: { color: [68, 79, 85, 1], width: 2 } }),
        attributes: { tekst: m.tekst },
      }),
    );
    await this.objects.goTo(geometry, { scale: 1500 });
  }

  protected override render() {
    const s = this.store.state;
    const sel = s.selection;
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
        ${sel ? html`<svv-object-panel dim="2d"></svv-object-panel>` : nothing}
      </div>
    `;
  }
}

customElements.define("svv-map-view", SvvMapView);
