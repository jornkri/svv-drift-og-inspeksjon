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
