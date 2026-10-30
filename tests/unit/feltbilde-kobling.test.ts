import { describe, expect, it } from "vitest";
import { koble, koblingTekst, peiling, sorterKoblinger, vinkelavvik, type BildePosisjon } from "../../src/data/feltbilde-kobling.ts";

const bilde = (p: Partial<BildePosisjon> = {}): BildePosisjon => ({ x: 0, y: 0, retning: null, objektGlobalid: null, ...p });

describe("feltbilde-kobling", () => {
  it("regner peiling fra nord med klokka", () => {
    expect(peiling(0, 0, 0, 10)).toBeCloseTo(0);
    expect(peiling(0, 0, 10, 0)).toBeCloseTo(90);
    expect(peiling(0, 0, -10, 0)).toBeCloseTo(270);
  });

  it("finner minste vinkelavvik over nord", () => {
    expect(vinkelavvik(350, 10)).toBeCloseTo(20);
    expect(vinkelavvik(10, 350)).toBeCloseTo(20);
    expect(vinkelavvik(90, 270)).toBeCloseTo(180);
  });

  it("kobler bilder tatt nær objektet", () => {
    expect(koble(bilde(), "A", { x: 12, y: 5 })).toEqual({ grunn: "naer", avstand: 13 });
    expect(koble(bilde(), "A", { x: 30, y: 0 })).toBeNull();
  });

  it("kobler objekter i synsfeltet når retningen er kjent", () => {
    expect(koble(bilde({ retning: 90 }), "A", { x: 100, y: 20 })?.grunn).toBe("synsfelt");
    expect(koble(bilde({ retning: 270 }), "A", { x: 100, y: 20 })).toBeNull();
    expect(koble(bilde({ retning: 90 }), "A", { x: 200, y: 0 })).toBeNull();
  });

  it("manuell kobling gjelder uansett avstand (GlobalId uten hensyn til store/små bokstaver)", () => {
    expect(koble(bilde({ objektGlobalid: "{ABC}" }), "{abc}", { x: 900, y: 0 })?.grunn).toBe("manuell");
  });

  it("sorterer manuell, nær og synsfelt, nærmest først", () => {
    const l = sorterKoblinger([
      { id: 1, kobling: { grunn: "synsfelt" as const, avstand: 40 } },
      { id: 2, kobling: { grunn: "naer" as const, avstand: 15 } },
      { id: 3, kobling: { grunn: "naer" as const, avstand: 3 } },
      { id: 4, kobling: { grunn: "manuell" as const, avstand: 500 } },
    ]);
    expect(l.map((x) => x.id)).toEqual([4, 3, 2, 1]);
  });

  it("beskriver koblingen", () => {
    expect(koblingTekst({ grunn: "naer", avstand: 7.4 })).toBe("Tatt 7 m fra objektet");
    expect(koblingTekst({ grunn: "naer", avstand: 0.4 })).toBe("Tatt ved objektet");
    expect(koblingTekst({ grunn: "synsfelt", avstand: 85 })).toBe("Objektet i synsfeltet, 85 m unna");
  });
});
