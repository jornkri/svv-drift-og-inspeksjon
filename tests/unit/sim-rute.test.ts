import { describe, expect, it } from "vitest";
import { bakover, naermesteIndeks, rensRute, startIndeks, type RutePunkt } from "../../src/field/sim-rute.ts";

// Rett rute nordover, ett punkt per meter
const rute: RutePunkt[] = Array.from({ length: 100 }, (_, i) => [0, i]);

describe("simulert rute", () => {
  it("fjerner hull", () => {
    expect(rensRute([[1, 2], [null, null], [3, 4]])).toEqual([[1, 2], [3, 4]]);
  });

  it("finner nærmeste rutepunkt", () => {
    expect(naermesteIndeks(rute, 5, 42.4)).toBe(42);
  });

  it("går bakover langs ruten, også rundt starten", () => {
    expect(bakover(rute, 50, 20)).toBe(30);
    expect(bakover(rute, 5, 10)).toBe(99);
  });

  it("starter litt før objektet nærmest ruten", () => {
    const objekt = { x: 3, y: 70 };
    expect(startIndeks(rute, ([x, y]) => Math.hypot(x - objekt.x, y - objekt.y), 20)).toBe(50);
  });

  it("starter i begynnelsen når det ikke finnes objekter", () => {
    expect(startIndeks(rute, () => Infinity)).toBe(0);
  });
});
