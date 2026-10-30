import Graphic from "@arcgis/core/Graphic.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import Point from "@arcgis/core/geometry/Point.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import type MapView from "@arcgis/core/views/MapView.js";
import { feltbilder, type Feltbilde } from "../data/feltbilder.ts";
import { SYNSFELT_GRADER } from "../data/feltbilde-kobling.ts";
import { tilSr } from "./projeksjon.ts";

/** Felles farge for feltbilder (SVV mørk blå) */
export const FELTBILDE_FARGE: [number, number, number] = [0, 95, 158];
/** Lengden på synsfeltet som tegnes i kartet (m), kortere enn koblingsavstanden for å unngå rot */
const SEKTOR_M = 40;

export const FELTBILDE_SYMBOL = {
  Mobil: new SimpleMarkerSymbol({ style: "circle", size: 11, color: [...FELTBILDE_FARGE, 1], outline: { color: [255, 255, 255, 1], width: 1.5 } }),
  Drone: new SimpleMarkerSymbol({ style: "triangle", size: 13, color: [...FELTBILDE_FARGE, 1], outline: { color: [255, 255, 255, 1], width: 1.5 } }),
};
const SEKTOR = new SimpleFillSymbol({ color: [...FELTBILDE_FARGE, 0.14], outline: { color: [...FELTBILDE_FARGE, 0.5], width: 0.75 } });
/** Bildet som vises i bildeviseren: oransje ring og synsfelt */
const VALGT_RING = new SimpleMarkerSymbol({ style: "circle", size: 26, color: [0, 0, 0, 0], outline: { color: [226, 117, 0, 1], width: 3 } });
const VALGT_SEKTOR = new SimpleFillSymbol({ color: [226, 117, 0, 0.22], outline: { color: [226, 117, 0, 1], width: 1.5 } });
/** Bredden på bildeviseren festet til siden (px); samme som i CSS (.bildeviser--dokket) */
export const DOKK_BREDDE = 440;

/** Synsfelt som kakestykke fra kameraet i retningen (grader fra nord). */
function sektor(b: Feltbilde, wkid: number): Polygon {
  const ring: number[][] = [[b.x, b.y]];
  for (let v = -SYNSFELT_GRADER; v <= SYNSFELT_GRADER; v += 7) {
    const r = ((b.retning! + v) * Math.PI) / 180;
    ring.push([b.x + SEKTOR_M * Math.sin(r), b.y + SEKTOR_M * Math.cos(r)]);
  }
  ring.push([b.x, b.y]);
  return new Polygon({ rings: [ring], spatialReference: { wkid } });
}

/** Feltbilder som punkter (mobil: sirkel, drone: trekant) med synsfelt der retningen er kjent. */
export class FeltbildeLag {
  readonly layer = new GraphicsLayer({ id: "feltbilder", title: "Feltbilder", listMode: "hide" });
  /** Markering av bildet som vises i bildeviseren */
  readonly valgt = new GraphicsLayer({ id: "feltbilde-valgt", listMode: "hide" });
  bilder: Feltbilde[] = [];

  async last(view: MapView): Promise<void> {
    this.bilder = await feltbilder();
    const sr = view.spatialReference;
    const grafikk = await Promise.all(
      this.bilder.map(async (b, i) => {
        const punkt = await tilSr(new Point({ x: b.x, y: b.y, spatialReference: { wkid: 25833 } }), sr);
        const g = [new Graphic({ geometry: punkt, symbol: FELTBILDE_SYMBOL[b.kilde], attributes: { feltbilde: i } })];
        if (b.retning != null) g.unshift(new Graphic({ geometry: await tilSr(sektor(b, 25833), sr), symbol: SEKTOR, attributes: { feltbilde: i } }));
        return g;
      }),
    );
    // Sektorene under punktene
    this.layer.removeAll();
    this.layer.addMany(grafikk.flatMap((g) => g.filter((x) => x.geometry?.type === "polygon")));
    this.layer.addMany(grafikk.flatMap((g) => g.filter((x) => x.geometry?.type === "point")));
  }

  /**
   * Markerer bildet som vises. Er bildeviseren festet til siden, får kartet tilsvarende polstring,
   * og kartet flyttes til bildet når det ligger utenfor det synlige området.
   */
  async marker(view: MapView, a: { x: number; y: number; retning: number | null; dokket: boolean } | null): Promise<void> {
    this.valgt.removeAll();
    const smal = view.width < 700;
    const ingen = { left: 0, top: 0, right: 0, bottom: 0 };
    view.padding = a?.dokket ? (smal ? { ...ingen, bottom: Math.round(view.height * 0.55) } : { ...ingen, right: DOKK_BREDDE }) : ingen;
    if (!a) return;
    const sr = view.spatialReference;
    const punkt = await tilSr(new Point({ x: a.x, y: a.y, spatialReference: { wkid: 25833 } }), sr);
    const b = { x: a.x, y: a.y, retning: a.retning } as Feltbilde;
    if (a.retning != null) this.valgt.add(new Graphic({ geometry: await tilSr(sektor(b, 25833), sr), symbol: VALGT_SEKTOR }));
    this.valgt.add(new Graphic({ geometry: punkt, symbol: VALGT_RING }));
    // view.extent tar ikke hensyn til polstringen; sjekk mot det synlige området
    const s = view.toScreen(punkt);
    const p = view.padding;
    const synlig = s && s.x > (p.left ?? 0) + 30 && s.x < view.width - (p.right ?? 0) - 30 && s.y > (p.top ?? 0) + 30 && s.y < view.height - (p.bottom ?? 0) - 30;
    if (!synlig) await view.goTo({ target: punkt, scale: Math.min(view.scale, 5000) }).catch(() => undefined);
  }

  /** Bildet som ble klikket (punktet, ikke sektoren), eller null. */
  async treff(view: MapView, e: { x: number; y: number }): Promise<number | null> {
    if (!this.layer.visible) return null;
    const r = (await view.hitTest(e as never, { include: [this.layer] })).results.find(
      (x) => x.type === "graphic" && x.graphic.geometry?.type === "point",
    );
    const i = r && "graphic" in r ? (r.graphic.attributes?.feltbilde as number | undefined) : undefined;
    return i ?? null;
  }
}
