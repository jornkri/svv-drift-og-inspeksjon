import type Geometry from "@arcgis/core/geometry/Geometry.js";
import type SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import * as projectOperator from "@arcgis/core/geometry/operators/projectOperator.js";

/**
 * Projiserer en geometri til visningens koordinatsystem når de er ulike. Appen jobber i
 * UTM33, mens en webscene fra ArcGIS Online normalt er global (Web Mercator).
 */
export async function tilSr<T extends Geometry>(g: T, sr: SpatialReference | null | undefined): Promise<T> {
  if (!sr || !g.spatialReference || g.spatialReference.equals(sr)) return g;
  if (!projectOperator.isLoaded()) await projectOperator.load();
  return (projectOperator.execute(g as never, sr) as unknown as T | null) ?? g;
}

/** Synkron variant for mange geometrier (krever at tilSr/lastProjeksjon er kjørt først). */
export function tilSrSync<T extends Geometry>(g: T, sr: SpatialReference): T {
  if (!g.spatialReference || g.spatialReference.equals(sr)) return g;
  return (projectOperator.execute(g as never, sr) as unknown as T | null) ?? g;
}

export async function lastProjeksjon(): Promise<void> {
  if (!projectOperator.isLoaded()) await projectOperator.load();
}
