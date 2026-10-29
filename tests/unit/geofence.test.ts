import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Geofence, isAccurate, rank, type Candidate, type Fix, type GeofenceUpdate } from "../../src/field/geofence.ts";

// Enkle punktobjekter; avstand i planet (UTM33 er i meter)
type Obj = { navn: string };
const pt = (id: string, x: number, y: number): Candidate<Obj> => ({ id, item: { navn: id }, geometry: { x, y } });
const dist = (x: number, y: number, g: unknown) => {
  const p = g as { x: number; y: number };
  return Math.hypot(p.x - x, p.y - y);
};
const fix = (x: number, y: number, accuracy = 3, timestamp = 0): Fix => ({ x, y, accuracy, timestamp });

const WORLD = [pt("SR-003", 100, 0), pt("OV-114", 111, 0), pt("EL-07", 87, 0), pt("FJERN", 500, 0)];
const query = async (x: number, y: number, r: number) => WORLD.filter((c) => dist(x, y, c.geometry) <= r + 50);

describe("nøyaktighet", () => {
  it("forkaster posisjoner dårligere enn terskelen", () => {
    expect(isAccurate({ accuracy: 10 }, 10)).toBe(true);
    expect(isAccurate({ accuracy: 10.5 }, 10)).toBe(false);
    expect(isAccurate({ accuracy: Number.NaN }, 10)).toBe(false);
  });
});

describe("rangering", () => {
  it("sorterer på faktisk avstand, fjerner duplikater og treff utenfor radius", () => {
    const r = rank(104, 0, [...WORLD, pt("SR-003", 100, 0)], dist, 15);
    // EL-07 ligger 17 m unna og er utenfor 15 m-sonen
    expect(r.map((x) => [x.id, Math.round(x.distance)])).toEqual([
      ["SR-003", 4],
      ["OV-114", 7],
    ]);
  });
});

describe("geofence", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(opts: Partial<ConstructorParameters<typeof Geofence<Obj>>[0]> = {}) {
    const updates: GeofenceUpdate<Obj>[] = [];
    const rejected: string[] = [];
    const q = vi.fn(query);
    const g = new Geofence<Obj>({
      query: q,
      distance: dist,
      onUpdate: (u) => updates.push(u),
      onRejected: (_f, r) => rejected.push(r),
      radiusM: 15,
      maxAccuracyM: 10,
      debounceMs: 2000,
      ...opts,
    });
    return { g, updates, rejected, q };
  }

  it("spør etter 2 s ro og melder nærmeste objekt som standardobjekt", async () => {
    const { g, updates, q } = setup();
    g.push(fix(104, 0));
    expect(q).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1999);
    expect(q).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(q).toHaveBeenCalledWith(104, 0, 15);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.nearest?.id).toBe("SR-003");
    expect(updates[0]!.entered?.id).toBe("SR-003");
    expect(updates[0]!.nearby.map((n) => n.id)).toEqual(["SR-003", "OV-114"]);
  });

  it("spør høyst hvert 2. sekund med siste posisjon mens brukeren går", async () => {
    const { g, q } = setup();
    for (let t = 0; t < 6; t++) {
      g.push(fix(80 + t, 0, 3, t * 1000));
      await vi.advanceTimersByTimeAsync(1000);
    }
    // 6 posisjoner over 6 s → 3 spørringer, hver med siste posisjon
    expect(q).toHaveBeenCalledTimes(3);
    expect(q.mock.calls.map((c) => c[0])).toEqual([81, 83, 85]);
  });

  it("forkaster unøyaktige posisjoner uten å spørre", async () => {
    const { g, q, rejected } = setup();
    g.push(fix(104, 0, 25));
    await vi.advanceTimersByTimeAsync(3000);
    expect(q).not.toHaveBeenCalled();
    expect(rejected[0]).toMatch(/±25 m/);
  });

  it("melder inn- og utgang av soner", async () => {
    const { g, updates } = setup();
    g.push(fix(104, 0));
    await vi.advanceTimersByTimeAsync(2000);
    g.push(fix(112, 0)); // nærmest OV-114
    await vi.advanceTimersByTimeAsync(2000);
    g.push(fix(300, 0)); // ingenting i nærheten
    await vi.advanceTimersByTimeAsync(2000);
    expect(updates.map((u) => [u.entered?.id ?? null, u.left])).toEqual([
      ["SR-003", null],
      ["OV-114", "SR-003"],
      [null, "OV-114"],
    ]);
    expect(g.current).toBeNull();
  });

  it("melder ikke ny inngang når brukeren blir i samme sone", async () => {
    const { g, updates } = setup();
    g.push(fix(104, 0));
    await vi.advanceTimersByTimeAsync(2000);
    g.push(fix(103, 1));
    await vi.advanceTimersByTimeAsync(2000);
    expect(updates[1]!.entered).toBeNull();
    expect(updates[1]!.nearest?.id).toBe("SR-003");
  });

  it("bruker konfigurerbar terskel og radius", async () => {
    const { g, q } = setup({ maxAccuracyM: 30, radiusM: 25 });
    g.push(fix(104, 0, 25));
    await vi.advanceTimersByTimeAsync(2000);
    expect(q).toHaveBeenCalledWith(104, 0, 25);
  });
});
