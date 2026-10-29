import { describe, expect, it } from "vitest";
import { OBJEKT_FIELDS, fromAttributes, toAttributes, type Objekt } from "../../src/data/schema.ts";
import { DEFAULT_FILTERS, buildWhere, isDirty, matches, typeKey, type FilterState } from "../../src/filters/filters.ts";
import { ALL_PHASES } from "../../src/filters/mmi.ts";

const f = (p: Partial<FilterState>): FilterState => ({ ...DEFAULT_FILTERS, ...p });

describe("kombinert filter", () => {
  it("standardfilteret gir bare MMI-intervallet", () => {
    expect(buildWhere(DEFAULT_FILTERS, OBJEKT_FIELDS, "VA")).toBe("(mmi >= 325 AND mmi <= 600)");
    expect(isDirty(DEFAULT_FILTERS)).toBe(false);
  });

  it("fagfilteret slår av lag med annet fag", () => {
    expect(buildWhere(f({ fag: "Elektro" }), OBJEKT_FIELDS, "VA")).toBe("1=0");
    expect(buildWhere(f({ fag: "VA", phases: [...ALL_PHASES] }), OBJEKT_FIELDS, "VA")).toBe("1=1");
  });

  it("kombinerer MMI, inspeksjon, skjulte typer og ekstrafiltre", () => {
    const where = buildWhere(
      f({
        phases: ["i_drift"],
        inspeksjon: "Avvik",
        skjulteTyper: [typeKey("VA", "Kum"), typeKey("Elektro", "Belysningsmast")],
        revisjon: "A",
        modellfil: "overvann",
        datoFra: "2026-01-01",
      }),
      OBJEKT_FIELDS,
      "VA",
    );
    expect(where).toBe(
      "mmi = 600 AND status_inspeksjon = 'Avvik' AND objekttype NOT IN ('Kum') AND revisjon = 'A' AND UPPER(modellfil) LIKE '%OVERVANN%' AND rev_dato >= DATE '2026-01-01'",
    );
  });

  it("bruker mappede feltnavn og escaper apostrofer", () => {
    const fields = { ...OBJEKT_FIELDS, mmi: "MMI_NIVAA", revisjon: "REV" };
    expect(buildWhere(f({ phases: [...ALL_PHASES], revisjon: "O'B" }), fields, "Veg")).toBe("REV = 'O''B'");
  });

  it("fagmodeller kan slås av hver for seg", () => {
    const g = f({ phases: [...ALL_PHASES], skjulteFagmodeller: ["Overvann", "Drenering"] });
    expect(buildWhere(g, OBJEKT_FIELDS, "VA")).toBe("fagmodell NOT IN ('Overvann', 'Drenering')");
    expect(isDirty(g)).toBe(true);
    const o = { fag: "VA", mmi: 400, status_inspeksjon: "OK", objekttype: "Kum", revisjon: "A", modellfil: null, rev_dato: null, fagmodell: "Overvann" } as const;
    expect(matches(g, o)).toBe(false);
    expect(matches(g, { ...o, fagmodell: "Belysning" })).toBe(true);
  });

  it("ingen MMI-faser gir tomt resultat", () => {
    expect(buildWhere(f({ phases: [] }), OBJEKT_FIELDS, "VA")).toBe("1=0");
  });

  it("matches() er i samsvar med where-uttrykket", () => {
    const o = { fag: "VA", mmi: 400, status_inspeksjon: "OK", objekttype: "Ledningsgrøft", revisjon: "A", modellfil: "m_f_overvann_MMI400 (IFC2X3)", rev_dato: "2026-01-27T00:00:00.000Z" } as const;
    expect(matches(DEFAULT_FILTERS, o)).toBe(true);
    expect(matches(f({ phases: ["som_bygget", "i_drift"] }), o)).toBe(false);
    expect(matches(f({ fag: "Veg" }), o)).toBe(false);
    expect(matches(f({ modellfil: "OVERVANN" }), o)).toBe(true);
    expect(matches(f({ datoFra: "2026-02-01" }), o)).toBe(false);
    expect(matches(f({ skjulteTyper: ["VA|Ledningsgrøft"] }), o)).toBe(false);
  });
});

describe("feltmapping", () => {
  it("oversetter datoer og feltnavn begge veier", () => {
    const map = { ...OBJEKT_FIELDS, navn: "NAVN" };
    const attrs = { NAVN: "Stikkrennetrase-003", rev_dato: Date.UTC(2026, 0, 27), mmi: 400 };
    const o = fromAttributes<Objekt>(attrs, map);
    expect(o.navn).toBe("Stikkrennetrase-003");
    expect(o.rev_dato).toBe("2026-01-27T00:00:00.000Z");
    expect(o.ifc_guid).toBeNull();
    expect(toAttributes<Objekt>({ navn: "X", rev_dato: "2026-01-27T00:00:00.000Z" }, map)).toEqual({
      NAVN: "X",
      rev_dato: Date.UTC(2026, 0, 27),
    });
  });
});
