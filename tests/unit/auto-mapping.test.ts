import { describe, expect, it } from "vitest";
import { bimDato, bimMmi, bimTilObjekter, erBimLag, fagFraTittel, finnLag, manglendeFelt, tilpassFelt, type LagInfo } from "../../src/data/auto-mapping.ts";
import { DOKUMENT_FIELDS, OBJEKT_FIELDS } from "../../src/data/schema.ts";

const lag = (tittel: string, type: LagInfo["type"], felt: string[]): LagInfo => ({ tittel, type, url: `https://x/${tittel}`, felt });

describe("finnLag", () => {
  const alle = [
    lag("Overvann", "layer", ["OBJECTID", "GlobalID", "OBJEKT_ID", "Fag", "mmi"]),
    lag("Belysning", "layer", ["objectid", "objekt_id", "fag"]),
    lag("Bakgrunn", "layer", ["objectid", "navn"]),
    lag("Inspeksjoner", "table", ["objectid", "objekt_globalid", "tilstandsgrad", "tidspunkt"]),
    lag("Oppgaver", "layer", ["objectid", "oppgave_id", "status", "objekt_globalid"]),
    lag("Dokumenter", "table", ["objectid", "objekt_globalid", "tittel", "url"]),
  ];

  it("kjenner igjen objektlag og tabeller på feltene", () => {
    const m = finnLag(alle);
    expect(m.objektlag.map((l) => l.tittel)).toEqual(["Overvann", "Belysning"]);
    expect(m.inspeksjon?.tittel).toBe("Inspeksjoner");
    expect(m.oppgave?.tittel).toBe("Oppgaver");
    expect(m.dokument?.tittel).toBe("Dokumenter");
  });

  it("bruker tittelen som reserve og gir null når noe mangler", () => {
    const m = finnLag([lag("Inspeksjon VA", "table", ["objectid", "tg"]), lag("Kum", "layer", ["objekt_id"])]);
    expect(m.inspeksjon?.tittel).toBe("Inspeksjon VA");
    expect(m.oppgave).toBeNull();
    expect(m.dokument).toBeNull();
    expect(m.objektlag).toHaveLength(1);
  });
});

describe("fagFraTittel", () => {
  it("gjetter fag fra tittelen", () => {
    expect(fagFraTittel("Stikkrenner E45")).toBe("VA");
    expect(fagFraTittel("VA-ledninger")).toBe("VA");
    expect(fagFraTittel("Belysningsmaster")).toBe("Elektro");
    expect(fagFraTittel("Rekkverk")).toBe("Veg");
  });
});

describe("tilpassFelt", () => {
  it("bytter til feltnavnene laget faktisk har", () => {
    const m = tilpassFelt(OBJEKT_FIELDS, ["OBJEKT_ID", "Fag", "globalid"]);
    expect(m.objekt_id).toBe("OBJEKT_ID");
    expect(m.fag).toBe("Fag");
    expect(m.globalid).toBe("globalid");
    expect(m.mmi).toBe("mmi");
  });

  it("lister felt som mangler", () => {
    expect(manglendeFelt(DOKUMENT_FIELDS, ["OBJEKT_GLOBALID", "tittel", "url"])).toEqual(["type", "revisjon"]);
  });
});

describe("BIM-eksport", () => {
  const stikkrenne = {
    GlobalId: "2OuLfiCdv1KB35RtsfSRpj",
    ObjectId: "296",
    Delmodell: "Stikkrennetrase-003",
    Objekttype: "Stikkrenne",
    Fagmodell: "Overvann",
    MMI: "400",
    Revisjonsnummer: "A",
    Revisjonsdato: "2026-01-27",
    Z_Min: 105.95,
    Z_Max: 107.88,
    Lengde: 57.21,
    DocName: "m_f_overvann_MMI400",
    ProjectName: "E45 Kløfta B12016",
    UtarbeidetAv: "DB",
    ElementType: "ifcflowsegment",
    DocUpdate: Date.UTC(2026, 9, 29),
  };

  it("kjenner igjen BIM-lag", () => {
    expect(erBimLag(lag("M f veg", "layer", ["OBJECTID_1", "GlobalId", "Objekttype"]))).toBe(true);
    expect(erBimLag(lag("Bakgrunn", "layer", ["objectid", "navn"]))).toBe(false);
  });

  it("gjør attributtene om til appens objektmodell", () => {
    const [o] = bimTilObjekter([{ attrs: stikkrenne, lagTittel: "M f overvann MMI400 2D" }]);
    expect(o).toMatchObject({
      globalid: "2OuLfiCdv1KB35RtsfSRpj",
      objekt_id: "Stikkrennetrase-003",
      navn: "Stikkrennetrase-003 – Stikkrenne",
      fag: "VA",
      objekttype: "Stikkrenne",
      mmi: 400,
      rev_dato: "2026-01-27",
      status_inspeksjon: "Ikke inspisert",
      kote_min: 105.95,
      lengde_m: 57.21,
      fagmodell: "Overvann",
      modellfil: "m_f_overvann_MMI400.ifc",
      prosjekt: "E45 Kløfta B12016",
      ifc_klasse: "IFCFLOWSEGMENT",
      lastet_inn: "2026-10-29T00:00:00.000Z",
    });
  });

  it("utelater rader uten GlobalId og nummererer delte delmodeller", () => {
    const veg = (id: string, navn: string, type: string) => ({ GlobalId: `g${id}`, ObjectId: id, Delmodell: "veg_10301", Objekttype: type, Name: `veg_10301 | ${navn}`, Fagmodell: "Veg", DocName: "m_f_veg_MMI400" });
    const ut = bimTilObjekter([
      { attrs: { ObjectId: "-1", Z_Min: 1 }, lagTittel: "veg" },
      { attrs: veg("20", "Bindlag 1", "Bindelag"), lagTittel: "veg" },
      { attrs: veg("10", "Slitelag", "Slitelag"), lagTittel: "veg" },
      { attrs: veg("30", "Bindlag 2", "Bindelag"), lagTittel: "veg" },
    ]);
    expect(ut[0]).toBeNull();
    expect(ut.slice(1).map((o) => [o?.objekt_id, o?.navn, o?.mmi])).toEqual([
      ["veg_10301/2", "veg_10301 – Bindlag 1", 400],
      ["veg_10301/1", "veg_10301 – Slitelag", 400],
      ["veg_10301/3", "veg_10301 – Bindlag 2", 400],
    ]);
  });

  it("leser datoer og MMI i flere formater", () => {
    expect(bimDato("22.02.2026")).toBe("2026-02-22");
    expect(bimDato("ukjent")).toBeNull();
    expect(bimMmi("MMI400")).toBe(400);
    expect(bimMmi(null, "m_f_veg_MMI350")).toBe(350);
  });
});
