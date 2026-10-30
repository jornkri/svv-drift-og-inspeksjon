import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import * as proximityOperator from "@arcgis/core/geometry/operators/proximityOperator.js";
import Point from "@arcgis/core/geometry/Point.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import type Geometry from "@arcgis/core/geometry/Geometry.js";
import { tilSr } from "../map/projeksjon.ts";
import { services } from "../services.ts";
import { koble, sorterKoblinger, type Kobling } from "./feltbilde-kobling.ts";

/** Bilde tatt i felt (mobil eller drone), med posisjon i UTM33 og ev. kameraretning. */
export interface Feltbilde {
  id: string;
  tittel: string;
  kilde: "Mobil" | "Drone";
  kamera: string | null;
  tatt: Date | null;
  /** Kameraretning i grader fra nord (drone: gimbal, mobil: kompass) */
  retning: number | null;
  hoydeOverBakken: number | null;
  x: number;
  y: number;
  bildeUrl: string;
  miniUrl: string;
  /** Manuell kobling til et objekt (GlobalId), ellers null */
  objektGlobalid: string | null;
}

export interface KobletBilde extends Feltbilde {
  kobling: Kobling;
}

/**
 * Kilde for feltbilder. I piloten et punktlag i ArcGIS Online med bildene som vedlegg (full
 * størrelse og miniatyr «_mini»).
 * TODO: Trimble Connect-integrasjon – bildene bor der i prosjektet. En TrimbleConnectFeltbilder
 * kan implementere samme grensesnitt (filer med posisjon/retning fra EXIF via Trimble Connect API).
 */
export interface FeltbildeKilde {
  readonly navn: string;
  hent(): Promise<Feltbilde[]>;
}

const UTM33 = new SpatialReference({ wkid: 25833 });

export class ArcGisFeltbilder implements FeltbildeKilde {
  readonly navn = "ArcGIS Online (vedlegg)";
  constructor(private readonly url: string) {}

  async hent(): Promise<Feltbilde[]> {
    const fl = new FeatureLayer({ url: this.url, outFields: ["*"] });
    await fl.load();
    const fs = await fl.queryFeatures({ where: "1=1", outFields: ["*"], returnGeometry: true, outSpatialReference: UTM33 });
    const oidFelt = fl.objectIdField;
    const ids = fs.features.map((f) => f.attributes[oidFelt] as number);
    const vedlegg = ids.length ? await fl.queryAttachments({ objectIds: ids }) : {};
    const bilder = fs.features.flatMap((f): Feltbilde[] => {
      const a = f.attributes as Record<string, unknown>;
      const p = f.geometry as Point | null;
      const liste = vedlegg[a[oidFelt] as number] ?? [];
      const mini = liste.find((v) => /_mini\.jpe?g$/i.test(v.name));
      const full = liste.find((v) => v !== mini && /^image\//.test(v.contentType)) ?? mini;
      if (!p || !full?.url) return [];
      const kilde = a.kilde === "Drone" ? "Drone" : "Mobil";
      return [
        {
          id: String(a.GlobalID ?? a[oidFelt]),
          tittel: (a.tittel as string) || `${kilde}bilde`,
          kilde,
          kamera: (a.kamera as string) ?? null,
          tatt: a.tatt != null ? new Date(a.tatt as number) : null,
          retning: (a.retning as number) ?? null,
          hoydeOverBakken: (a.hoyde_over_bakken as number) ?? null,
          x: p.x,
          y: p.y,
          bildeUrl: full.url,
          miniUrl: mini?.url ?? full.url,
          objektGlobalid: (a.objekt_globalid as string) || null,
        },
      ];
    });
    return bilder.sort((a, b) => (b.tatt?.getTime() ?? 0) - (a.tatt?.getTime() ?? 0));
  }
}

let lastet: Promise<Feltbilde[]> | null = null;

/** Alle feltbilder (hentes én gang). Tom liste når kilden ikke er satt opp eller ikke svarer. */
export function feltbilder(): Promise<Feltbilde[]> {
  if (!lastet) {
    const url = services().cfg.feltbilderUrl;
    lastet = url
      ? new ArcGisFeltbilder(url).hent().catch((e: unknown) => {
          console.warn("Feltbilder kunne ikke hentes", e);
          lastet = null;
          return [];
        })
      : Promise.resolve([]);
  }
  return lastet;
}

/** Feltbildene som hører til et objekt (manuelt, nær eller i synsfeltet), sortert. */
export async function bilderForObjekt(globalid: string, geometri: Geometry): Promise<KobletBilde[]> {
  const alle = await feltbilder();
  if (!alle.length) return [];
  const g = await tilSr(geometri, UTM33);
  const treff = alle.flatMap((b): KobletBilde[] => {
    const n = proximityOperator.getNearestCoordinate(g as never, new Point({ x: b.x, y: b.y, spatialReference: UTM33 }));
    const c = n.coordinate as Point | null;
    if (!c) return [];
    const kobling = koble(b, globalid, { x: c.x, y: c.y });
    return kobling ? [{ ...b, kobling }] : [];
  });
  return sorterKoblinger(treff);
}
