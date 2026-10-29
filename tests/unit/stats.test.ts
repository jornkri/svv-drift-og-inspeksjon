import { describe, expect, it } from "vitest";
import type { ObjektStat } from "../../src/data/DataService.ts";
import type { Inspeksjon } from "../../src/data/schema.ts";
import {
  andelInspisertSiste12,
  avviksliste,
  fristerPerFag,
  latestPerObject,
  perMaaned,
  phasePerFag,
  statusPerFag,
  tgFordeling,
} from "../../src/reports/stats.ts";

const s = (p: Partial<ObjektStat>): ObjektStat =>
  ({ globalid: "A", fag: "VA", objekttype: "Kum", mmi: 400, status_inspeksjon: "OK", revisjon: "A", modellfil: null, rev_dato: null, fagmodell: null, ...p }) as ObjektStat;
const i = (p: Partial<Inspeksjon>): Inspeksjon => ({ objekt_globalid: "A", tilstandsgrad: 0, tidspunkt: "2026-03-12T09:00:00Z", ...p }) as Inspeksjon;

const today = new Date(2026, 9, 29);

describe("oversiktsstatistikk", () => {
  const stats = [
    s({ globalid: "A" }),
    s({ globalid: "B", status_inspeksjon: "Avvik", fag: "Elektro", mmi: 600 }),
    s({ globalid: "C", status_inspeksjon: "Ikke inspisert", fag: "Veg", mmi: 350 }),
    s({ globalid: "D", status_inspeksjon: "Avvik", mmi: 500 }),
  ];
  const insp = [
    i({ objekt_globalid: "A", tidspunkt: "2025-06-01T00:00:00Z", tilstandsgrad: 1 }),
    i({ objekt_globalid: "A", tidspunkt: "2026-10-02T00:00:00Z", tilstandsgrad: 0 }),
    i({ objekt_globalid: "B", tidspunkt: "2026-09-15T00:00:00Z", tilstandsgrad: 2 }),
    i({ objekt_globalid: "D", tidspunkt: "2025-01-10T00:00:00Z", tilstandsgrad: 3 }),
  ];
  const latest = latestPerObject(insp);

  it("finner siste inspeksjon per objekt", () => {
    expect(latest.get("A")?.tidspunkt).toBe("2026-10-02T00:00:00Z");
    expect(latest.size).toBe(3);
  });

  it("teller status og faser per fag", () => {
    expect(statusPerFag(stats).VA).toEqual({ OK: 1, Avvik: 1, "Ikke inspisert": 0 });
    expect(phasePerFag(stats).Elektro.i_drift).toBe(1);
    expect(phasePerFag(stats).Veg.detaljert).toBe(1);
  });

  it("fordeler tilstandsgrad i siste inspeksjon", () => {
    expect(tgFordeling(latest.values())).toEqual([1, 0, 1, 1]);
  });

  it("teller inspeksjoner per måned de siste 12 månedene", () => {
    const m = perMaaned(insp, today);
    expect(m).toHaveLength(12);
    expect(m[0]!.key).toBe("2025-11");
    expect(m.at(-1)).toMatchObject({ key: "2026-10", n: 1 });
    expect(m.find((x) => x.key === "2026-09")?.n).toBe(1);
    expect(m.reduce((a, b) => a + b.n, 0)).toBe(2);
  });

  it("beregner andel inspisert siste 12 måneder", () => {
    expect(andelInspisertSiste12(stats, latest, today)).toBe(0.5);
  });

  it("lister avvik med alvorligste først", () => {
    expect(avviksliste(stats, latest).map((r) => r.globalid)).toEqual(["D", "B"]);
  });

  it("beregner R610-frister per fag og sorterer planen etter frist", () => {
    const st = [
      s({ globalid: "R", fag: "Veg", objekttype: "Rekkverk" }),
      s({ globalid: "K", fag: "VA", objekttype: "Kum" }),
      s({ globalid: "N", fag: "Elektro", objekttype: "Teknisk skap" }),
      s({ globalid: "X", fag: "Veg", objekttype: "Ukjent type" }),
    ];
    const ins = [
      i({ objekt_globalid: "R", tidspunkt: "2025-09-01T00:00:00Z" }),
      i({ objekt_globalid: "K", tidspunkt: "2024-01-01T00:00:00Z" }),
    ];
    const f = fristerPerFag(st, latestPerObject(ins), today);
    expect(f.perFag.Veg.forfalt).toBe(1);
    expect(f.perFag.VA.ok).toBe(1);
    expect(f.perFag.Elektro.aldri).toBe(1);
    expect(f.rader.map((r) => r.globalid)).toEqual(["R", "K", "N"]);
  });
});
