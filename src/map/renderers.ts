import ClassBreaksRenderer from "@arcgis/core/renderers/ClassBreaksRenderer.js";
import type Renderer from "@arcgis/core/renderers/Renderer.js";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer.js";

import LineSymbol3D from "@arcgis/core/symbols/LineSymbol3D.js";
import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D.js";
import PolygonSymbol3D from "@arcgis/core/symbols/PolygonSymbol3D.js";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import type { GeometryKind, ObjectLayerHandle } from "../data/DataService.ts";
import type { Fag, FieldMap, Objekt } from "../data/schema.ts";
import { classBreaks } from "../filters/mmi.ts";

export type Dim = "2d" | "3d";

/** Fagfarger (SVV-profil): VA blå hel linje, Elektro oransje stiplet, Veg grå flate. */
export const FAG_STIL: Record<Fag, { farge: string; mork: string }> = {
  VA: { farge: "#077197", mork: "#065e7f" },
  Elektro: { farge: "#e27500", mork: "#b35d00" },
  Veg: { farge: "#858d90", mork: "#444f55" },
};

/** Symbol for ett objekt i fagsymbolikk eller med gitt farge (MMI). */
export type AnySymbol = SimpleFillSymbol | SimpleMarkerSymbol | SimpleLineSymbol | PointSymbol3D | LineSymbol3D | PolygonSymbol3D;

export function symbolFor(fag: Fag, kind: GeometryKind, objekttype: string | null, dim: Dim, color?: string): AnySymbol {
  const stil = FAG_STIL[fag];
  const c = color ?? stil.farge;
  const dark = color ?? stil.mork;
  if (dim === "2d") {
    if (kind === "polygon") {
      return new SimpleFillSymbol({
        color: color ? hexA(color, 0.55) : objekttype === "Grøft" ? hexA("#a8b2b5", 0.6) : hexA("#dadada", 0.85),
        outline: { color: color ?? "#444f55", width: 0.75 },
      });
    }
    if (kind === "point") {
      if (fag === "VA") return new SimpleMarkerSymbol({ style: "circle", size: 9, color: "#ffffff", outline: { color: c, width: 2.25 } });
      if (objekttype === "Teknisk skap") return new SimpleMarkerSymbol({ style: "square", size: 10, color: color ?? "#444f55", outline: { color: "#ffffff", width: 1 } });
      return new SimpleMarkerSymbol({ style: "square", size: 8, color: c, outline: { color: "#ffffff", width: 1 } });
    }
    // linjer
    if (fag === "Elektro") return new SimpleLineSymbol({ color: c, width: 2.5, style: "dash" });
    if (fag === "Veg") return new SimpleLineSymbol({ color: color ?? (objekttype === "Rekkverk" ? "#444f55" : "#697277"), width: objekttype === "Rekkverk" ? 2 : 1.5, style: objekttype === "Kantstein" ? "short-dash" : "solid" });
    if (objekttype === "Ledningsgrøft") return new SimpleLineSymbol({ color: dark, width: 5 });
    if (objekttype === "Drensledning") return new SimpleLineSymbol({ color: color ?? "#4f9bb8", width: 1.75 });
    return new SimpleLineSymbol({ color: c, width: 2.5 });
  }

  // 3D
  if (kind === "polygon") {
    return new PolygonSymbol3D({
      symbolLayers: [{ type: "fill", material: { color: color ? hexA(color, 0.7) : objekttype === "Grøft" ? "#a8b2b5" : "#9aa1a4" }, outline: { color: "#444f55", size: 0.5 } }],
    });
  }
  if (kind === "point") {
    if (objekttype === "Belysningsmast") {
      return new PointSymbol3D({ symbolLayers: [{ type: "object", resource: { primitive: "cylinder" }, width: 0.3, depth: 0.3, height: 8, anchor: "bottom", material: { color: c } }] });
    }
    if (objekttype === "Teknisk skap") {
      return new PointSymbol3D({ symbolLayers: [{ type: "object", resource: { primitive: "cube" }, width: 0.8, depth: 0.5, height: 1.4, anchor: "bottom", material: { color: color ?? "#444f55" } }] });
    }
    return new PointSymbol3D({ symbolLayers: [{ type: "object", resource: { primitive: "cylinder" }, width: 1.2, depth: 1.2, height: 2.2, anchor: "top", material: { color: c } }] });
  }
  const size =
    objekttype === "Ledningsgrøft" ? 0.8 : fag === "VA" ? 0.4 : fag === "Elektro" ? 0.25 : objekttype === "Rekkverk" ? 0.15 : 0.2;
  const height = objekttype === "Rekkverk" ? 0.75 : size;
  return new LineSymbol3D({
    symbolLayers: [
      {
        type: "path",
        profile: fag === "Veg" ? "quad" : "circle",
        width: size,
        height,
        anchor: fag === "Veg" ? "bottom" : "center",
        material: { color: objekttype === "Ledningsgrøft" ? dark : c },
        cap: "round",
      },
    ],
  });
}

function hexA(hex: string, a: number): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

const TYPES: Record<Fag, string[]> = {
  VA: ["Overvannsledning", "Ledningsgrøft", "Drensledning", "Kum", "Sandfang"],
  Elektro: ["Kabelgrøft", "Belysningsmast", "Teknisk skap"],
  Veg: ["Vegoverbygning", "Grøft", "Rekkverk", "Kantstein"],
};

/** Fagsymbolikk: unike verdier på objekttype med standardsymbol per fag. */
export function fagRenderer(h: Pick<ObjectLayerHandle, "fag" | "geometryKind">, fields: FieldMap<Objekt>, dim: Dim): Renderer {
  return new UniqueValueRenderer({
    field: fields.objekttype,
    defaultSymbol: symbolFor(h.fag, h.geometryKind, null, dim),
    defaultLabel: h.fag,
    uniqueValueInfos: TYPES[h.fag].map((t) => ({ value: t, label: t, symbol: symbolFor(h.fag, h.geometryKind, t, dim) })),
  });
}

/** Fasefarger: klassifiserer mmi i MMI-veilederens faser. */
export function mmiRenderer(h: Pick<ObjectLayerHandle, "fag" | "geometryKind">, fields: FieldMap<Objekt>, dim: Dim): Renderer {
  return new ClassBreaksRenderer({
    field: fields.mmi,
    defaultSymbol: symbolFor(h.fag, h.geometryKind, null, dim, "#858d90"),
    defaultLabel: "Uten MMI",
    classBreakInfos: classBreaks().map((b) => ({
      minValue: b.minValue,
      maxValue: b.maxValue,
      label: b.label,
      symbol: symbolFor(h.fag, h.geometryKind, null, dim, b.color),
    })),
  });
}
