import { describe, expect, it } from "vitest";
import { fagFraTittel, finnLag, manglendeFelt, tilpassFelt, type LagInfo } from "../../src/data/auto-mapping.ts";
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
