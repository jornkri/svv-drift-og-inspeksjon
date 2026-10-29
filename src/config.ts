import {
  DOKUMENT_FIELDS,
  INSPEKSJON_FIELDS,
  OBJEKT_FIELDS,
  OPPGAVE_FIELDS,
  type Dokument,
  type Fag,
  type FieldMap,
  type Inspeksjon,
  type Objekt,
  type Oppgave,
} from "./data/schema.ts";

/** Referanse til et lag: URL til feature-lag/tabell, eller tittel på et lag i webkartet. */
export type LayerRef = { kind: "url"; url: string } | { kind: "title"; title: string };

export interface SceneLayerRef {
  navn: string;
  url: string;
}

export interface BasemapDef {
  id: BasemapId;
  navn: string;
  /** Tjenester i UTM33 (EUREF89). Første lag bestemmer flisskjemaet. */
  layers: { type: "vector" | "tile"; url: string }[];
  /** Rasterutgave for 3D (lokal scene) */
  layers3d: { type: "tile"; url: string }[];
  thumb: string;
}

export type BasemapId = "graatone" | "basis" | "bilder" | "bilder_hybrid" | "landskap" | "mork_kanvas";

export interface AppConfig {
  useMock: boolean;
  portalUrl: string;
  appId: string;
  webmapId: string;
  websceneId: string;
  layers: Record<Fag, LayerRef[]>;
  inspeksjonTable: LayerRef | null;
  oppgaveLayer: LayerRef | null;
  dokumentTable: LayerRef | null;
  sceneLayers: SceneLayerRef[];
  basemapGroupId: string;
  printUrl: string;
  fields: {
    objekt: FieldMap<Objekt>;
    dokument: FieldMap<Dokument>;
    inspeksjon: FieldMap<Inspeksjon>;
    oppgave: FieldMap<Oppgave>;
  };
  gdo: {
    /** Dev-endepunkt som henter token server-til-server (se vite.config.ts) */
    tokenEndpoint: string;
    basemaps: BasemapDef[];
    elevationUrl: string;
    adresseSokUrl: string;
  };
  nvdb: {
    baseUrl: string;
    client: string;
  };
  geofence: {
    maxAccuracyM: number;
    radiusM: number;
    debounceMs: number;
  };
  /** Startutsnitt for prosjektet (EPSG:25833) */
  prosjekt: {
    navn: string;
    senter: [number, number];
    skala: number;
  };
  /** Romlig referanse for alle visninger */
  wkid: 25833;
}

const GDO = "https://services.geodataonline.no/arcgis/rest/services";
const GDO_VT = "https://vector.services.geodataonline.no/arcgis/rest/services/GeocacheVector";

/**
 * Geodata Online bakgrunnskart i UTM33 (EUREF89). URL-ene er hentet fra
 * https://dokumentasjon.geodataonline.no/docs/Bakgrunnskart (okt. 2026).
 * «Landskap» finnes ikke som eget kart hos Geodata Online; vi bruker Basis med terreng.
 */
export const GDO_BASEMAPS: BasemapDef[] = [
  {
    id: "graatone",
    navn: "Gråtone",
    layers: [{ type: "vector", url: `${GDO_VT}/GeocacheGraatone/VectorTileServer` }],
    layers3d: [{ type: "tile", url: `${GDO}/Geocache_UTM33_EUREF89/GeocacheGraatone/MapServer` }],
    thumb: "#dadada",
  },
  {
    id: "basis",
    navn: "Basis",
    layers: [{ type: "vector", url: `${GDO_VT}/GeocacheBasis/VectorTileServer` }],
    layers3d: [{ type: "tile", url: `${GDO}/Geocache_UTM33_EUREF89/GeocacheBasis/MapServer` }],
    thumb: "#e8f3e9",
  },
  {
    id: "bilder",
    navn: "Bilder",
    layers: [{ type: "tile", url: `${GDO}/Geocache_UTM33_EUREF89/GeocacheBilder/MapServer` }],
    layers3d: [{ type: "tile", url: `${GDO}/Geocache_UTM33_EUREF89/GeocacheBilder/MapServer` }],
    thumb: "#697277",
  },
  {
    id: "bilder_hybrid",
    navn: "Bilder hybrid",
    layers: [
      { type: "tile", url: `${GDO}/Geocache_UTM33_EUREF89/GeocacheBilder/MapServer` },
      { type: "tile", url: `${GDO}/Geocache_UTM33_EUREF89/GeocacheHybrid/MapServer` },
    ],
    layers3d: [
      { type: "tile", url: `${GDO}/Geocache_UTM33_EUREF89/GeocacheBilder/MapServer` },
      { type: "tile", url: `${GDO}/Geocache_UTM33_EUREF89/GeocacheHybrid/MapServer` },
    ],
    thumb: "#858d90",
  },
  {
    id: "landskap",
    navn: "Landskap",
    layers: [{ type: "vector", url: `${GDO_VT}/GeocacheBasisTerreng/VectorTileServer` }],
    layers3d: [{ type: "tile", url: `${GDO}/Geocache_UTM33_EUREF89/GeocacheTerrengskygge/MapServer` }],
    thumb: "#e6f1f5",
  },
  {
    id: "mork_kanvas",
    navn: "Mørk kanvas",
    layers: [{ type: "vector", url: `${GDO_VT}/GeocacheKanvasMork/VectorTileServer` }],
    layers3d: [{ type: "tile", url: `${GDO}/Geocache_UTM33_EUREF89/GeocacheGraatone/MapServer` }],
    thumb: "#444f55",
  },
];

function parseLayerRefs(v: string | undefined): LayerRef[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("tittel:") ? { kind: "title", title: s.slice(7).trim() } : { kind: "url", url: s }));
}

function parseSceneLayers(v: string | undefined): SceneLayerRef[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [navn, url] = s.split("|");
      return { navn: (navn ?? "").trim(), url: (url ?? "").trim() };
    })
    .filter((r) => r.navn && r.url);
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : fallback;
};

export function parseConfig(env: Record<string, string | boolean | undefined>): AppConfig {
  const s = (k: string) => (typeof env[k] === "string" ? (env[k] as string) : undefined);
  return {
    useMock: s("VITE_USE_MOCK") !== "false",
    portalUrl: (s("VITE_PORTAL_URL") || "https://kart.vegvesen.no/portal").replace(/\/$/, ""),
    appId: s("VITE_APP_ID") ?? "",
    webmapId: s("VITE_WEBMAP_ID") ?? "",
    websceneId: s("VITE_WEBSCENE_ID") ?? "",
    layers: {
      VA: parseLayerRefs(s("VITE_LAYERS_VA")),
      Elektro: parseLayerRefs(s("VITE_LAYERS_ELEKTRO")),
      Veg: parseLayerRefs(s("VITE_LAYERS_VEG")),
    },
    inspeksjonTable: parseLayerRefs(s("VITE_TABLE_INSPEKSJONER"))[0] ?? null,
    oppgaveLayer: parseLayerRefs(s("VITE_LAYER_OPPGAVER"))[0] ?? null,
    dokumentTable: parseLayerRefs(s("VITE_TABLE_DOKUMENTER"))[0] ?? null,
    sceneLayers: parseSceneLayers(s("VITE_SCENE_LAYERS")),
    basemapGroupId: s("VITE_BASEMAP_GROUP_ID") ?? "",
    printUrl: s("VITE_PRINT_URL") ?? "",
    // TODO(SVV): juster mappingen til feltnavnene i SVVs tjenester (se ?diagnose=1).
    fields: {
      objekt: { ...OBJEKT_FIELDS },
      dokument: { ...DOKUMENT_FIELDS },
      inspeksjon: { ...INSPEKSJON_FIELDS },
      oppgave: { ...OPPGAVE_FIELDS },
    },
    gdo: {
      tokenEndpoint: "/api/gdo-token",
      basemaps: GDO_BASEMAPS,
      elevationUrl: `${GDO}/Geocache_UTM33_EUREF89/GeocacheTerreng/ImageServer`,
      adresseSokUrl: `${GDO}/ProxyServices/search/adresse`,
    },
    nvdb: {
      baseUrl: "https://nvdbapiles.atlas.vegvesen.no",
      client: s("VITE_NVDB_CLIENT") || "svv-drift-og-inspeksjon",
    },
    geofence: {
      maxAccuracyM: num(s("VITE_GPS_MAX_ACCURACY_M"), 10),
      radiusM: num(s("VITE_GEOFENCE_RADIUS_M"), 15),
      debounceMs: 2000,
    },
    prosjekt: {
      navn: "E45 Kløfta B12016",
      // Kløfta/Langhølen, Alta (EV45 S2D1 ca. m10200)
      senter: [816955, 7764330],
      skala: 9000,
    },
    wkid: 25833,
  };
}

export const config: AppConfig = parseConfig(import.meta.env as unknown as Record<string, string>);
