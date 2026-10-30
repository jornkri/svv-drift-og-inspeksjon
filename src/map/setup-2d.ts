import "@arcgis/map-components/components/arcgis-map";
import type Basemap from "@arcgis/core/Basemap.js";
import Graphic from "@arcgis/core/Graphic.js";
import EsriMap from "@arcgis/core/Map.js";
import Point from "@arcgis/core/geometry/Point.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import type MapView from "@arcgis/core/views/MapView.js";
import type { ArcgisMap } from "@arcgis/map-components/components/arcgis-map";
import type { BasemapId } from "../config.ts";
import type { PortalDataService } from "../data/PortalDataService.ts";
import { services } from "../services.ts";
import { store } from "../state/store.ts";
import { createBasemap, hasGdoAccess, portalBasemaps } from "./basemaps.ts";
import { setMapContext } from "./map-context.ts";
import { NvdbObjekterLayer } from "./nvdb-objekter-layer.ts";
import { TemaLayers } from "./tema-layers.ts";
import { NvdbVegnettLayer } from "./nvdb-layer.ts";
import { ObjectLayerController } from "./object-layers.ts";

export interface Map2D {
  view: MapView;
  map: EsriMap;
  objects: ObjectLayerController;
  dispose(): void;
}

/**
 * Felles oppsett for 2D-kart (kontor og felt): UTM33, bakgrunnskart fra Geodata Online,
 * NVDB-vegnett, objektlag med filter og utvalg ved klikk, søkemarkør og zoom-forespørsler.
 */
export async function setup2DMap(el: ArcgisMap, elementId: string, opts: { scale?: number } = {}): Promise<Map2D> {
  const { cfg, data } = services();
  await customElements.whenDefined("arcgis-map");

  let basemaps: Partial<Record<BasemapId, Basemap>> = {};
  if (data.mode === "portal") {
    basemaps = await portalBasemaps(cfg, (data as unknown as PortalDataService).portal).catch(() => ({}));
  }
  const basemapFor = (id: BasemapId): Basemap | null => {
    if (basemaps[id]) return basemaps[id]!;
    if (!hasGdoAccess()) return null;
    const def = cfg.gdo.basemaps.find((b) => b.id === id);
    if (!def) return null;
    return (basemaps[id] = createBasemap(def, "2d"));
  };

  const initial = basemapFor(store.get().basemap);
  const map = new EsriMap(initial ? { basemap: initial } : {});
  el.map = map;
  el.spatialReference = new SpatialReference({ wkid: cfg.wkid });
  el.center = new Point({ x: cfg.prosjekt.senter[0], y: cfg.prosjekt.senter[1], spatialReference: { wkid: cfg.wkid } });
  el.scale = opts.scale ?? cfg.prosjekt.skala;
  el.constraints = { minScale: 1_500_000, maxScale: 150, rotationEnabled: false } as never;
  await el.viewOnReady();
  const view = el.view as MapView;
  view.background = { color: [236, 238, 237, 1] } as never;

  const nvdb = new NvdbVegnettLayer(cfg);
  nvdb.layer.visible = store.get().referanse.nvdb ?? true;
  map.add(nvdb.layer);
  for (const ref of await data.createReferenceLayers()) map.add(ref);
  const tema = new TemaLayers(cfg);
  tema.attach(map);
  const nvdbObj = new NvdbObjekterLayer(cfg);
  map.add(nvdbObj.group);

  const objects = new ObjectLayerController(view, "2d", data);
  await objects.start();
  const markor = new GraphicsLayer({ id: "markor", listMode: "hide" });
  map.add(markor);
  nvdb.attach(view);
  nvdbObj.attach(view);
  setMapContext({ dim: "2d", elementId, view, objects });

  const showMarkor = async (m: { x: number; y: number; tekst: string } | null) => {
    markor.removeAll();
    if (!m) return;
    const geometry = new Point({ x: m.x, y: m.y, spatialReference: { wkid: cfg.wkid } });
    markor.add(
      new Graphic({
        geometry,
        symbol: new SimpleMarkerSymbol({ style: "circle", size: 16, color: [255, 150, 0, 1], outline: { color: [68, 79, 85, 1], width: 2 } }),
      }),
    );
    await objects.goTo(geometry, { scale: 1500 });
  };

  const consumeZoom = async () => {
    const id = store.get().zoomTil;
    if (!id) return;
    store.set({ zoomTil: null });
    const hit = await data.getObject(id);
    if (hit) await objects.goTo(hit.geometry);
  };

  const click = view.on("click", async (e) => {
    if (document.body.dataset.maaling === "aktiv") return;
    const ids = await objects.hitTest(e);
    if (ids.length) {
      store.set({ selection: { globalids: ids, index: 0 }, nvdbValgt: null, temaTreff: null, popover: null });
      return;
    }
    const nvdbTreff = (await view.hitTest(e, { include: nvdbObj.layers })).results.find((r) => r.type === "graphic");
    const a = nvdbTreff && "graphic" in nvdbTreff ? nvdbTreff.graphic.attributes : null;
    if (a) {
      store.set({ selection: null, nvdbValgt: { typeId: a.type_id as number, id: a.nvdb_id as number }, temaTreff: null, popover: null });
      return;
    }
    store.set({ selection: null, nvdbValgt: null, temaTreff: null, popover: null });
    const treff = await tema.identifiser(view, e.mapPoint);
    if (treff.length) store.set({ temaTreff: { x: e.mapPoint.x, y: e.mapPoint.y, treff } });
  });

  const unsubs = [
    store.select((s) => s.basemap, (id) => {
      map.basemap = basemapFor(id) ?? (null as never);
    }),
    store.select((s) => s.referanse, (r) => {
      nvdb.layer.visible = r.nvdb ?? true;
    }),
    store.select((s) => s.zoomTil, () => void consumeZoom()),
    store.select((s) => s.markor, (m) => void showMarkor(m)),
    store.select((s) => s.dataVersjon, () => void objects.refreshStats()),
  ];
  void consumeZoom();
  void showMarkor(store.get().markor);

  return {
    view,
    map,
    objects,
    dispose() {
      unsubs.forEach((u) => u());
      click.remove();
      objects.destroy();
      nvdb.detach();
      nvdbObj.detach();
      tema.detach();
      setMapContext(null);
    },
  };
}
