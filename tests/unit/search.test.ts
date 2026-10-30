import { describe, expect, it } from "vitest";
import { parseVegref, prettyVegref, searchAddressGeonorge } from "../../src/map/search.ts";

describe("vegreferanse", () => {
  it.each([
    ["EV45 S1D1 m2340", "EV45S1D1m2340"],
    ["E45 S2D1 m10205", "EV45S2D1m10205"],
    ["ev45s1d1m2340", "EV45S1D1m2340"],
    ["FV100 S1D1", "FV100S1D1"],
    ["RV4", "RV4"],
  ])("tolker «%s»", (inn, ut) => {
    expect(parseVegref(inn)).toBe(ut);
  });

  it.each(["SR-003", "Elbyveien 12", "Stikkrennetrase-003", ""])("avviser «%s»", (inn) => {
    expect(parseVegref(inn)).toBeNull();
  });

  it("formaterer tilbake med mellomrom", () => {
    expect(prettyVegref("EV45S1D1m2340")).toBe("EV45 S1D1 m2340");
  });
});

describe("searchAddressGeonorge", () => {
  it("søker med jokertegn og gjør om lat/lon (nord/øst i UTM33) til x/y", async () => {
    let kalt = "";
    const fetchFn = (async (url: string) => {
      kalt = url;
      return new Response(
        JSON.stringify({
          adresser: [{ adressetekst: "Markveien 1", postnummer: "9510", poststed: "ALTA", kommunenavn: "ALTA", representasjonspunkt: { lat: 7764330, lon: 816955 } }],
        }),
      );
    }) as unknown as typeof fetch;
    const t = await searchAddressGeonorge("Markveien 1", undefined, fetchFn);
    expect(kalt).toContain("sok=Markveien%201*");
    expect(kalt).toContain("utkoordsys=25833");
    expect(t).toEqual([{ kilde: "adresse", tekst: "Markveien 1", undertekst: "9510 Alta · Alta", x: 816955, y: 7764330 }]);
  });

  it("søker ikke på korte tekster", async () => {
    expect(await searchAddressGeonorge("ab")).toEqual([]);
  });
});
