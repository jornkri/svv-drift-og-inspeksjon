import type { AppConfig } from "../config.ts";

/**
 * Geodata Online bak en proxy i ArcGIS Online (elementer med lagret innlogging). Tabellen kobler
 * tjenestestien under …/rest/services/ til proxy-URL-en AGOL gir elementet, f.eks.
 * «Geocache_UTM33_EUREF89/GeocacheGraatone/MapServer» →
 * «https://utility.arcgis.com/usrsvcs/servers/<id>/rest/services/Geocache_UTM33_EUREF89/GeocacheGraatone/MapServer».
 * Proxy-URL-ene er ikke hemmelige; tilgangen begrenses med henvisningsadresser (referrer) i AGOL.
 */
export type GdoProxy = Record<string, string>;

const GDO_HOST = /^https:\/\/(vector\.)?services\.geodataonline\.no\//;

/** Proxy-URL for en GDO-URL (lengste treff vinner), eller URL-en uendret. */
export function proxyUrl(url: string, proxy: GdoProxy): string {
  if (!GDO_HOST.test(url)) return url;
  const treff = Object.keys(proxy)
    .filter((sti) => url.includes(`/rest/services/${sti}`))
    .sort((a, b) => b.length - a.length)[0];
  if (!treff) return url;
  const i = url.indexOf(`/rest/services/${treff}`) + `/rest/services/${treff}`.length;
  return proxy[treff]!.replace(/\/$/, "") + url.slice(i);
}

/** Krever URL-en et GDO-token (dvs. går den direkte mot Geodata Online)? */
export const kreverGdoToken = (url: string) => GDO_HOST.test(url);

/** Bytter alle GDO-URL-er i konfigurasjonen til proxy-URL-er der det finnes en. */
export function brukGdoProxy(gdo: Omit<AppConfig["gdo"], "proxy">, proxy: GdoProxy): AppConfig["gdo"] {
  const p = (u: string) => proxyUrl(u, proxy);
  return {
    ...gdo,
    basemaps: gdo.basemaps.map((b) => ({ ...b, layers: b.layers.map((l) => ({ ...l, url: p(l.url) })), layers3d: b.layers3d.map((l) => ({ ...l, url: p(l.url) })) })),
    elevationUrl: p(gdo.elevationUrl),
    temalag: gdo.temalag.map((t) => ({ ...t, url: p(t.url) })),
    flyfoto: { ...gdo.flyfoto, url: p(gdo.flyfoto.url) },
    proxy,
  };
}

/**
 * URL for et lag fra webkart/webscene: via proxy når den finnes. Null når laget går direkte mot
 * Geodata Online uten at appen har token (laget ville ellers utløst en innloggingsdialog).
 */
export function lagUrlUtenToken(url: string, proxy: GdoProxy, harToken: boolean): string | null {
  const p = proxyUrl(url, proxy);
  return kreverGdoToken(p) && !harToken ? null : p;
}

/**
 * Uten GDO-token (f.eks. offentlig pilot): behold bare tjenestene som går via proxy, så brukeren
 * aldri får en innloggingsdialog fra Geodata Online. Tomme verdier betyr «ikke tilgjengelig».
 */
export function begrensTilProxy(gdo: AppConfig["gdo"]): AppConfig["gdo"] {
  const ok = (u: string) => !!u && !kreverGdoToken(u);
  return {
    ...gdo,
    // 3D bruker 2D-lagene (vektorfliser i UTM33) når rasterutgaven ikke går via proxy
    basemaps: gdo.basemaps
      .filter((b) => b.layers.every((l) => ok(l.url)))
      .map((b) => (b.layers3d.every((l) => ok(l.url)) ? b : { ...b, layers3d: b.layers })),
    elevationUrl: ok(gdo.elevationUrl) ? gdo.elevationUrl : "",
    temalag: gdo.temalag.filter((t) => ok(t.url)),
    flyfoto: ok(gdo.flyfoto.url) ? gdo.flyfoto : { ...gdo.flyfoto, aar: [] },
  };
}
