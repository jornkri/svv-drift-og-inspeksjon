import { describe, expect, it } from "vitest";
import { legendeFraJson, pentLagnavn } from "../../src/map/legende-json.ts";

describe("tegnforklaring fra /legend", () => {
  it("gjør lagnavn lesbare", () => {
    expect(pentLagnavn("GEOLOGI_LosmasseFlate")).toBe("Losmasse flate");
    expect(pentLagnavn("forurenset_omrade_tilstand_pkt")).toBe("Forurenset omrade tilstand pkt");
    expect(pentLagnavn("Stikkrenne, kulvert o.l.")).toBe("Stikkrenne, kulvert o.l.");
    expect(pentLagnavn("RpArealformålOmråde")).toBe("Rp arealformål område");
  });

  it("filtrerer og sorterer lag, og fyller inn tomme etiketter", () => {
    const svar = {
      layers: [
        { layerId: 1, layerName: "A_Forste", legend: [{ label: "", imageData: "AAA", contentType: "image/png" }] },
        { layerId: 3, layerName: "Tredje", legend: [{ label: "Klasse 1", imageData: "BBB" }, { label: "<all other values>", imageData: "CCC" }] },
        { layerId: 5, layerName: "Tom", legend: [] },
      ],
    };
    const g = legendeFraJson(svar, [3, 1, 5]);
    expect(g.map((x) => x.tittel)).toEqual(["Tredje", "Forste"]);
    expect(g[0]!.poster).toEqual([
      { etikett: "Klasse 1", bilde: "data:image/png;base64,BBB" },
      { etikett: "Andre verdier", bilde: "data:image/png;base64,CCC" },
    ]);
    expect(g[1]!.poster[0]!.etikett).toBe("Forste");
  });
});
