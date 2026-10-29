import Graphic from "@arcgis/core/Graphic.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import type Geometry from "@arcgis/core/geometry/Geometry.js";
import Point from "@arcgis/core/geometry/Point.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import GroupLayer from "@arcgis/core/layers/GroupLayer.js";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import type MapView from "@arcgis/core/views/MapView.js";
import type { AppConfig } from "../config.ts";
import { NVDB_FARGE, NVDB_TYPER, hentVegobjekter, oppsummer, parseWkt, type NvdbType, type NvdbVegobjekt } from "../nvdb/vegobjekter.ts";
import { store } from "../state/store.ts";

/** Vegobjekter hentes bare når kartet er zoomet inn (antall og responstid). */
export const NVDB_MAKS_SKALA = 25000;
const SR = { wkid: 25833 };

export function nvdbSynlig(typeId: number): boolean {
  const v = store.get().nvdbTyper[typeId];
  return v ?? NVDB_TYPER.find((t) => t.id === typeId)?.standard ?? false;
}

export function nvdbSymbol(t: NvdbType, uthevet = false) {
  const [r, g, b] = NVDB_FARGE;
  if (t.geometri === "punkt") {
    return new SimpleMarkerSymbol({
      style: t.form ?? "circle",
      size: uthevet ? 14 : t.form === "diamond" ? 11 : 9,
      color: [r, g, b, 1],
      outline: { color: uthevet ? [255, 150, 0, 1] : [255, 255, 255, 1], width: uthevet ? 3 : 1.5 },
    });
  }
  if (t.geometri === "flate") {
    return new SimpleFillSymbol({
      color: [r, g, b, 0.15],
      style: "backward-diagonal",
      outline: { color: uthevet ? [255, 150, 0, 1] : [r, g, b, 1], width: uthevet ? 3 : 1.5, style: "solid" },
    });
  }
  const bred = (t.bredde ?? 2.5) >= 6;
  return new SimpleLineSymbol({
    color: uthevet ? [255, 150, 0, 1] : [r, g, b, bred ? 0.3 : 1],
    width: uthevet ? Math.max(5, t.bredde ?? 2.5) : (t.bredde ?? 2.5),
    style: t.strek ?? "solid",
    cap: "round",
  });
}

export function nvdbGeometri(o: NvdbVegobjekt): Geometry | null {
  const g = parseWkt(o.geometri?.wkt);
  if (!g) return null;
  if (g.type === "point") return new Point({ x: g.x, y: g.y, ...(g.z != null ? { z: g.z } : {}), spatialReference: SR });
  const hasZ = (g.type === "polyline" ? g.paths : g.rings).every((p) => p.every((c) => c.length > 2));
  if (g.type === "polyline") return new Polyline({ paths: g.paths, hasZ, spatialReference: SR });
  return new Polygon({ rings: g.rings, hasZ, spatialReference: SR });
}

/**
 * Lag med ekte vegobjekter fra NVDB API Les (driftsfasen), én undergruppe per type.
 * Hentes for kartutsnittet når kartet står i ro, og bare for synlige typer.
 */
export class NvdbObjekterLayer {
  readonly group = new GroupLayer({ id: "nvdb-objekter", title: "NVDB vegobjekter", listMode: "hide" });
  private readonly lag = new Map<number, GraphicsLayer>();
  private readonly dekket = new Map<number, [number, number, number, number]>();
  private readonly objekter = new Map<string, NvdbVegobjekt>();
  private ctrl: AbortController | null = null;
  private handles: { remove(): void }[] = [];
  private uthevet: Graphic | null = null;

  constructor(private readonly cfg: AppConfig) {
    for (const t of NVDB_TYPER) {
      const l = new GraphicsLayer({ id: `nvdb-${t.id}`, title: t.navn, visible: nvdbSynlig(t.id) });
      this.lag.set(t.id, l);
    }
    // Flater nederst, punkter øverst
    const rekke = { flate: 0, linje: 1, punkt: 2 } as const;
    this.group.addMany([...NVDB_TYPER].sort((a, b) => rekke[a.geometri] - rekke[b.geometri]).map((t) => this.lag.get(t.id)!));
  }

  attach(view: MapView): void {
    this.handles.push(
      reactiveUtils.watch(
        () => [view.stationary, view.extent] as const,
        ([stationary]) => {
          if (stationary) void this.refresh(view);
        },
        { initial: true },
      ),
      {
        remove: store.select(
          (s) => s.nvdbTyper,
          () => {
            for (const [id, l] of this.lag) l.visible = nvdbSynlig(id);
            void this.refresh(view);
          },
        ),
      },
      { remove: store.select((s) => s.nvdbValgt, (v) => this.uthev(v)) },
    );
  }

  detach(): void {
    this.handles.forEach((h) => h.remove());
    this.ctrl?.abort();
  }

  /** Objektet bak et treff i kartet. */
  objekt(typeId: number, id: number): NvdbVegobjekt | undefined {
    return this.objekter.get(`${typeId}:${id}`);
  }

  get layers(): GraphicsLayer[] {
    return [...this.lag.values()];
  }

  private uthev(v: { typeId: number; id: number } | null) {
    if (this.uthevet) {
      const t = NVDB_TYPER.find((x) => x.id === this.uthevet!.attributes.type_id);
      if (t) this.uthevet.symbol = nvdbSymbol(t);
      this.uthevet = null;
    }
    if (!v) return;
    const g = this.lag.get(v.typeId)?.graphics.find((x) => x.attributes.nvdb_id === v.id);
    const t = NVDB_TYPER.find((x) => x.id === v.typeId);
    if (g && t) {
      g.symbol = nvdbSymbol(t, true);
      this.uthevet = g;
    }
  }

  private async refresh(view: MapView) {
    if (!view.extent) return;
    if (view.scale > NVDB_MAKS_SKALA) {
      store.set({ nvdbAntall: {} });
      return;
    }
    const e = view.extent;
    const ex = e.clone().expand(1.5);
    const bbox: [number, number, number, number] = [ex.xmin, ex.ymin, ex.xmax, ex.ymax];
    const typer = NVDB_TYPER.filter((t) => nvdbSynlig(t.id)).filter((t) => {
      const c = this.dekket.get(t.id);
      return !(c && e.xmin >= c[0] && e.ymin >= c[1] && e.xmax <= c[2] && e.ymax <= c[3]);
    });
    if (!typer.length) return this.tell(view);
    this.ctrl?.abort();
    const ctrl = (this.ctrl = new AbortController());
    const k = { baseUrl: this.cfg.nvdb.baseUrl, client: this.cfg.nvdb.client };
    await Promise.all(
      typer.map(async (t) => {
        try {
          const objekter = await hentVegobjekter(k, t.id, bbox, { signal: ctrl.signal, maksSider: 4 });
          if (ctrl.signal.aborted) return;
          const l = this.lag.get(t.id)!;
          const graphics: Graphic[] = [];
          for (const o of objekter) {
            const geometry = nvdbGeometri(o);
            if (!geometry) continue;
            this.objekter.set(`${t.id}:${o.id}`, o);
            graphics.push(
              new Graphic({
                geometry,
                symbol: nvdbSymbol(t),
                attributes: { nvdb_id: o.id, type_id: t.id, navn: t.navn, oppsummering: oppsummer(o) },
              }),
            );
          }
          l.removeAll();
          l.addMany(graphics);
          this.dekket.set(t.id, bbox);
        } catch (err) {
          if (!ctrl.signal.aborted) console.warn(`NVDB ${t.navn} kunne ikke hentes`, err);
        }
      }),
    );
    if (!ctrl.signal.aborted) {
      this.tell(view);
      this.uthev(store.get().nvdbValgt);
    }
  }

  private tell(view: MapView) {
    const e = view.extent;
    const antall: Record<number, number> = {};
    for (const [id, l] of this.lag) {
      if (!l.visible) continue;
      antall[id] = l.graphics.filter((g) => !!g.geometry?.extent?.intersects(e) || (g.geometry?.type === "point" && e.contains(g.geometry))).length;
    }
    store.set({ nvdbAntall: antall });
  }
}
