import { describe, expect, it } from "vitest";
import type { Inspeksjon, Objekt } from "../../src/data/schema.ts";
import { autoFields, changeObject, forrigeTekst, prefill, toInspeksjon, unlock, validate } from "../../src/field/prefill.ts";

const SR003: Objekt = {
  globalid: "{SR3}",
  objekt_id: "SR-003",
  navn: "Stikkrennetrase-003",
  fag: "VA",
  objekttype: "Ledningsgrøft",
  mmi: 400,
  revisjon: "A",
  rev_dato: "2026-01-27T00:00:00.000Z",
  status_inspeksjon: "OK",
  vegreferanse: "EV45 S2D1 m10205",
  kote_min: 105.8,
  kote_max: 107.99,
  lengde_m: 57.21,
  fagmodell: "Overvann",
  modellfil: "m_f_overvann_MMI400 (IFC2X3)",
  modellert_av: "Trimble Solutions Sandvika AS",
  prosjekt: "E45 Kløfta B12016",
  ifc_guid: "0FP5ek9CaZCpSiYpayArDh",
  ifc_klasse: "IfcPipeSegment",
  lastet_inn: null,
};
const KUM: Objekt = { ...SR003, globalid: "{K}", objekt_id: "OV-114", navn: "Kum OV-114", objekttype: "Kum", lengde_m: null, kote_min: 104.1, kote_max: 104.1 };

const insp = (p: Partial<Inspeksjon>): Inspeksjon =>
  ({ objekt_globalid: "{SR3}", tilstandsgrad: 0, tidspunkt: "2026-03-12T09:14:00.000Z", ...p }) as Inspeksjon;

const now = new Date("2026-10-29T10:42:00.000Z");
const ctx = { id: "utkast-1", inspektor: "Kari Nordmann", now, posisjon: { x: 816990, y: 7764320, noyaktighet: 3 }, oppgaveId: "OPG-1042", avstand_m: 4 };

describe("autoutfylling", () => {
  it("fyller ut objektfeltene og forrige inspeksjon", () => {
    const u = prefill(SR003, [insp({ tidspunkt: "2025-10-02T11:40:00.000Z", tilstandsgrad: 1 }), insp({})], ctx);
    expect(u.laast).toBe(true);
    expect(u.oppgaveId).toBe("OPG-1042");
    expect(autoFields(u)).toEqual([
      { k: "Objekt", v: "SR-003 · Stikkrennetrase-003" },
      { k: "Fag / modell", v: "VA · Overvann" },
      { k: "Vegreferanse", v: "EV45 S2D1 m10205" },
      { k: "Lengde", v: "57,21 m" },
      { k: "Kote", v: "105,80 – 107,99" },
      { k: "Forrige inspeksjon", v: "OK · mars 2026" },
    ]);
  });

  it("viser «Ingen» når objektet ikke er inspisert, og «–» for manglende verdier", () => {
    const u = prefill({ ...SR003, lengde_m: null, vegreferanse: null }, [], ctx);
    const f = Object.fromEntries(autoFields(u).map((x) => [x.k, x.v]));
    expect(f["Forrige inspeksjon"]).toBe("Ingen");
    expect(f["Lengde"]).toBe("–");
    expect(f["Vegreferanse"]).toBe("–");
  });

  it("formaterer forrige inspeksjon med resultat, måned og år", () => {
    expect(forrigeTekst({ tidspunkt: "2025-10-02T11:40:00.000Z", tilstandsgrad: 2 })).toBe("Avvik · oktober 2025");
  });
});

describe("bytte av objekt", () => {
  it("låser opp, fyller ut på nytt og beholder registreringene", () => {
    let u = prefill(SR003, [insp({})], ctx);
    u = { ...u, tilstandsgrad: 2, avvikstype: "Erosjon / utvasking", tiltak_behov: "ja", kommentar: "Utvasking ved innløp" };
    const opp = unlock(u);
    expect(opp.laast).toBe(false);
    expect(validate(opp)).toContain("Bekreft objektet før innsending.");
    const byttet = changeObject(opp, KUM, [], { now, oppgaveId: "OPG-1038", avstand_m: 11 });
    expect(byttet.laast).toBe(true);
    expect(byttet.objekt.objekt_id).toBe("OV-114");
    expect(byttet.oppgaveId).toBe("OPG-1038");
    expect(byttet.forrige).toBeNull();
    expect(byttet.kommentar).toBe("Utvasking ved innløp");
    expect(byttet.tilstandsgrad).toBe(2);
    expect(byttet.id).toBe("utkast-1");
  });
});

describe("validering og innsending", () => {
  it("krever tilstandsgrad, avvikstype og tiltak", () => {
    const u = prefill(SR003, [], ctx);
    expect(validate(u)).toEqual(["Velg tilstandsgrad.", "Velg avvikstype.", "Angi om det er behov for tiltak."]);
  });

  it("krever avvikstype og kommentar ved høy tilstandsgrad", () => {
    const u = { ...prefill(SR003, [], ctx), tilstandsgrad: 2 as const, avvikstype: "Ingen avvik", tiltak_behov: "ja" as const };
    expect(validate(u)).toEqual([
      "Avvikstype må angis når tilstandsgraden er 1 eller høyere.",
      "Beskriv avviket i kommentarfeltet (TG 2–3).",
    ]);
  });

  it("lager inspeksjonsposten med relasjon og autoutfylte kopier", () => {
    const u = { ...prefill(SR003, [], ctx), tilstandsgrad: 0 as const, avvikstype: "Ingen avvik", tiltak_behov: "nei" as const, kommentar: "  Fritt  " };
    expect(validate(u)).toEqual([]);
    const i = toInspeksjon(u, now);
    expect(i).toMatchObject({
      objekt_globalid: "{SR3}",
      tilstandsgrad: 0,
      kommentar: "Fritt",
      oppgave_id: "OPG-1042",
      pos_x: 816990,
      pos_noyaktighet_m: 3,
      obj_objekt_id: "SR-003",
      obj_lengde_m: 57.21,
      obj_kote_max: 107.99,
      tidspunkt: "2026-10-29T10:42:00.000Z",
    });
  });
});
