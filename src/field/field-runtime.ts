import type Geometry from "@arcgis/core/geometry/Geometry.js";
import Point from "@arcgis/core/geometry/Point.js";
import * as distanceOperator from "@arcgis/core/geometry/operators/distanceOperator.js";
import type { ObjektTreff } from "../data/DataService.ts";
import { services } from "../services.ts";
import { store } from "../state/store.ts";
import { Geofence, type Fix } from "./geofence.ts";
import { BrowserGps, SimulatedGps, type GpsSource } from "./gps.ts";
import { rensRute, startIndeks, type RutePunkt } from "./sim-rute.ts";

let gps: GpsSource | null = null;
let fence: Geofence<ObjektTreff> | null = null;
let lastFix: Fix | null = null;

export const isSimGps = () => new URLSearchParams(location.search).get("simgps") === "1";

function distance(x: number, y: number, g: unknown): number {
  const p = new Point({ x, y, spatialReference: { wkid: 25833 } });
  return distanceOperator.execute(p, g as Geometry as never);
}

/** Starter GPS og geofence (én gang). Brukes av feltkartet og inspeksjonsskjemaet. */
export async function startFieldRuntime(): Promise<void> {
  if (gps) return;
  const { cfg, data } = services();
  if (isSimGps()) {
    const rute = rensRute((await import("../data/mock/sim-rute.json")).default.punkter as [number | null, number | null][]);
    const sim = (gps = new SimulatedGps(rute));
    sim.settStart(await simStart(rute));
  } else {
    gps = new BrowserGps();
  }
  fence = new Geofence<ObjektTreff>({
    radiusM: cfg.geofence.radiusM,
    maxAccuracyM: cfg.geofence.maxAccuracyM,
    debounceMs: cfg.geofence.debounceMs,
    query: async (x, y, r) => (await data.queryNearby(x, y, r)).map((t) => ({ id: t.objekt.globalid, item: t, geometry: t.geometry })),
    distance,
    onUpdate: (u) => {
      store.set({ naer: u.nearby.map((n) => ({ ...n.item, avstand: n.distance })) });
      if (u.entered) {
        // Nærmeste objekt blir standardobjekt for inspeksjonen
        store.set({ valgtNaer: u.entered.id });
        if (navigator.vibrate) navigator.vibrate(60);
      } else if (u.left && store.get().valgtNaer === u.left) {
        store.set({ valgtNaer: u.nearest?.id ?? null });
      }
    },
    onRejected: (_f, reason) => store.set((s) => ({ gps: { ...s.gps, feil: reason } })),
  });
  store.set((s) => ({ gps: { ...s.gps, aktiv: true, simulert: gps!.simulert } }));
  gps.start(
    (fix) => {
      lastFix = fix;
      const ok = fix.accuracy <= cfg.geofence.maxAccuracyM;
      store.set({
        gps: { aktiv: true, simulert: gps!.simulert, manuell: gps instanceof SimulatedGps && gps.erManuell, x: fix.x, y: fix.y, noyaktighet: fix.accuracy, retning: fix.heading ?? null, feil: ok ? null : store.get().gps.feil },
      });
      fence!.push(fix);
    },
    (msg) => store.set((s) => ({ gps: { ...s.gps, aktiv: false, feil: msg } })),
  );
}

/**
 * Simulert tur: start litt før rutepunktet nærmest et objekt, så man raskt kommer innenfor
 * geofence-radiusen. Objektene hentes med én spørring rundt rutens midtpunkt.
 */
async function simStart(rute: RutePunkt[]): Promise<number> {
  if (!rute.length) return 0;
  const cx = rute.reduce((a, p) => a + p[0], 0) / rute.length;
  const cy = rute.reduce((a, p) => a + p[1], 0) / rute.length;
  const r = Math.max(...rute.map(([x, y]) => Math.hypot(x - cx, y - cy))) + services().cfg.geofence.radiusM;
  const objekter = await services()
    .data.queryNearby(cx, cy, r)
    .catch(() => []);
  return startIndeks(rute, ([x, y]) => Math.min(...objekter.map((o) => distance(x, y, o.geometry))));
}

/** Simulert GPS: flytter posisjonen til (x, y) i UTM33 (trykk i kartet). */
export function flyttSimulertPosisjon(x: number, y: number): void {
  if (gps instanceof SimulatedGps) gps.flyttTil(x, y);
}

/** Simulert GPS: fortsetter turen fra nærmeste rutepunkt. */
export function fortsettSimulertTur(): void {
  if (gps instanceof SimulatedGps) gps.fortsett();
}

export function currentFix(): Fix | null {
  return lastFix;
}

export function stopFieldRuntime(): void {
  gps?.stop();
  fence?.dispose();
  gps = null;
  fence = null;
}
