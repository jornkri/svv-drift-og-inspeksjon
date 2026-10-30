import { describe, expect, it } from "vitest";
import { begrensTilProxy, brukGdoProxy, proxyUrl } from "../../src/map/gdo-proxy.ts";
import { parseConfig } from "../../src/config.ts";

const PROXY = {
  "Geocache_UTM33_EUREF89/GeocacheGraatone/MapServer": "https://utility.arcgis.com/usrsvcs/servers/aaa/rest/services/Geocache_UTM33_EUREF89/GeocacheGraatone/MapServer",
  "Geocache_UTM33_EUREF89/GeocacheTerreng/ImageServer": "https://utility.arcgis.com/usrsvcs/servers/bbb/rest/services/Geocache_UTM33_EUREF89/GeocacheTerreng/ImageServer",
};

describe("GDO via AGOL-proxy", () => {
  it("bytter tjeneste-URL og beholder resten av stien", () => {
    expect(proxyUrl("https://services.geodataonline.no/arcgis/rest/services/Geocache_UTM33_EUREF89/GeocacheGraatone/MapServer/tile/3/1/2", PROXY)).toBe(
      "https://utility.arcgis.com/usrsvcs/servers/aaa/rest/services/Geocache_UTM33_EUREF89/GeocacheGraatone/MapServer/tile/3/1/2",
    );
    expect(proxyUrl("https://services.geodataonline.no/arcgis/rest/services/Geomap_UTM33_EUREF89/GeomapDrenering/MapServer", PROXY)).toContain("geodataonline.no");
    expect(proxyUrl("https://nvdbapiles.atlas.vegvesen.no/x", PROXY)).toBe("https://nvdbapiles.atlas.vegvesen.no/x");
  });

  it("uten token beholdes bare tjenester bak proxy", () => {
    const gdo = brukGdoProxy(parseConfig({}).gdo, PROXY);
    const b = begrensTilProxy(gdo);
    expect(b.elevationUrl).toContain("utility.arcgis.com");
    expect(b.temalag).toEqual([]);
    expect(b.flyfoto.aar).toEqual([]);
    expect(b.basemaps.every((m) => m.layers.every((l) => l.url.includes("utility.arcgis.com")))).toBe(true);
  });
});
