import Graphic from "@arcgis/core/Graphic.js";
import type Geometry from "@arcgis/core/geometry/Geometry.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import type Field from "@arcgis/core/layers/support/Field.js";
import type { GeometryKind, ObjectLayerHandle } from "./DataService.ts";
import type { Fag, Objekt } from "./schema.ts";

const SR = { wkid: 25833 };

/** Feltene i klientbaserte objektlag (appens logiske skjema). */
export const OBJEKT_LAG_FELT: Partial<Field>[] = [
  { name: "oid", type: "oid" },
  { name: "globalid", type: "string", length: 38 },
  { name: "objekt_id", type: "string", alias: "Objekt-ID" },
  { name: "navn", type: "string", alias: "Navn" },
  { name: "fag", type: "string", alias: "Fag" },
  { name: "objekttype", type: "string", alias: "Objekttype" },
  { name: "mmi", type: "integer", alias: "MMI" },
  { name: "revisjon", type: "string", alias: "Revisjon" },
  { name: "rev_dato", type: "date", alias: "Revisjonsdato" },
  { name: "status_inspeksjon", type: "string", alias: "Inspeksjonsstatus" },
  { name: "vegreferanse", type: "string", alias: "Vegreferanse" },
  { name: "kote_min", type: "double", alias: "Kote min" },
  { name: "kote_max", type: "double", alias: "Kote maks" },
  { name: "lengde_m", type: "double", alias: "Lengde (m)" },
  { name: "fagmodell", type: "string", alias: "Fagmodell" },
  { name: "modellfil", type: "string", alias: "Modellfil" },
  { name: "modellert_av", type: "string", alias: "Modellert av" },
  { name: "prosjekt", type: "string", alias: "Prosjekt" },
  { name: "ifc_guid", type: "string", alias: "IFC GlobalId" },
  { name: "ifc_klasse", type: "string", alias: "IFC-klasse" },
  { name: "lastet_inn", type: "date", alias: "Lastet inn" },
];

export interface KlientObjekt {
  objekt: Objekt;
  geometry: Geometry;
  /** Nøkkelen til laget objektet hører til */
  lag: string;
  oid: number;
}

export interface KlientLagDef {
  key: string;
  fag: Fag;
  kind: GeometryKind;
  title: string;
}

export function objektAttributter(o: Objekt, oid: number): Record<string, unknown> {
  return {
    ...o,
    oid,
    rev_dato: o.rev_dato ? Date.parse(o.rev_dato) : null,
    lastet_inn: o.lastet_inn ? Date.parse(o.lastet_inn) : null,
  };
}

/**
 * Klientbaserte FeatureLayers (ett per lagdefinisjon) med appens skjema. Brukes av mock og
 * av portalmodus når kildelagene har et annet skjema (f.eks. BIM-eksport fra IFC).
 * Objekter uten Z plasseres i 3D på midten av kotespennet (kote_min–kote_max).
 */
export function lagKlientLag(defs: KlientLagDef[], objekter: KlientObjekt[]): ObjectLayerHandle[] {
  return defs.map((def) => {
    const egne = objekter.filter((o) => o.lag === def.key);
    const source = egne.map((o) => new Graphic({ geometry: o.geometry.clone(), attributes: objektAttributter(o.objekt, o.oid) }));
    const hasZ = egne.some((o) => o.geometry.hasZ);
    const layer = new FeatureLayer({
      id: `obj-${def.key}`,
      title: def.title,
      source,
      fields: OBJEKT_LAG_FELT as Field[],
      objectIdField: "oid",
      geometryType: def.kind,
      hasZ,
      spatialReference: SR,
      outFields: ["*"],
      popupEnabled: false,
      elevationInfo: hasZ
        ? { mode: "absolute-height" }
        : { mode: "absolute-height", featureExpressionInfo: { expression: "($feature.kote_min + $feature.kote_max) / 2" } },
    });
    return { key: def.key, fag: def.fag, geometryKind: def.kind, title: def.title, layer };
  });
}
