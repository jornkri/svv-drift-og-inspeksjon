import Graphic from "@arcgis/core/Graphic.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol.js";
import type MapView from "@arcgis/core/views/MapView.js";
import type { AppConfig } from "../config.ts";
import { fetchVegnett } from "./search.ts";

const SYMBOL = new SimpleLineSymbol({ color: [68, 79, 85, 0.55], width: 1.5, style: "solid" });
const MAX_SCALE = 30000;

/**
 * Referanselag med vegnettet fra NVDB API Les, hentet for kartutsnittet når kartet står i ro.
 */
export class NvdbVegnettLayer {
  readonly layer = new GraphicsLayer({ id: "nvdb-vegnett", title: "NVDB vegnett", listMode: "hide" });
  private covered: [number, number, number, number] | null = null;
  private ctrl: AbortController | null = null;
  private handle: { remove(): void } | null = null;

  constructor(private readonly cfg: AppConfig) {}

  attach(view: MapView): void {
    this.handle = reactiveUtils.watch(
      () => [view.stationary, view.extent, this.layer.visible] as const,
      ([stationary]) => {
        if (stationary) void this.refresh(view);
      },
      { initial: true },
    );
  }

  detach(): void {
    this.handle?.remove();
    this.ctrl?.abort();
  }

  private async refresh(view: MapView) {
    if (!this.layer.visible || !view.extent || view.scale > MAX_SCALE) return;
    const e = view.extent;
    const c = this.covered;
    if (c && e.xmin >= c[0] && e.ymin >= c[1] && e.xmax <= c[2] && e.ymax <= c[3]) return;
    const ex = e.clone().expand(1.6);
    const bbox: [number, number, number, number] = [ex.xmin, ex.ymin, ex.xmax, ex.ymax];
    this.ctrl?.abort();
    const ctrl = (this.ctrl = new AbortController());
    try {
      const veger = await fetchVegnett(this.cfg, bbox, ctrl.signal);
      if (ctrl.signal.aborted) return;
      this.layer.removeAll();
      this.layer.addMany(
        veger.map(
          (v) =>
            new Graphic({
              geometry: new Polyline({ paths: [v.paths], spatialReference: { wkid: 25833 } }),
              symbol: SYMBOL,
              attributes: { vegsystemreferanse: v.kortform },
            }),
        ),
      );
      this.covered = bbox;
    } catch (e) {
      if (!ctrl.signal.aborted) console.warn("NVDB vegnett kunne ikke hentes", e);
    }
  }
}
