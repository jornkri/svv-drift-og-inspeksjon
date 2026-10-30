import Basemap from "@arcgis/core/Basemap.js";
import esriConfig from "@arcgis/core/config.js";
import TileLayer from "@arcgis/core/layers/TileLayer.js";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer.js";
import type Portal from "@arcgis/core/portal/Portal.js";
import type { AppConfig, BasemapDef, BasemapId } from "../config.ts";

const GDO_HOSTS = /^https:\/\/(vector\.)?services\.geodataonline\.no\//;

let gdoToken: string | null = null;

/**
 * Henter Geodata Online-token fra dev-endepunktet (vite.config.ts) og legger det
 * på alle forespørsler mot Geodata Online. Returnerer null hvis token ikke er satt opp.
 */
export async function setupGdoToken(cfg: AppConfig): Promise<string | null> {
  const fetchToken = async (): Promise<{ token: string; expires: number } | null> => {
    try {
      const r = await fetch(cfg.gdo.tokenEndpoint, { cache: "no-store" });
      if (!r.ok) return null;
      const j = (await r.json()) as { token?: string; expires?: number };
      return j.token ? { token: j.token, expires: j.expires ?? Date.now() + 55 * 60_000 } : null;
    } catch {
      return null;
    }
  };
  const first = await fetchToken();
  if (!first) return null;
  gdoToken = first.token;
  esriConfig.request.interceptors?.push({
    urls: GDO_HOSTS,
    before(params) {
      if (!gdoToken) return;
      const opts = params.requestOptions ?? (params.requestOptions = {});
      opts.query = { ...((opts.query as Record<string, unknown>) ?? {}), token: gdoToken };
    },
  });
  // Forny før utløp
  const schedule = (expires: number) => {
    const ms = Math.max(60_000, expires - Date.now() - 5 * 60_000);
    setTimeout(async () => {
      const next = await fetchToken();
      if (next) {
        gdoToken = next.token;
        schedule(next.expires);
      }
    }, ms);
  };
  schedule(first.expires);
  return gdoToken;
}

export function currentGdoToken(): string | null {
  return gdoToken;
}

export function createBasemap(def: BasemapDef, dim: "2d" | "3d"): Basemap {
  const defs = dim === "2d" ? def.layers : def.layers3d;
  const layers = defs.map((l) => (l.type === "vector" ? new VectorTileLayer({ url: l.url }) : new TileLayer({ url: l.url })));
  // Hybrid: bildelaget er bakgrunn, referanselaget legges oppå
  const [base, ...reference] = layers;
  return new Basemap({
    id: `${def.id}-${dim}`,
    title: def.navn,
    baseLayers: base ? [base] : [],
    referenceLayers: reference,
  });
}

/**
 * Bakgrunnskart fra portalens bakgrunnskartgruppe (Geodata Online via Enterprise,
 * tokenene håndteres av portalen). Elementene matches mot våre navn på tittel.
 */
export async function portalBasemaps(cfg: AppConfig, portal: Portal): Promise<Partial<Record<BasemapId, Basemap>>> {
  if (!cfg.basemapGroupId) return {};
  const res = await portal.queryItems({ query: `group:${cfg.basemapGroupId} AND type:"Web Map"`, num: 50 });
  const out: Partial<Record<BasemapId, Basemap>> = {};
  for (const def of cfg.gdo.basemaps) {
    const item = res.results.find((i) => i.title?.toLowerCase().includes(def.navn.toLowerCase()));
    if (item) out[def.id] = new Basemap({ portalItem: item });
  }
  return out;
}

let proxyTilgang = false;

/** Geodata Online er tilgjengelig via proxy i ArcGIS Online (uten token i nettleseren). */
export function settGdoProxyTilgang(v: boolean): void {
  proxyTilgang = v;
}

/** Har appen tilgang til Geodata Online (token fra dev-serveren eller proxy i AGOL)? */
export function hasGdoAccess(): boolean {
  return gdoToken !== null || proxyTilgang;
}
