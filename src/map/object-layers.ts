import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import type Geometry from "@arcgis/core/geometry/Geometry.js";
import type Graphic from "@arcgis/core/Graphic.js";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import FeatureFilter from "@arcgis/core/layers/support/FeatureFilter.js";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer.js";
import PolygonSymbol3D from "@arcgis/core/symbols/PolygonSymbol3D.js";
import type FeatureLayerView from "@arcgis/core/views/layers/FeatureLayerView.js";
import type MapView from "@arcgis/core/views/MapView.js";
import type SceneView from "@arcgis/core/views/SceneView.js";
import type { DataService, ObjectLayerHandle, ObjektStat } from "../data/DataService.ts";
import { computeCounts } from "../filters/counts.ts";
import { buildWhere } from "../filters/filters.ts";
import { store } from "../state/store.ts";
import { kildeRenderer } from "./kildestil.ts";
import { tilSr } from "./projeksjon.ts";
import { fagRenderer, mmiRenderer, type Dim } from "./renderers.ts";

type View = MapView | SceneView;

const USYNLIG_3D = new SimpleRenderer({
  symbol: new PolygonSymbol3D({ symbolLayers: [{ type: "fill", material: { color: [255, 255, 255, 0.02] }, outline: { color: [0, 0, 0, 0], size: 0 } }] }),
});
type Highlight = { remove(): void };

/**
 * Objektlagene i én visning (2D eller 3D): filtrering med FeatureFilter på layer
 * view (ingen ny datahenting), renderer-bytte, live telling og utvalg.
 */
export class ObjectLayerController {
  readonly handles: ObjectLayerHandle[];
  private stats: ObjektStat[] = [];
  private unsubs: (() => void)[] = [];
  private highlights: Highlight[] = [];
  private countSeq = 0;

  constructor(
    private readonly view: View,
    private readonly dim: Dim,
    private readonly data: DataService,
  ) {
    this.handles = data.createObjectLayers();
  }

  async start(): Promise<void> {
    const map = this.view.map!;
    map.addMany(this.handles.map((h) => h.layer));
    this.applyRenderer();
    // Markering i SVV-oransje
    const hl = this.view.highlights?.find((h) => h.name === "default");
    if (hl) {
      hl.color = "#ff9600" as never;
      hl.haloColor = "#e27500" as never;
      hl.fillOpacity = 0.3;
      hl.haloOpacity = 1;
    }
    this.stats = await this.data.objectStats();
    await Promise.all(this.handles.map((h) => this.view.whenLayerView(h.layer).catch(() => null)));
    await this.applyFilters();
    this.unsubs.push(
      store.select((s) => s.filters, () => void this.applyFilters()),
      store.select((s) => s.colorByMmi, () => this.applyRenderer()),
      store.select((s) => s.selection, (sel) => void this.highlightSelection(sel)),
    );
    void this.highlightSelection(store.get().selection);
  }

  destroy(): void {
    this.unsubs.forEach((u) => u());
    this.highlights.forEach((h) => h.remove());
  }

  /** Oppdaterer statistikken etter endringer i data (f.eks. ny inspeksjon). */
  async refreshStats(): Promise<void> {
    this.stats = await this.data.objectStats();
    await this.updateCounts();
  }

  private applyRenderer(): void {
    const fields = this.data.objektFields;
    const byMmi = store.get().colorByMmi;
    for (const h of this.handles) {
      if (this.dim === "3d" && this.skjulteFlater.has(h.key)) h.layer.renderer = USYNLIG_3D.clone();
      else if (byMmi) h.layer.renderer = mmiRenderer(h, fields, this.dim);
      else h.layer.renderer = h.kildeRenderer ? kildeRenderer(h.kildeRenderer, fields.objekttype, this.dim) : fagRenderer(h, fields, this.dim);
    }
  }

  private skjulteFlater = new Set<string>();

  /**
   * 3D: lag som vises som egen 3D-modell (scenelag i webscenen) tegnes nesten usynlig, men kan
   * fortsatt velges og utheves. Kalles med nøklene til lagene som har synlig modell.
   */
  settModellLag(keys: string[]): void {
    this.skjulteFlater = new Set(keys);
    this.applyRenderer();
  }

  private async layerView(layer: FeatureLayer): Promise<FeatureLayerView | null> {
    try {
      return (await this.view.whenLayerView(layer)) as unknown as FeatureLayerView;
    } catch {
      return null;
    }
  }

  private whereFor(h: ObjectLayerHandle): string {
    return buildWhere(store.get().filters, this.data.objektFields, h.fag);
  }

  async applyFilters(): Promise<void> {
    await Promise.all(
      this.handles.map(async (h) => {
        const lv = await this.layerView(h.layer);
        if (lv) lv.filter = new FeatureFilter({ where: this.whereFor(h) });
      }),
    );
    await this.updateCounts();
  }

  /** «X av N»: X telles med queryFeatureCount på layer views, N er alle objekter. */
  async updateCounts(): Promise<void> {
    const seq = ++this.countSeq;
    const filters = store.get().filters;
    const c = computeCounts(this.stats, filters);
    const counts = await Promise.all(
      this.handles.map(async (h) => {
        const where = this.whereFor(h);
        if (where === "1=0") return 0;
        const lv = await this.layerView(h.layer);
        if (!lv) return 0;
        await reactiveUtils.whenOnce(() => !lv.dataUpdating).catch(() => undefined);
        try {
          return lv.hasAllFeatures ? await lv.queryFeatureCount({ where }) : await h.layer.queryFeatureCount({ where });
        } catch {
          return 0;
        }
      }),
    );
    if (seq !== this.countSeq) return;
    const shown = counts.reduce((a, b) => a + b, 0);
    store.set({ counts: { ...c, shown } });
  }

  /** Objekter under et skjermpunkt (alle treff, nærmeste først). */
  async hitTest(event: { x: number; y: number }): Promise<string[]> {
    const layers = this.handles.map((h) => h.layer);
    const res = await this.view.hitTest(event as never, { include: layers });
    const gf = this.data.objektFields.globalid;
    const ids: string[] = [];
    for (const r of res.results) {
      if (r.type !== "graphic") continue;
      const g = (r as { graphic: Graphic }).graphic;
      const id = g.attributes?.[gf] as string | undefined;
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  private async highlightSelection(sel: { globalids: string[]; index: number } | null): Promise<void> {
    this.highlights.forEach((h) => h.remove());
    this.highlights = [];
    const id = sel?.globalids[sel.index];
    if (!id) return;
    const gf = this.data.objektFields.globalid;
    await Promise.all(
      this.handles.map(async (h) => {
        const lv = await this.layerView(h.layer);
        if (!lv) return;
        try {
          const ids = await lv.queryObjectIds({ where: `${gf} = '${id.replace(/'/g, "''")}'` });
          if (ids.length) this.highlights.push(lv.highlight(ids));
        } catch {
          /* laget har ikke objektet */
        }
      }),
    );
  }

  async goTo(geometri: Geometry, opts: { scale?: number } = {}): Promise<void> {
    const geometry = await tilSr(geometri, this.view.spatialReference);
    const minScale = opts.scale ?? 1200;
    if (geometry.type === "point" || this.dim === "3d") {
      await this.view.goTo({ target: geometry, scale: minScale } as never, { duration: 600 }).catch(() => undefined);
      return;
    }
    // Vis hele objektet, men ikke nærmere enn minScale
    const ext = geometry.extent!.clone().expand(2.2);
    await this.view.goTo({ target: ext } as never, { duration: 0, animate: false }).catch(() => undefined);
    if (this.view.scale < minScale) await this.view.goTo({ target: ext.center, scale: minScale } as never, { duration: 400 }).catch(() => undefined);
  }
}
