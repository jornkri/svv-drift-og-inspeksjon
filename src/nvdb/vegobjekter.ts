/**
 * Vegobjekter fra NVDB API Les v4 (ekte driftsdata). Typer, egenskaps-ID-er og
 * svarformat er kontrollert mot API-et og dokumentert i docs/research/nvdb.json.
 */

export type NvdbFag = "VA" | "Elektro" | "Veg" | "Kontekst";

export interface NvdbType {
  id: number;
  navn: string;
  fag: NvdbFag;
  geometri: "punkt" | "linje" | "flate";
  /** Kartsymbol: form for punkter, strektype og bredde for linjer. Fargen er felles (NVDB_FARGE). */
  form?: "circle" | "triangle" | "square" | "diamond";
  strek?: "solid" | "short-dash" | "dash" | "dash-dot" | "short-dot" | "long-dash" | "dot";
  bredde?: number;
  /** Vises når appen starter */
  standard: boolean;
  /** Egenskaper (navn) som oppsummerer objektet i lister */
  nokkel: string[];
}

/** NVDB-objekter tegnes mørkt nøytralt, slik at de ikke forveksles med MMI-fargene på modellobjektene. */
export const NVDB_FARGE: [number, number, number] = [38, 44, 48];

export const NVDB_TYPER: NvdbType[] = [
  { id: 79, navn: "Stikkrenne/Kulvert", fag: "VA", geometri: "linje", strek: "solid", bredde: 4, standard: true, nokkel: ["Diameter, innvendig", "Materialtype", "Lengde"] },
  { id: 80, navn: "Grøft, åpen", fag: "VA", geometri: "linje", strek: "short-dash", bredde: 2.5, standard: true, nokkel: ["Type", "Materiale"] },
  { id: 83, navn: "Kum", fag: "VA", geometri: "punkt", form: "circle", standard: true, nokkel: ["Type", "Materialtype", "Diameter"] },
  { id: 77, navn: "Rørledning", fag: "VA", geometri: "linje", strek: "dash", bredde: 2.5, standard: false, nokkel: ["Diameter", "Materialtype", "Lengde"] },
  { id: 78, navn: "Lukket rørgrøft", fag: "VA", geometri: "linje", strek: "dash-dot", bredde: 2.5, standard: false, nokkel: ["Type"] },
  { id: 87, navn: "Belysningspunkt", fag: "Elektro", geometri: "punkt", form: "triangle", standard: true, nokkel: ["Plassering", "Bruksområde"] },
  { id: 92, navn: "Kabel", fag: "Elektro", geometri: "linje", strek: "short-dot", bredde: 2, standard: false, nokkel: ["Framføringsveg", "Lengde, reell"] },
  { id: 852, navn: "Trekkerør/kanal", fag: "Elektro", geometri: "linje", strek: "long-dash", bredde: 2, standard: false, nokkel: ["Type", "Diameter, indre", "Materiale"] },
  { id: 502, navn: "Skap, teknisk", fag: "Elektro", geometri: "punkt", form: "square", standard: false, nokkel: ["Type"] },
  { id: 5, navn: "Rekkverk", fag: "Veg", geometri: "linje", strek: "solid", bredde: 2, standard: true, nokkel: ["Rekkverkstype", "Lengde"] },
  { id: 14, navn: "Rekkverksende", fag: "Veg", geometri: "punkt", form: "circle", standard: true, nokkel: ["Type"] },
  { id: 95, navn: "Skiltpunkt", fag: "Veg", geometri: "punkt", form: "diamond", standard: true, nokkel: ["Avstand fra dekkekant", "Høyde over vegkant"] },
  { id: 9, navn: "Kantstein", fag: "Veg", geometri: "linje", strek: "dot", bredde: 2, standard: false, nokkel: ["Materialtype", "Lengde"] },
  { id: 241, navn: "Vegdekke", fag: "Veg", geometri: "linje", strek: "solid", bredde: 7, standard: false, nokkel: ["Massetype", "Dekkeleggingsdato"] },
  { id: 105, navn: "Fartsgrense", fag: "Kontekst", geometri: "linje", strek: "solid", bredde: 7, standard: false, nokkel: ["Fartsgrense"] },
  { id: 60, navn: "Bru", fag: "Kontekst", geometri: "flate", standard: true, nokkel: ["Byggeår", "Lengde", "Brukategori"] },
];

/** Tilstandstyper i NVDB (barn via relasjoner) med egenskapene som bærer tilstand og dato. */
export const NVDB_TILSTAND: Record<number, { tilstand: string; dato: string | null }> = {
  947: { tilstand: "Tilstand, samlet", dato: "Dato kontrollert, enkel inspeksjon" },
  284: { tilstand: "Tilstand", dato: "Dato kontrollert" },
  276: { tilstand: "Tilstand", dato: "Dato kontrollert" },
  302: { tilstand: "Tilstand", dato: null },
  761: { tilstand: "Tilstand", dato: null },
  294: { tilstand: "Tilstand", dato: null },
};

export const nvdbType = (id: number): NvdbType | undefined => NVDB_TYPER.find((t) => t.id === id);

export interface NvdbEgenskap {
  id: number;
  navn: string;
  verdi: string | number | null;
  egenskapstype: string;
  enhet?: { kortnavn?: string };
}

export interface NvdbVegobjekt {
  id: number;
  href?: string;
  metadata?: { type?: { id: number; navn: string }; versjon?: number; startdato?: string; startdato_vegobjekt?: string; sist_modifisert?: string };
  egenskaper?: NvdbEgenskap[];
  geometri?: { wkt?: string; srid?: number; egengeometri?: boolean; lengde?: number };
  lokasjon?: {
    vegsystemreferanser?: { kortform?: string }[];
    kontraktsområder?: { nummer?: number; navn?: string }[];
    kommuner?: number[];
  };
  relasjoner?: { barn?: { type: { id: number; navn: string }; vegobjekter: number[] }[]; foreldre?: { type: { id: number; navn: string }; vegobjekter: number[] }[] };
}

export type Wkt =
  | { type: "point"; x: number; y: number; z: number | null }
  | { type: "polyline"; paths: number[][][] }
  | { type: "polygon"; rings: number[][][] };

const NODATA = -99999;

function koord(s: string): number[] {
  const v = s.trim().split(/\s+/).map(Number);
  if (v.length > 2 && v[2]! <= NODATA) v.length = 2;
  return v;
}

const ring = (s: string) => s.split(",").map(koord);

/** Tolker WKT fra NVDB (2D/3D punkt, linje, flate og multivarianter). */
export function parseWkt(wkt: string | undefined): Wkt | null {
  if (!wkt) return null;
  const m = /^\s*(MULTI)?(POINT|LINESTRING|POLYGON)\s*Z?\s*\((.*)\)\s*$/is.exec(wkt);
  if (!m) return null;
  const multi = !!m[1];
  const kind = m[2]!.toUpperCase();
  const body = m[3]!;
  if (kind === "POINT") {
    const first = body.replace(/[()]/g, "").split(",")[0]!;
    const [x, y, z] = koord(first);
    if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) return null;
    return { type: "point", x, y, z: z ?? null };
  }
  const grupper = (s: string) => [...s.matchAll(/\(([^()]*)\)/g)].map((g) => ring(g[1]!));
  if (kind === "LINESTRING") return { type: "polyline", paths: multi ? grupper(body) : [ring(body)] };
  return { type: "polygon", rings: grupper(multi ? body.replace(/^\(|\)$/g, "") : body) };
}

export function egenskap(o: NvdbVegobjekt, navn: string): NvdbEgenskap | undefined {
  return o.egenskaper?.find((e) => e.navn === navn);
}

/** Formaterer en egenskapsverdi med enhet, f.eks. «450 mm» eller «10,42 m». */
export function formaterVerdi(e: NvdbEgenskap): string {
  if (e.verdi == null || e.verdi === "") return "–";
  if (e.egenskapstype === "Dato" && typeof e.verdi === "string") {
    const [y, mo, d] = e.verdi.split("-");
    return d && mo ? `${d}.${mo}.${y}` : e.verdi;
  }
  const v = typeof e.verdi === "number" ? e.verdi.toLocaleString("nb-NO", { maximumFractionDigits: 2 }) : String(e.verdi);
  return e.enhet?.kortnavn ? `${v} ${e.enhet.kortnavn}` : v;
}

/** Kort oppsummering av nøkkelegenskaper. */
export function oppsummer(o: NvdbVegobjekt): string {
  const t = nvdbType(o.metadata?.type?.id ?? -1);
  const deler = (t?.nokkel ?? [])
    .map((n) => egenskap(o, n))
    .filter((e): e is NvdbEgenskap => !!e && e.verdi != null && e.verdi !== "")
    .map(formaterVerdi);
  return deler.join(" · ");
}

/** Egenskaper som skal vises i panelet (geometri-egenskaper utelatt). */
export function visningsegenskaper(o: NvdbVegobjekt): NvdbEgenskap[] {
  return (o.egenskaper ?? []).filter((e) => e.egenskapstype !== "Geometri" && !e.navn.startsWith("Geometri"));
}

/** Tilstand fra et tilstandsobjekt (type 947, 284, 276, …). */
export function lesTilstand(o: NvdbVegobjekt): { type: string; tilstand: string; dato: string | null } | null {
  const typeId = o.metadata?.type?.id ?? -1;
  const def = NVDB_TILSTAND[typeId];
  if (!def) return null;
  const t = egenskap(o, def.tilstand);
  if (!t || t.verdi == null) return null;
  const d = def.dato ? egenskap(o, def.dato) : undefined;
  return { type: o.metadata?.type?.navn ?? String(typeId), tilstand: String(t.verdi), dato: typeof d?.verdi === "string" ? d.verdi : null };
}

export interface NvdbKlient {
  baseUrl: string;
  client: string;
}

const headers = (k: NvdbKlient) => ({ Accept: "application/json", "X-Client": k.client });

/**
 * Henter alle vegobjekter av en type i et kartutsnitt (EUREF89 UTM33, srid 5973).
 * Paginering: send metadata.neste.start videre og stopp når returnert < sidestørrelse.
 */
export async function hentVegobjekter(
  k: NvdbKlient,
  typeId: number,
  bbox: [number, number, number, number],
  opts: { signal?: AbortSignal; maksSider?: number; inkluder?: string; fetchFn?: typeof fetch } = {},
): Promise<NvdbVegobjekt[]> {
  const f = opts.fetchFn ?? fetch;
  const ut: NvdbVegobjekt[] = [];
  const base =
    `${k.baseUrl}/vegobjekter/api/v4/vegobjekter/${typeId}?kartutsnitt=${bbox.map((v) => Math.round(v)).join(",")}` +
    `&srid=5973&inkluder=${opts.inkluder ?? "egenskaper,geometri,lokasjon,metadata"}&antall=500`;
  let start: string | null = null;
  for (let side = 0; side < (opts.maksSider ?? 10); side++) {
    const url: string = start ? `${base}&start=${encodeURIComponent(start)}` : base;
    const r = await f(url, { headers: headers(k), ...(opts.signal ? { signal: opts.signal } : {}) });
    if (!r.ok) throw new Error(`NVDB svarte ${r.status} for type ${typeId}`);
    const j = (await r.json()) as { objekter?: NvdbVegobjekt[]; metadata?: { returnert?: number; sidestørrelse?: number; neste?: { start?: string } } };
    ut.push(...(j.objekter ?? []));
    const ret = j.metadata?.returnert ?? 0;
    const str = j.metadata?.sidestørrelse ?? 0;
    start = j.metadata?.neste?.start ?? null;
    if (!start || ret === 0 || ret < str) break;
  }
  return ut;
}

/** Henter ett vegobjekt med alle detaljer (egenskaper, lokasjon, relasjoner, geometri). */
export async function hentVegobjekt(k: NvdbKlient, typeId: number, id: number, signal?: AbortSignal): Promise<NvdbVegobjekt> {
  const r = await fetch(`${k.baseUrl}/vegobjekter/api/v4/vegobjekter/${typeId}/${id}?inkluder=alle&srid=5973`, {
    headers: headers(k),
    ...(signal ? { signal } : {}),
  });
  if (!r.ok) throw new Error(`NVDB svarte ${r.status}`);
  return (await r.json()) as NvdbVegobjekt;
}

/**
 * Tilstandsregistreringer for et objekt (via relasjoner til tilstandstyper).
 * Henter i bunker med parameteren «ider» (ett kall per type og bunke) for å skåne rate-grensen.
 */
export async function hentTilstander(
  k: NvdbKlient,
  o: NvdbVegobjekt,
  opts: { bunke?: number; fetchFn?: typeof fetch } = {},
): Promise<{ type: string; tilstand: string; dato: string | null; id: number }[]> {
  const f = opts.fetchFn ?? fetch;
  const bunke = opts.bunke ?? 100;
  const barn = (o.relasjoner?.barn ?? []).filter((b) => NVDB_TILSTAND[b.type.id]);
  const kall = barn.flatMap((b) => {
    const ut: { typeId: number; ider: number[] }[] = [];
    for (let i = 0; i < b.vegobjekter.length; i += bunke) ut.push({ typeId: b.type.id, ider: b.vegobjekter.slice(i, i + bunke) });
    return ut;
  });
  const res = await Promise.all(
    kall.map(async (c) => {
      try {
        const r = await f(`${k.baseUrl}/vegobjekter/api/v4/vegobjekter/${c.typeId}?ider=${c.ider.join(",")}&inkluder=egenskaper,metadata&antall=${c.ider.length}`, {
          headers: headers(k),
        });
        if (!r.ok) return [];
        const j = (await r.json()) as { objekter?: NvdbVegobjekt[] };
        return (j.objekter ?? []).flatMap((x) => {
          const t = lesTilstand(x);
          return t ? [{ ...t, id: x.id }] : [];
        });
      } catch {
        return [];
      }
    }),
  );
  return res.flat().sort((a, b) => (b.dato ?? "").localeCompare(a.dato ?? ""));
}

/** Oppsummerer tilstander: antall per verdi og siste kontrolldato. */
export function tilstandSammendrag(t: { tilstand: string; dato: string | null }[]): { perVerdi: [string, number][]; siste: string | null } {
  const m = new Map<string, number>();
  for (const x of t) m.set(x.tilstand, (m.get(x.tilstand) ?? 0) + 1);
  const siste = t.map((x) => x.dato).filter((d): d is string => !!d).sort().at(-1) ?? null;
  return { perVerdi: [...m.entries()].sort((a, b) => b[1] - a[1]), siste };
}

/** Alle koordinater i en tolket WKT som linjer (et punkt blir en linje med ett punkt). */
export function wktLinjer(g: Wkt): number[][][] {
  if (g.type === "point") return [[[g.x, g.y]]];
  return g.type === "polyline" ? g.paths : g.rings;
}

function punktSegment(p: number[], a: number[], b: number[]): number {
  const dx = b[0]! - a[0]!;
  const dy = b[1]! - a[1]!;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / l2));
  return Math.hypot(p[0]! - (a[0]! + t * dx), p[1]! - (a[1]! + t * dy));
}

function punktLinje(p: number[], linje: number[][]): number {
  if (linje.length === 1) return Math.hypot(p[0]! - linje[0]![0]!, p[1]! - linje[0]![1]!);
  let min = Infinity;
  for (let i = 1; i < linje.length; i++) min = Math.min(min, punktSegment(p, linje[i - 1]!, linje[i]!));
  return min;
}

/** Minste planavstand mellom to sett med linjer/punkter (eksakt for linjer som ikke krysser). */
export function minsteAvstand(a: number[][][], b: number[][][]): number {
  let min = Infinity;
  for (const la of a) for (const lb of b) {
    for (const p of la) min = Math.min(min, punktLinje(p, lb));
    for (const p of lb) min = Math.min(min, punktLinje(p, la));
  }
  return min;
}

/** ÅDT (Trafikkmengde, type 540) ved et punkt – brukes til tiltakstid etter R610 tabell 1.3—1. */
export async function hentAadt(k: NvdbKlient, x: number, y: number, radius = 30): Promise<{ aadt: number; aar: number | null; vegref: string | null } | null> {
  const objekter = await hentVegobjekter(k, 540, [x - radius, y - radius, x + radius, y + radius], { maksSider: 1, inkluder: "egenskaper,lokasjon" });
  const beste = objekter
    .map((o) => ({ o, aadt: egenskap(o, "ÅDT, total")?.verdi, aar: egenskap(o, "År, gjelder for")?.verdi }))
    .filter((x): x is { o: NvdbVegobjekt; aadt: number; aar: number | null } => typeof x.aadt === "number")
    .sort((a, b) => b.aadt - a.aadt)[0];
  if (!beste) return null;
  return { aadt: beste.aadt, aar: typeof beste.aar === "number" ? beste.aar : null, vegref: beste.o.lokasjon?.vegsystemreferanser?.[0]?.kortform ?? null };
}

/** Vegkategorier i prioritert rekkefølge: europa-, riks-, fylkes-, kommunal, privat og skogsbilveg. */
const KATEGORI_REKKEFOLGE = ["E", "R", "F", "K", "P", "S"];

/**
 * Vegsystemreferanse for et punkt (NVDB API Les, /vegnett/api/v4/posisjon), f.eks.
 * «EV45 S2D1 m10167». Høyeste vegkategori innenfor maksAvstand meter vinner, deretter nærmeste,
 * slik at en stikkrenne under E45 får E45 og ikke en anleggsveg like ved. Null når ingen veg er nær.
 */
export async function hentVegreferanse(
  k: NvdbKlient,
  x: number,
  y: number,
  opts: { maksAvstand?: number; fetchFn?: typeof fetch } = {},
): Promise<string | null> {
  const f = opts.fetchFn ?? fetch;
  const url = `${k.baseUrl}/vegnett/api/v4/posisjon?nord=${y.toFixed(2)}&ost=${x.toFixed(2)}&srid=5973&maks_avstand=${opts.maksAvstand ?? 50}&maks_antall=10`;
  const r = await f(url, { headers: headers(k) });
  if (!r.ok) return null;
  const liste = (await r.json()) as { vegsystemreferanse?: { kortform?: string; vegsystem?: { vegkategori?: string } }; avstand?: number }[];
  const rang = (x: (typeof liste)[number]) => {
    const i = KATEGORI_REKKEFOLGE.indexOf(x.vegsystemreferanse?.vegsystem?.vegkategori ?? "");
    return i < 0 ? KATEGORI_REKKEFOLGE.length : i;
  };
  const beste = liste.filter((x) => x.vegsystemreferanse?.kortform).sort((a, b) => rang(a) - rang(b) || (a.avstand ?? 0) - (b.avstand ?? 0))[0];
  return beste?.vegsystemreferanse?.kortform ?? null;
}
