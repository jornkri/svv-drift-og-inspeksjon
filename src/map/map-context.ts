import type MapView from "@arcgis/core/views/MapView.js";
import type SceneView from "@arcgis/core/views/SceneView.js";
import type { ObjectLayerController } from "./object-layers.ts";

export interface MapContext {
  dim: "2d" | "3d";
  /** id på arcgis-map/arcgis-scene-elementet (referenceElement for komponenter) */
  elementId: string;
  view: MapView | SceneView;
  objects: ObjectLayerController;
}

let current: MapContext | null = null;
const listeners = new Set<(c: MapContext | null) => void>();

/** Aktiv kartvisning (2D eller 3D), slik at kontroller og paneler kan bruke den. */
export function setMapContext(c: MapContext | null): void {
  current = c;
  listeners.forEach((l) => l(c));
}

export function mapContext(): MapContext | null {
  return current;
}

export function onMapContext(l: (c: MapContext | null) => void): () => void {
  listeners.add(l);
  l(current);
  return () => listeners.delete(l);
}
