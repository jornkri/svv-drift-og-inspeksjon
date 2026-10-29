import { describe, expect, it, vi } from "vitest";
import { formaterVerdi, hentTilstander, hentVegobjekter, minsteAvstand, lesTilstand, oppsummer, parseWkt, tilstandSammendrag, type NvdbVegobjekt } from "../../src/nvdb/vegobjekter.ts";

describe("NVDB vegobjekter", () => {
  it("tolker WKT for punkt, linje og flate", () => {
    expect(parseWkt("POINT Z (817483.2 7763538.4 112.5)")).toEqual({ type: "point", x: 817483.2, y: 7763538.4, z: 112.5 });
    expect(parseWkt("POINT Z (1 2 -999999)")).toEqual({ type: "point", x: 1, y: 2, z: null });
    expect(parseWkt("LINESTRING Z (1 2 3,4 5 6)")).toEqual({ type: "polyline", paths: [[[1, 2, 3], [4, 5, 6]]] });
    expect(parseWkt("MULTILINESTRING ((1 2,3 4),(5 6,7 8))")).toEqual({ type: "polyline", paths: [[[1, 2], [3, 4]], [[5, 6], [7, 8]]] });
    expect(parseWkt("POLYGON Z ((0 0 1,1 0 1,1 1 1,0 0 1))")).toEqual({ type: "polygon", rings: [[[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 0, 1]]] });
    expect(parseWkt("GEOMETRYCOLLECTION EMPTY")).toBeNull();
  });

  const stikkrenne: NvdbVegobjekt = {
    id: 92835058,
    metadata: { type: { id: 79, navn: "Stikkrenne/Kulvert" } },
    egenskaper: [
      { id: 3113, navn: "Diameter, innvendig", verdi: 450, egenskapstype: "Heltall", enhet: { kortnavn: "mm" } },
      { id: 6983, navn: "Materialtype", verdi: "Betong", egenskapstype: "Tekstenum" },
      { id: 1323, navn: "Lengde", verdi: 10.42, egenskapstype: "Flyttall", enhet: { kortnavn: "m" } },
    ],
  };

  it("oppsummerer nøkkelegenskaper med enhet", () => {
    expect(oppsummer(stikkrenne)).toBe("450 mm · Betong · 10,42 m");
    expect(formaterVerdi({ id: 1, navn: "Dato", verdi: "2019-11-29", egenskapstype: "Dato" })).toBe("29.11.2019");
  });

  it("leser tilstand fra tilstandsobjekter og oppsummerer", () => {
    const t = lesTilstand({
      id: 1,
      metadata: { type: { id: 947, navn: "Tilstandsgrad, rekkverk" } },
      egenskaper: [
        { id: 11776, navn: "Dato kontrollert, enkel inspeksjon", verdi: "2019-11-29", egenskapstype: "Dato" },
        { id: 11779, navn: "Tilstand, samlet", verdi: "Ok", egenskapstype: "Tekstenum" },
      ],
    });
    expect(t).toEqual({ type: "Tilstandsgrad, rekkverk", tilstand: "Ok", dato: "2019-11-29" });
    expect(lesTilstand(stikkrenne)).toBeNull();
    expect(
      tilstandSammendrag([
        { tilstand: "Ok", dato: "2019-11-29" },
        { tilstand: "Ok", dato: "2021-05-01" },
        { tilstand: "Skadet", dato: null },
      ]),
    ).toEqual({ perVerdi: [["Ok", 2], ["Skadet", 1]], siste: "2021-05-01" });
  });

  it("paginerer med neste.start og stopper når siden ikke er full", async () => {
    const sider = [
      { objekter: [{ id: 1 }, { id: 2 }], metadata: { returnert: 2, sidestørrelse: 2, neste: { start: "abc" } } },
      { objekter: [{ id: 3 }], metadata: { returnert: 1, sidestørrelse: 2, neste: { start: "def" } } },
    ];
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(sider.shift())));
    const ut = await hentVegobjekter({ baseUrl: "https://nvdb", client: "test" }, 79, [0, 0, 10, 10], { fetchFn: fetchFn as unknown as typeof fetch });
    expect(ut.map((o) => o.id)).toEqual([1, 2, 3]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const calls = fetchFn.mock.calls as unknown as [string][];
    expect(calls[1]![0]).toContain("&start=abc");
    expect(calls[0]![0]).toContain("/vegobjekter/api/v4/vegobjekter/79?kartutsnitt=0,0,10,10&srid=5973");
  });

  it("beregner minste avstand mellom punkt og linje", () => {
    expect(minsteAvstand([[[5, 3]]], [[[0, 0], [10, 0]]])).toBe(3);
    expect(minsteAvstand([[[0, 5], [10, 5]]], [[[0, 0], [10, 0]]])).toBe(5);
    expect(minsteAvstand([[[13, 4]]], [[[0, 0], [10, 0]]])).toBe(5);
  });

  it("henter tilstander i bunker med ider", async () => {
    const svar = (ider: number[]) => ({
      objekter: ider.map((id) => ({
        id,
        metadata: { type: { id: 947, navn: "Tilstandsgrad, rekkverk" } },
        egenskaper: [
          { id: 11779, navn: "Tilstand, samlet", verdi: "Ok", egenskapstype: "Tekstenum" },
          { id: 11776, navn: "Dato kontrollert, enkel inspeksjon", verdi: `2019-11-${String(10 + (id % 10)).padStart(2, "0")}`, egenskapstype: "Dato" },
        ],
      })),
    });
    const fetchFn = vi.fn(async (url: string) => new Response(JSON.stringify(svar(new URL(url).searchParams.get("ider")!.split(",").map(Number)))));
    const ut = await hentTilstander(
      { baseUrl: "https://nvdb", client: "t" },
      { id: 1, relasjoner: { barn: [{ type: { id: 947, navn: "Tilstandsgrad, rekkverk" }, vegobjekter: [1, 2, 3, 4, 5] }, { type: { id: 14, navn: "Rekkverksende" }, vegobjekter: [9] }] } },
      { bunke: 2, fetchFn: fetchFn as unknown as typeof fetch },
    );
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(ut).toHaveLength(5);
    expect(ut[0]!.dato).toBe("2019-11-15");
  });
});
