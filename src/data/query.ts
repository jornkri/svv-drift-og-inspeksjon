import Point from "@arcgis/core/geometry/Point.js";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import { fromAttributes, type FieldMap, type Objekt } from "./schema.ts";
import type { ObjektTreff } from "./DataService.ts";

const SR = { wkid: 25833 };

/**
 * Spør objektlagene med punkt og avstand (geometry: point, distance, units: "meters").
 * Felles for mock (klientlag) og portal (feature-tjenester).
 */
export async function queryLayersNearby(
  layers: FeatureLayer[],
  fields: FieldMap<Objekt>,
  x: number,
  y: number,
  radiusM: number,
): Promise<ObjektTreff[]> {
  const geometry = new Point({ x, y, spatialReference: SR });
  const results = await Promise.all(
    layers.map(async (layer) => {
      try {
        const fs = await layer.queryFeatures({
          geometry,
          distance: radiusM,
          units: "meters",
          spatialRelationship: "intersects",
          outFields: ["*"],
          returnGeometry: true,
          returnZ: true,
          outSpatialReference: SR,
        });
        return fs.features.map((f) => ({ objekt: fromAttributes<Objekt>(f.attributes, fields), geometry: f.geometry! }));
      } catch (e) {
        console.warn(`Nærhetsspørring feilet for ${layer.title}`, e);
        return [];
      }
    }),
  );
  return results.flat();
}

export async function queryLayersWhere(
  layers: FeatureLayer[],
  fields: FieldMap<Objekt>,
  where: string,
  num?: number,
): Promise<ObjektTreff[]> {
  const results = await Promise.all(
    layers.map(async (layer) => {
      try {
        const fs = await layer.queryFeatures({
          where,
          outFields: ["*"],
          returnGeometry: true,
          returnZ: true,
          outSpatialReference: SR,
          ...(num ? { num } : {}),
        });
        return fs.features.map((f) => ({ objekt: fromAttributes<Objekt>(f.attributes, fields), geometry: f.geometry! }));
      } catch (e) {
        console.warn(`Spørring feilet for ${layer.title}`, e);
        return [];
      }
    }),
  );
  return results.flat();
}
