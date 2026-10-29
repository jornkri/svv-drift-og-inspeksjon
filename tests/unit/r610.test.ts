import { describe, expect, it } from "vitest";
import { KONSEKVENSGRADER, driftskrav, handbokType, intervallKort, leggTilMaaneder, nesteInspeksjon, tiltakstid } from "../../src/handbok/r610.ts";

describe("R610 driftskrav", () => {
  it("kobler objekttyper til håndbokens typer", () => {
    expect(handbokType({ objekttype: "Ledningsgrøft", navn: "Stikkrennetrase-003" })).toBe("Stikkrenne");
    expect(handbokType({ objekttype: "Ledningsgrøft", navn: "Ledningsgrøft-012" })).toBe("Overvannsledning");
    expect(handbokType({ objekttype: "Rekkverk", navn: "x" })).toBe("Rekkverk");
    expect(handbokType({ objekttype: "Ukjent", navn: "x" })).toBeNull();
  });

  it("henter verifiserte intervaller og sjekkpunkter med kilde", () => {
    const s = driftskrav({ objekttype: "Ledningsgrøft", navn: "Stikkrennetrase-003" })!;
    expect(s.intervallMnd).toBe(60);
    expect(s.intervallKilde).toContain("R610:2025");
    expect(s.sjekkpunkter.length).toBeGreaterThan(3);
    expect(s.sjekkpunkter.every((p) => p.kilde.length > 0)).toBe(true);
    expect(driftskrav({ objekttype: "Rekkverk", navn: "x" })!.intervallMnd).toBe(12);
    expect(intervallKort(60)).toBe("hvert 5. år");
    expect(intervallKort(12)).toBe("hver 12. måned");
  });

  it("beregner neste inspeksjon og status", () => {
    const idag = new Date("2026-10-29T12:00:00");
    expect(nesteInspeksjon("2025-11-15T10:00:00", 12, idag).status).toBe("snart");
    expect(nesteInspeksjon("2025-09-01T10:00:00", 12, idag).status).toBe("forfalt");
    expect(nesteInspeksjon("2026-01-01T10:00:00", 12, idag).status).toBe("ok");
    expect(nesteInspeksjon(null, 12, idag).status).toBe("aldri");
    expect(nesteInspeksjon("2026-01-01", null, idag).status).toBe("ukjent");
    expect(leggTilMaaneder("2024-01-31T00:00:00", 1).getDate()).toBe(29);
  });

  it("gir tiltakstid fra konsekvensgrad og ÅDT (R610 tabell 1.3—1)", () => {
    expect(KONSEKVENSGRADER.map((k) => k.kg)).toEqual([0, 1, 2, 3]);
    expect(tiltakstid(3, 789)).toBe(14);
    expect(tiltakstid(3, 8000)).toBe(7);
    expect(tiltakstid(2, 789)).toBe(21);
    expect(tiltakstid(1, null)).toBe(28);
    expect(tiltakstid(0, 789)).toBeNull();
  });
});
