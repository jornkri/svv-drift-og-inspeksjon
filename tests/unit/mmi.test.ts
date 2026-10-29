import { describe, expect, it } from "vitest";
import {
  ALL_PHASES,
  DEFAULT_PHASES,
  PHASES,
  PRESETS,
  classBreaks,
  contiguousRuns,
  countByPhase,
  isDefaultSelection,
  mmiBadgeText,
  mmiLabel,
  mmiWhere,
  phaseOf,
  phaseRange,
  stripWeights,
  type PhaseId,
} from "../../src/filters/mmi.ts";

describe("faseinndeling", () => {
  it("har syv faser med veilederens offisielle farger", () => {
    expect(PHASES.map((p) => [p.navn, p.farge])).toEqual([
      ["Grunnlag", "#BE2823"],
      ["Konsept", "#E69637"],
      ["Prinsipp", "#FAF050"],
      ["Detaljert", "#B9AF3C"],
      ["Utførelse", "#378246"],
      ["Som bygget", "#1E46AF"],
      ["I drift", "#9B00CD"],
    ]);
  });

  it.each([
    [0, "grunnlag"],
    [100, "grunnlag"],
    [125, "konsept"],
    [200, "konsept"],
    [225, "prinsipp"],
    [300, "prinsipp"],
    [325, "detaljert"],
    [375, "detaljert"],
    [400, "utforelse"],
    [475, "utforelse"],
    [500, "som_bygget"],
    [600, "i_drift"],
  ] as const)("MMI %i hører til %s", (mmi, fase) => {
    expect(phaseOf(mmi)?.id).toBe(fase);
  });

  it("klassifiserer verdier mellom grunnleggende nivåer uten hull", () => {
    for (let v = 0; v <= 600; v++) expect(phaseOf(v), `MMI ${v}`).toBeDefined();
    expect(phaseOf(110)?.id).toBe("grunnlag");
    expect(phaseOf(390)?.id).toBe("detaljert");
  });

  it("returnerer undefined utenfor 0–600 og for null", () => {
    expect(phaseOf(-1)).toBeUndefined();
    expect(phaseOf(601)).toBeUndefined();
    expect(phaseOf(null)).toBeUndefined();
    expect(phaseOf(Number.NaN)).toBeUndefined();
  });

  it("viser nivåspenn som i veilederen", () => {
    expect(PHASES.map(phaseRange)).toEqual(["000–100", "125–200", "225–300", "325–375", "400–475", "500", "600"]);
  });

  it("standardvalget er Detaljert, Utførelse, Som bygget og I drift", () => {
    expect(DEFAULT_PHASES).toEqual(["detaljert", "utforelse", "som_bygget", "i_drift"]);
    expect(isDefaultSelection(["i_drift", "detaljert", "som_bygget", "utforelse"])).toBe(true);
  });
});

describe("uttrykk", () => {
  it("alle faser gir ingen filtrering, ingen faser gir tomt resultat", () => {
    expect(mmiWhere(ALL_PHASES)).toBe("1=1");
    expect(mmiWhere([])).toBe("1=0");
  });

  it("slår sammen sammenhengende faser til ett intervall", () => {
    expect(mmiWhere(DEFAULT_PHASES)).toBe("(mmi >= 325 AND mmi <= 600)");
  });

  it("bruker likhet for en enkelt fase med ett nivå", () => {
    expect(mmiWhere(["i_drift"])).toBe("mmi = 600");
  });

  it("lager OR mellom ikke-sammenhengende løp og respekterer feltnavn", () => {
    expect(mmiWhere(["grunnlag", "detaljert", "i_drift"], "MMI_NIVAA")).toBe(
      "((MMI_NIVAA >= 0 AND MMI_NIVAA <= 124) OR (MMI_NIVAA >= 325 AND MMI_NIVAA <= 399) OR MMI_NIVAA = 600)",
    );
  });

  it("er uavhengig av rekkefølge og duplikater", () => {
    expect(mmiWhere(["i_drift", "som_bygget", "i_drift"])).toBe("(mmi >= 500 AND mmi <= 600)");
  });

  it("finner sammenhengende løp", () => {
    expect(contiguousRuns(["konsept", "grunnlag", "utforelse"])).toEqual([["grunnlag", "konsept"], ["utforelse"]]);
  });
});

describe("etikett", () => {
  it.each<[PhaseId[], string]>([
    [[...DEFAULT_PHASES], "325–600"],
    [[...ALL_PHASES], "alle"],
    [[], "ingen"],
    [["som_bygget"], "500"],
    [["grunnlag", "konsept"], "000–200"],
    [["grunnlag", "detaljert", "i_drift"], "3 faser"],
    [["konsept", "som_bygget"], "2 faser"],
  ])("%j gir «%s»", (sel, label) => {
    expect(mmiLabel(sel)).toBe(label);
  });

  it("snarveiene gir forventede etiketter", () => {
    const byId = Object.fromEntries(PRESETS.map((p) => [p.id, mmiLabel(p.phases)]));
    expect(byId).toEqual({ prosjektering: "000–375", utforelse: "400–600", bygget: "500–600", alle: "alle" });
  });

  it("merket viser nivå og fasenavn", () => {
    expect(mmiBadgeText(400)).toBe("MMI 400 · Utførelse");
    expect(mmiBadgeText(0)).toBe("MMI 000 · Grunnlag");
    expect(mmiBadgeText(null)).toBe("MMI –");
  });
});

describe("telling og stripe", () => {
  it("teller per fase og ignorerer ugyldige verdier", () => {
    const c = countByPhase([400, 425, 500, 600, 350, null, 9999]);
    expect(c).toEqual({ grunnlag: 0, konsept: 0, prinsipp: 0, detaljert: 1, utforelse: 2, som_bygget: 1, i_drift: 1 });
  });

  it("stripebredder følger antall, med minstebredde for tomme faser", () => {
    const w = stripWeights({ grunnlag: 0, konsept: 0, prinsipp: 12, detaljert: 58, utforelse: 196, som_bygget: 31, i_drift: 15 });
    expect(w.utforelse).toBeCloseTo(196 / 312);
    expect(w.grunnlag).toBe(0.04);
  });

  it("klassegrenser dekker 0–600 sammenhengende", () => {
    const b = classBreaks();
    expect(b[0]!.minValue).toBe(0);
    expect(b.at(-1)!.maxValue).toBe(600);
    for (let i = 1; i < b.length; i++) expect(b[i]!.minValue).toBe(b[i - 1]!.maxValue + 1);
  });
});
