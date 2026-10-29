import type EsriMap from "@arcgis/core/Map.js";
import type Point from "@arcgis/core/geometry/Point.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import GroupLayer from "@arcgis/core/layers/GroupLayer.js";
import ImageryLayer from "@arcgis/core/layers/ImageryLayer.js";
import type Layer from "@arcgis/core/layers/Layer.js";
import MapImageLayer from "@arcgis/core/layers/MapImageLayer.js";
import TileLayer from "@arcgis/core/layers/TileLayer.js";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer.js";
import MosaicRule from "@arcgis/core/layers/support/MosaicRule.js";
import * as identify from "@arcgis/core/rest/identify.js";
import IdentifyParameters from "@arcgis/core/rest/support/IdentifyParameters.js";
import type MapView from "@arcgis/core/views/MapView.js";
import type { AppConfig, TemalagDef } from "../config.ts";
import { store } from "../state/store.ts";

export interface TemaTreff {
  lag: string;
  tema: string;
  attributter: [string, string][];
}

/** Felt som ikke gir mening for brukeren i identify-resultatet. */
const SKJULTE = /^(objectid|fid|shape|shape[._]|globalid|st_|se_anno|oid|gml_id|lokalid|navnerom|versjonid|omradeid|fylkeid|utgatt|teigid|areal_orig|malemetode)$/i;

/** Temalag fra Geodata Online (synlighet styres fra lagpanelet) og historiske flyfoto. */
export class TemaLayers {
  readonly group = new GroupLayer({ id: "tema", title: "Temalag", listMode: "hide" });
  readonly flyfoto: ImageryLayer;
  private readonly lag = new Map<string, Layer>();
  private unsub: (() => void)[] = [];

  constructor(private readonly cfg: AppConfig) {
    this.flyfoto = new ImageryLayer({ url: cfg.gdo.flyfoto.url, visible: false, title: "Historiske flyfoto", opacity: 1 });
  }

  private lagFor(def: TemalagDef): Layer {
    let l = this.lag.get(def.id);
    if (l) return l;
    const felles = { id: `tema-${def.id}`, title: def.navn, opacity: def.opasitet ?? 1 };
    if (def.type === "feature") l = new FeatureLayer({ ...felles, url: def.url, outFields: ["*"] });
    else if (def.type === "vector-tile") l = new VectorTileLayer({ ...felles, url: def.url });
    else if (def.type === "tile") l = new TileLayer({ ...felles, url: def.url });
    else l = new MapImageLayer({ ...felles, url: def.url, ...(def.sublag ? { sublayers: def.sublag.map((id) => ({ id, visible: true })) } : {}) });
    this.lag.set(def.id, l);
    return l;
  }

  attach(map: EsriMap): void {
    map.add(this.flyfoto, 0);
    map.add(this.group);
    const synk = () => {
      const r = store.get().referanse;
      const aktive = this.cfg.gdo.temalag.filter((d) => r[`tema:${d.id}`]);
      // Rekkefølge som i konfigurasjonen; lag opprettes først når de slås på.
      this.group.layers.removeAll();
      this.group.addMany(aktive.map((d) => this.lagFor(d)));
    };
    const flyfoto = () => {
      const aar = store.get().flyfotoAar;
      this.flyfoto.visible = aar != null;
      if (aar != null) this.flyfoto.mosaicRule = new MosaicRule({ where: `aar = ${Number(aar)}`, method: "attribute", sortField: "aar", sortValue: String(aar) } as never);
    };
    this.unsub.push(
      store.select((s) => s.referanse, synk),
      store.select((s) => s.flyfotoAar, flyfoto),
    );
    synk();
    flyfoto();
  }

  detach(): void {
    this.unsub.forEach((u) => u());
  }

  /** Identifiserer synlige temalag i et punkt (MapServer-identify og FeatureLayer-spørring). */
  async identifiser(view: MapView, punkt: Point): Promise<TemaTreff[]> {
    const ut: TemaTreff[] = [];
    const aktive = this.cfg.gdo.temalag.filter((d) => store.get().referanse[`tema:${d.id}`] && (d.type === "map-image" || d.type === "feature"));
    await Promise.all(
      aktive.map(async (d) => {
        try {
          if (d.type === "feature") {
            const fl = this.lagFor(d) as FeatureLayer;
            const tol = view.resolution * 8;
            const res = await fl.queryFeatures({
              geometry: punkt,
              distance: tol,
              units: "meters",
              outFields: ["*"],
              returnGeometry: false,
            });
            for (const f of res.features.slice(0, 5)) ut.push({ lag: d.navn, tema: d.navn, attributter: rens(f.attributes) });
            return;
          }
          const params = new IdentifyParameters({
            geometry: punkt,
            mapExtent: view.extent,
            width: view.width,
            height: view.height,
            tolerance: 6,
            layerOption: "visible",
            ...(d.sublag ? { layerIds: d.sublag } : {}),
            returnGeometry: false,
          });
          const res = await identify.identify(d.url, params);
          for (const r of res.results.slice(0, 6)) ut.push({ lag: r.layerName, tema: d.navn, attributter: rens(r.feature.attributes) });
        } catch (e) {
          console.warn(`Identify feilet for ${d.navn}`, e);
        }
      }),
    );
    return ut;
  }
}

function rens(a: Record<string, unknown>): [string, string][] {
  return Object.entries(a)
    .filter(([k, v]) => !SKJULTE.test(k) && v != null && v !== "" && v !== "Null" && String(v).trim() !== "")
    .map(([k, v]) => [k, verdi(k, v)] as [string, string])
    .slice(0, 14);
}

/** Datofelt kommer som epoch-millisekunder fra tjenestene. */
function verdi(k: string, v: unknown): string {
  if (typeof v === "number" && /dato|date|tid$/i.test(k) && Math.abs(v) > 1e10) return new Date(v).toLocaleDateString("nb-NO");
  if (typeof v === "number") return /nr$|nummer|id$/i.test(k) ? String(v) : v.toLocaleString("nb-NO", { maximumFractionDigits: 2 });
  return String(v);
}
