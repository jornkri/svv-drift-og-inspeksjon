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

import gdoProxyFil from "./gdo-proxy.json";
import { brukGdoProxy, type GdoProxy } from "./map/gdo-proxy.ts";

/** Geodata Online-tjenester bak proxy i ArcGIS Online (se src/map/gdo-proxy.ts). */
const GDO_PROXY: GdoProxy = gdoProxyFil;

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
  layers3d: { type: "vector" | "tile"; url: string }[];
  thumb: string;
}

export type BasemapId = "graatone" | "basis" | "bilder" | "bilder_hybrid" | "landskap" | "mork_kanvas";

export interface AppConfig {
  useMock: boolean;
  /** Offentlig pilot: portalen brukes uten innlogging (bare offentlig delte tjenester) */
  anonym: boolean;
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
    temalag: TemalagDef[];
    flyfoto: { url: string; aar: number[] };
    /** Tjenestesti → proxy-URL i ArcGIS Online (src/gdo-proxy.json) */
    proxy: import("./map/gdo-proxy.ts").GdoProxy;
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
const GDO_VEKTOR = "https://vector.services.geodataonline.no/arcgis/rest/services/GeocacheVector";

/**
 * Temalag fra Geodata Online. Tjenestene, lag-ID-ene og antall treff i prosjektområdet er
 * kartlagt i docs/research/gdo-tjenester.json.
 */
export interface TemalagDef {
  id: string;
  navn: string;
  gruppe: "Vann og drenering" | "Skred og grunn" | "Eiendom og plan" | "Natur, kultur og miljø" | "Terreng" | "Trafikk";
  type: "map-image" | "feature" | "vector-tile" | "tile";
  url: string;
  /** Underlag som vises: i MapServer (map-image) eller lag-ID-er i FeatureServer (feature) */
  sublag?: number[];
  /** Feature: feltene som vises ved klikk, i rekkefølge (ellers alle meningsfulle felt) */
  felt?: string[];
  /** Feature: etikett (Arcade), f.eks. gnr/bnr */
  etikett?: string;
  beskrivelse: string;
  opasitet?: number;
}

export const GDO_TEMALAG: TemalagDef[] = [
  { id: "drenering", navn: "Dreneringslinjer og forsenkninger", gruppe: "Vann og drenering", type: "map-image", url: `${GDO}/Geomap_UTM33_EUREF89/GeomapDrenering/MapServer`, sublag: [1, 5, 7, 13, 17, 19], beskrivelse: "Beregnede vannveger fra 0,5 m terrengmodell med oppstrøms areal, stikkrenner og risikoområder." },
  { id: "flom", navn: "Flom – aktsomhet", gruppe: "Vann og drenering", type: "map-image", url: `${GDO}/Geomap_UTM33_EUREF89/GeomapDOKSamfunnssikkerhet/MapServer`, sublag: [1149, 1159], beskrivelse: "NVEs aktsomhetskart for flom (DOK).", opasitet: 0.7 },
  { id: "skred", navn: "Skred – aktsomhet og hendelser", gruppe: "Skred og grunn", type: "map-image", url: `${GDO}/Geomap_UTM33_EUREF89/GeomapDOKSamfunnssikkerhet/MapServer`, sublag: [1113, 1119, 1125, 1191], beskrivelse: "Jord- og flomskred, steinsprang, snøskred (S3) og registrerte skredhendelser (DOK).", opasitet: 0.7 },
  { id: "geologi", navn: "Løsmasser og grunnundersøkelser", gruppe: "Skred og grunn", type: "map-image", url: `${GDO}/Geomap_UTM33_EUREF89/GeomapDOKGeologi/MapServer`, sublag: [408, 427, 422], beskrivelse: "NGUs løsmassekart, grunnundersøkelser og mulig marin leire (DOK).", opasitet: 0.6 },
  {
    id: "eiendom",
    navn: "Eiendomsgrenser",
    gruppe: "Eiendom og plan",
    type: "feature",
    url: `${GDO}/Geomap_UTM33_EUREF89/GeomapEiendom2/FeatureServer`,
    // 1 Eiendomsgrense, 3 Eiendomsident (teig med gnr/bnr); synlige fra 1:5 000
    sublag: [1, 3],
    felt: ["gids", "bruksnavn", "adresse", "matrikkeltype", "kommunenavn", "grensetype", "malemetodebeskr", "noyaktighet"],
    etikett: "$feature.gids",
    beskrivelse: "Eiendomsgrenser og gårds-/bruksnummer fra matrikkelen (vises fra 1:5 000).",
  },
  { id: "regulering", navn: "Reguleringsplaner", gruppe: "Eiendom og plan", type: "map-image", url: `${GDO}/Geomap_UTM33_EUREF89/GeomapReguleringsplan/MapServer`, beskrivelse: "Vedtatte reguleringsplaner.", opasitet: 0.6 },
  { id: "natur", navn: "Naturvern og vannforekomster", gruppe: "Natur, kultur og miljø", type: "map-image", url: `${GDO}/Geomap_UTM33_EUREF89/GeomapDOKNatur/MapServer`, sublag: [809, 813, 807, 837, 828, 861], beskrivelse: "Verneområder, vernede vassdrag, viktige naturtyper, arter og anadrom laksefisk (DOK).", opasitet: 0.6 },
  { id: "kulturminner", navn: "Kulturminner", gruppe: "Natur, kultur og miljø", type: "map-image", url: `${GDO}/Geomap_UTM33_EUREF89/GeomapKulturminner/MapServer`, beskrivelse: "Kulturminner med sikringssoner (Askeladden)." },
  { id: "stoy", navn: "Støysoner fra veg", gruppe: "Natur, kultur og miljø", type: "map-image", url: `${GDO}/Geomap_UTM33_EUREF89/GeomapForurensning/MapServer`, sublag: [2], beskrivelse: "Beregnede støysoner langs veg.", opasitet: 0.5 },
  { id: "hoydekurver", navn: "Høydekurver", gruppe: "Terreng", type: "vector-tile", url: `${GDO_VEKTOR}/GeocacheHoydekurver/VectorTileServer`, beskrivelse: "Høydekurver fra Geodata Online." },
  { id: "helning", navn: "Terrenghelning", gruppe: "Terreng", type: "tile", url: `${GDO}/Geocache_UTM33_EUREF89/GeocacheHelning/MapServer`, beskrivelse: "Helningskart fra terrengmodellen.", opasitet: 0.5 },
  { id: "ulykker", navn: "Trafikkulykker (NVDB)", gruppe: "Trafikk", type: "feature", url: `${GDO}/Geomap_UTM33_EUREF89/GeomapNVDB/FeatureServer/20`, beskrivelse: "Politirapporterte trafikkulykker med personskade fra NVDB." },
];
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

export function parseConfig(env: Record<string, string | boolean | undefined>, gdoProxy: GdoProxy = GDO_PROXY): AppConfig {
  const s = (k: string) => (typeof env[k] === "string" ? (env[k] as string) : undefined);
  return {
    useMock: s("VITE_USE_MOCK") !== "false",
    anonym: s("VITE_ANONYM") === "true",
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
    gdo: brukGdoProxy({
      tokenEndpoint: "/api/gdo-token",
      basemaps: GDO_BASEMAPS,
      // Kan overstyres, f.eks. med prosjektets egen (offentlige) terrengmodell i piloten
      elevationUrl: s("VITE_ELEVATION_URL") || `${GDO}/Geocache_UTM33_EUREF89/GeocacheTerreng/ImageServer`,
      adresseSokUrl: `${GDO}/ProxyServices/search/adresse`,
      temalag: GDO_TEMALAG,
      flyfoto: { url: `${GDO}/Geomap_UTM33_EUREF89/GeomapBilder3/ImageServer`, aar: [1958, 1966, 1968, 2005, 2006, 2009, 2011, 2013, 2015, 2024] },
    }, gdoProxy),
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
