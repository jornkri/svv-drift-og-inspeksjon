/**
 * Geofencing for felt: posisjon → nærmeste objekt.
 *
 * 1. Posisjoner med dårligere nøyaktighet enn terskelen (standard 10 m) forkastes.
 * 2. Spørringer begrenses til én per `debounceMs` (standard 2 s) med siste posisjon.
 *    En ren debounce ville aldri slått til mens brukeren går (GPS gir en posisjon i sekundet),
 *    så vi bruker «siste posisjon etter 2 s ro eller hvert 2. sekund», dvs. debounce med maks ventetid.
 * 3. Objektlagene spørres med punkt og avstand (radius, standard 15 m), og treffene sorteres på
 *    faktisk avstand til geometrien (distanceFn – i appen geometry operators, som erstatter geometryEngine).
 * 4. Når brukeren går inn i et nytt objekts sone, meldes det som «entered»; nærmeste objekt blir
 *    standardobjektet for inspeksjonen.
 *
 * Ingen avhengighet til ArcGIS – spørring og avstand sendes inn, slik at logikken kan enhetstestes.
 */

export interface Fix {
  x: number;
  y: number;
  /** Nøyaktighet i meter (radius, 68 %) */
  accuracy: number;
  heading?: number | null;
  timestamp: number;
}

export interface Candidate<T> {
  id: string;
  item: T;
  geometry: unknown;
}

export interface Ranked<T> {
  id: string;
  item: T;
  geometry: unknown;
  distance: number;
}

export interface GeofenceUpdate<T> {
  fix: Fix;
  /** Treff innenfor radius, sortert på avstand */
  nearby: Ranked<T>[];
  nearest: Ranked<T> | null;
  /** Objekt brukeren nettopp gikk inn i sonen til */
  entered: Ranked<T> | null;
  /** Id for objektet brukeren forlot (ikke lenger nærmest/innenfor) */
  left: string | null;
}

export interface GeofenceOptions<T> {
  query: (x: number, y: number, radiusM: number) => Promise<Candidate<T>[]>;
  distance: (x: number, y: number, geometry: unknown) => number;
  onUpdate: (u: GeofenceUpdate<T>) => void;
  onRejected?: (fix: Fix, reason: string) => void;
  radiusM?: number;
  maxAccuracyM?: number;
  debounceMs?: number;
  timers?: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (h: unknown) => void;
    now: () => number;
  };
}

export function isAccurate(fix: Pick<Fix, "accuracy">, maxAccuracyM: number): boolean {
  return Number.isFinite(fix.accuracy) && fix.accuracy <= maxAccuracyM;
}

/** Sorterer kandidater på faktisk avstand og beholder dem innenfor radius. */
export function rank<T>(
  x: number,
  y: number,
  candidates: Candidate<T>[],
  distance: (x: number, y: number, g: unknown) => number,
  radiusM = Infinity,
): Ranked<T>[] {
  const seen = new Set<string>();
  return candidates
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .map((c) => ({ ...c, distance: distance(x, y, c.geometry) }))
    .filter((r) => Number.isFinite(r.distance) && r.distance <= radiusM)
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
}

export class Geofence<T> {
  private readonly radiusM: number;
  private readonly maxAccuracyM: number;
  private readonly debounceMs: number;
  private readonly timers: NonNullable<GeofenceOptions<T>["timers"]>;
  private pending: Fix | null = null;
  private timer: unknown = null;
  private firstPendingAt = 0;
  private currentId: string | null = null;
  private seq = 0;
  private disposed = false;

  constructor(private readonly opts: GeofenceOptions<T>) {
    this.radiusM = opts.radiusM ?? 15;
    this.maxAccuracyM = opts.maxAccuracyM ?? 10;
    this.debounceMs = opts.debounceMs ?? 2000;
    this.timers = opts.timers ?? {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      now: () => Date.now(),
    };
  }

  /** Id for objektet brukeren er i sonen til nå. */
  get current(): string | null {
    return this.currentId;
  }

  push(fix: Fix): void {
    if (this.disposed) return;
    if (!isAccurate(fix, this.maxAccuracyM)) {
      this.opts.onRejected?.(fix, `Nøyaktighet ±${Math.round(fix.accuracy)} m er dårligere enn ±${this.maxAccuracyM} m`);
      return;
    }
    const now = this.timers.now();
    if (!this.pending) this.firstPendingAt = now;
    this.pending = fix;
    if (this.timer != null) this.timers.clear(this.timer);
    // Debounce med maks ventetid: fyr etter debounceMs ro, men senest debounceMs etter første ventende posisjon
    const wait = Math.max(0, Math.min(this.debounceMs, this.firstPendingAt + this.debounceMs - now));
    this.timer = this.timers.set(() => void this.evaluate(), wait);
  }

  /** Tvinger en evaluering nå (f.eks. når brukeren åpner kartet). */
  async evaluateNow(fix: Fix): Promise<void> {
    if (!isAccurate(fix, this.maxAccuracyM)) return;
    this.pending = fix;
    await this.evaluate();
  }

  private async evaluate(): Promise<void> {
    this.timer = null;
    const fix = this.pending;
    this.pending = null;
    if (!fix || this.disposed) return;
    const seq = ++this.seq;
    let candidates: Candidate<T>[];
    try {
      candidates = await this.opts.query(fix.x, fix.y, this.radiusM);
    } catch {
      return;
    }
    if (seq !== this.seq || this.disposed) return;
    const nearby = rank(fix.x, fix.y, candidates, this.opts.distance, this.radiusM);
    const nearest = nearby[0] ?? null;
    const prev = this.currentId;
    const nextId = nearest?.id ?? null;
    this.currentId = nextId;
    this.opts.onUpdate({
      fix,
      nearby,
      nearest,
      entered: nextId && nextId !== prev ? nearest : null,
      left: prev && prev !== nextId ? prev : null,
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer != null) this.timers.clear(this.timer);
  }
}
