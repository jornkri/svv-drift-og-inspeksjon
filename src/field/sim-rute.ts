/** Ren rutelogikk for simulert GPS (uten ArcGIS, enhetstestes). */

export type RutePunkt = [number, number];

/** Fjerner hull i ruten ([null, null] markerer et sprang mellom to strekninger). */
export function rensRute(punkter: readonly (readonly [number | null, number | null])[]): RutePunkt[] {
  return punkter.filter((p): p is RutePunkt => p[0] != null && p[1] != null);
}

/** Indeksen til rutepunktet nærmest (x, y). */
export function naermesteIndeks(rute: readonly RutePunkt[], x: number, y: number): number {
  let best = 0;
  let min = Infinity;
  rute.forEach(([px, py], i) => {
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < min) {
      min = d;
      best = i;
    }
  });
  return best;
}

/** Går `meter` bakover langs ruten (rundtur) fra indeks i, slik at man går inn mot målet. */
export function bakover(rute: readonly RutePunkt[], i: number, meter: number): number {
  const n = rute.length;
  let k = i;
  let gatt = 0;
  for (let s = 0; s < n - 1 && gatt < meter; s++) {
    const forrige = (k - 1 + n) % n;
    gatt += Math.hypot(rute[k]![0] - rute[forrige]![0], rute[k]![1] - rute[forrige]![1]);
    k = forrige;
  }
  return k;
}

/**
 * Startindeks for turen: litt før det rutepunktet som ligger nærmest et objekt,
 * så det ikke tar lang tid før man er innenfor geofence-radiusen.
 */
export function startIndeks(rute: readonly RutePunkt[], avstandTilObjekt: (p: RutePunkt) => number, innlopM = 20): number {
  if (!rute.length) return 0;
  let best = 0;
  let min = Infinity;
  rute.forEach((p, i) => {
    const d = avstandTilObjekt(p);
    if (d < min) {
      min = d;
      best = i;
    }
  });
  return Number.isFinite(min) ? bakover(rute, best, innlopM) : 0;
}
