import { describe, expect, it } from "vitest";
import { lagProfil, overhoyning, profilnumre, stasjoner, zVed } from "../../src/reports/lengdeprofil.ts";

describe("lengdeprofil", () => {
  it("beregner stasjonering langs linja", () => {
    expect(stasjoner([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toEqual([0, 5, 11]);
  });

  it("interpolerer høyde og hopper over manglende verdier", () => {
    const p = [{ s: 0, z: 10 }, { s: 5, z: null }, { s: 10, z: 20 }];
    expect(zVed(p, 2.5)).toBe(12.5);
    expect(zVed(p, -1)).toBe(10);
    expect(zVed(p, 99)).toBe(20);
    expect(zVed([{ s: 0, z: null }], 0)).toBeNull();
  });

  it("lager profilnumre hver 10. meter med start og slutt", () => {
    expect(profilnumre(57.21)).toEqual([0, 10, 20, 30, 40, 50, 57.21]);
    expect(profilnumre(12)).toEqual([0, 10, 12]);
    expect(profilnumre(10.5)).toEqual([0, 10.5]);
  });

  it("modellerer SR-003: fall, referansekote og overdekning", () => {
    const objekt = [
      { s: 0, z: 107.99 },
      { s: 57.21, z: 105.8 },
    ];
    const terreng = [
      { s: 0, z: 109.5 },
      { s: 28, z: 111.2 },
      { s: 57.21, z: 106.9 },
    ];
    const m = lagProfil(objekt, terreng);
    expect(m.lengde).toBe(57.21);
    expect(m.fallProsent).toBeCloseTo(3.83, 2);
    expect(m.referanse).toBe(104);
    expect(m.rubrikk[0]).toEqual({ s: 0, profil: 107.99, terreng: 109.5, overdekning: expect.closeTo(1.51, 2) });
    expect(m.minOverdekning).toBeCloseTo(1.1, 2);
  });

  it("bruker 10× overhøyning når det er plass, ellers mindre", () => {
    expect(overhoyning(57, 6, 360, 140)).toBe(2);
    expect(overhoyning(57, 2, 360, 140)).toBe(10);
    expect(overhoyning(20, 30, 360, 140)).toBe(1);
  });
});
