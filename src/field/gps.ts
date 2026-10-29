import Point from "@arcgis/core/geometry/Point.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import * as projectOperator from "@arcgis/core/geometry/operators/projectOperator.js";
import type { Fix } from "./geofence.ts";

export interface GpsSource {
  readonly simulert: boolean;
  start(onFix: (f: Fix) => void, onError: (msg: string) => void): void;
  stop(): void;
}

const UTM33 = new SpatialReference({ wkid: 25833 });

/** Ekte GPS via navigator.geolocation.watchPosition (enableHighAccuracy), projisert til UTM33. */
export class BrowserGps implements GpsSource {
  readonly simulert = false;
  private watchId: number | null = null;

  start(onFix: (f: Fix) => void, onError: (msg: string) => void): void {
    if (!("geolocation" in navigator)) {
      onError("Enheten støtter ikke posisjonering");
      return;
    }
    void projectOperator.load().then(() => {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const p = projectOperator.execute(new Point({ longitude: pos.coords.longitude, latitude: pos.coords.latitude }), UTM33) as Point | null;
          if (!p) return;
          onFix({ x: p.x, y: p.y, accuracy: pos.coords.accuracy, heading: pos.coords.heading, timestamp: pos.timestamp });
        },
        (err) => onError(err.code === err.PERMISSION_DENIED ? "Tilgang til posisjon er avslått" : "Fant ikke posisjonen"),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
      );
    });
  }

  stop(): void {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

/**
 * Simulert GPS (?simgps=1): går en rute langs testområdet med én posisjon i sekundet,
 * nøyaktighet ±3 m og en unøyaktig posisjon innimellom (som skal forkastes).
 */
export class SimulatedGps implements GpsSource {
  readonly simulert = true;
  private timer: number | null = null;
  private i = 0;

  constructor(
    private readonly rute: [number, number][],
    private readonly intervalMs = 1000,
  ) {}

  start(onFix: (f: Fix) => void): void {
    const tick = () => {
      const n = this.rute.length;
      const k = this.i % n;
      const [x, y] = this.rute[k]!;
      const [nx, ny] = this.rute[(k + 1) % n]!;
      const heading = ((Math.atan2(nx - x, ny - y) * 180) / Math.PI + 360) % 360;
      const bad = this.i > 0 && this.i % 40 === 0;
      onFix({ x, y, accuracy: bad ? 24 : 3, heading, timestamp: Date.now() });
      this.i++;
    };
    tick();
    this.timer = window.setInterval(tick, this.intervalMs);
  }

  stop(): void {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }
}

/** Kompassretning fra enheten (for bilder), om tilgjengelig. */
export function watchCompass(onHeading: (deg: number) => void): () => void {
  const handler = (e: DeviceOrientationEvent) => {
    const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    if (typeof ios === "number") onHeading(ios);
    else if (e.absolute && e.alpha != null) onHeading((360 - e.alpha) % 360);
  };
  window.addEventListener("deviceorientationabsolute", handler as EventListener);
  window.addEventListener("deviceorientation", handler);
  return () => {
    window.removeEventListener("deviceorientationabsolute", handler as EventListener);
    window.removeEventListener("deviceorientation", handler);
  };
}
