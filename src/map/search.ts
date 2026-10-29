import type { AppConfig } from "../config.ts";

export interface StedTreff {
  kilde: "vegreferanse" | "adresse";
  tekst: string;
  undertekst: string;
  x: number;
  y: number;
  z?: number;
}

/**
 * Tolker en vegsystemreferanse som «EV45 S1D1 m2340», «E45 S2D1 m10205» eller
 * «fv100s1d1». Returnerer NVDB-format uten mellomrom (f.eks. «EV45S1D1m2340»), eller null.
 */
export function parseVegref(text: string): string | null {
  const t = text.trim().replace(/\s+/g, "");
  const m = /^([ERFKPS])([VAPF])?(\d{1,5})((?:S\d+)(?:D\d+)?(?:m\d+(?:[.,]\d+)?)?)?$/i.exec(t);
  if (!m) return null;
  const [, kat, fase, nr, rest] = m;
  const strekning = (rest ?? "").replace(/s/i, "S").replace(/d/i, "D").replace(/M/, "m").replace(",", ".");
  return `${kat!.toUpperCase()}${(fase ?? "V").toUpperCase()}${nr}${strekning}`;
}

/** «EV45S1D1m2340» → «EV45 S1D1 m2340» */
export function prettyVegref(ref: string): string {
  return ref.replace(/^([A-Z]{2}\d+)(S\d+(?:D\d+)?)?(m[\d.]+)?$/, (_a, v, s, m) => [v, s, m].filter(Boolean).join(" "));
}

function parsePointWkt(wkt: string): { x: number; y: number; z?: number } | null {
  const m = /POINT\s*Z?\s*\(\s*([\d.-]+)\s+([\d.-]+)(?:\s+([\d.-]+))?\s*\)/i.exec(wkt);
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]), ...(m[3] ? { z: Number(m[3]) } : {}) };
}

/** Slår opp en vegsystemreferanse i NVDB API Les (posisjon i UTM33 + NN2000, srid 5973). */
export async function lookupVegref(cfg: AppConfig, ref: string, signal?: AbortSignal): Promise<StedTreff | null> {
  const url = `${cfg.nvdb.baseUrl}/vegnett/api/v4/veg?vegsystemreferanse=${encodeURIComponent(ref)}&srid=5973`;
  const r = await fetch(url, { headers: { Accept: "application/json", "X-Client": cfg.nvdb.client }, ...(signal ? { signal } : {}) });
  if (!r.ok) return null;
  const j = (await r.json()) as { vegsystemreferanse?: { kortform?: string }; geometri?: { wkt?: string }; kommune?: number };
  const p = j.geometri?.wkt ? parsePointWkt(j.geometri.wkt) : null;
  if (!p) return null;
  return {
    kilde: "vegreferanse",
    tekst: j.vegsystemreferanse?.kortform ?? prettyVegref(ref),
    undertekst: "Gå til punkt på vegnettet (NVDB)",
    ...p,
  };
}

interface AdresseHit {
  kilde: string;
  x: number;
  y: number;
  gatenavn?: string;
  husnr?: string | number;
  husbokstav?: string;
  postnr?: string;
  poststed?: string;
  stedsnavn?: string;
  kommunenavn?: string;
}

/** Adressesøk i Geodata Online (koordinater i UTM33 EUREF89). Krever token. */
export async function searchAddress(cfg: AppConfig, text: string, token: string, signal?: AbortSignal): Promise<StedTreff[]> {
  const url = `${cfg.gdo.adresseSokUrl}?query=${encodeURIComponent(text)}&maxsize=5&token=${encodeURIComponent(token)}`;
  const r = await fetch(url, signal ? { signal } : {});
  if (!r.ok) return [];
  const j = (await r.json()) as { hits?: AdresseHit[] };
  return (j.hits ?? []).map((h) => {
    const tekst =
      h.kilde === "adresse"
        ? `${h.gatenavn ?? ""} ${h.husnr ?? ""}${h.husbokstav ?? ""}`.trim()
        : h.stedsnavn ?? h.poststed ?? h.gatenavn ?? text;
    const under = [h.postnr && h.poststed ? `${h.postnr} ${h.poststed}` : h.poststed, h.kommunenavn].filter(Boolean).join(" · ");
    return { kilde: "adresse" as const, tekst, undertekst: under || h.kilde, x: h.x, y: h.y };
  });
}

/** NVDB vegnett i et kartutsnitt (for referanselaget). */
export async function fetchVegnett(
  cfg: AppConfig,
  bbox: [number, number, number, number],
  signal?: AbortSignal,
): Promise<{ kortform: string; paths: number[][] }[]> {
  const out: { kortform: string; paths: number[][] }[] = [];
  let url: string | null =
    `${cfg.nvdb.baseUrl}/vegnett/api/v4/veglenkesekvenser/segmentert?kartutsnitt=${bbox.map((v) => Math.round(v)).join(",")}&srid=5973&antall=500&vegsystemreferanse=E,R,F`;
  for (let page = 0; url && page < 6; page++) {
    const r: Response = await fetch(url, { headers: { Accept: "application/json", "X-Client": cfg.nvdb.client }, ...(signal ? { signal } : {}) });
    if (!r.ok) break;
    const j = (await r.json()) as {
      objekter?: { vegsystemreferanse?: { kortform?: string }; geometri?: { wkt?: string } }[];
      metadata?: { returnert?: number; neste?: { href?: string } };
    };
    for (const o of j.objekter ?? []) {
      const wkt = o.geometri?.wkt ?? "";
      const m = /LINESTRING\s*Z?\s*\((.*)\)/i.exec(wkt);
      if (!m) continue;
      const paths = m[1]!.split(",").map((p) => p.trim().split(/\s+/).slice(0, 2).map(Number));
      out.push({ kortform: o.vegsystemreferanse?.kortform ?? "", paths });
    }
    url = (j.metadata?.returnert ?? 0) > 0 ? j.metadata?.neste?.href ?? null : null;
  }
  return out;
}
