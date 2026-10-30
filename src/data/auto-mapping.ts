/**
 * Automatisk kartlegging av lag og tabeller i et webkart når VITE_LAYERS_* og tabellene
 * ikke er konfigurert. Lagene kjennes igjen på feltene (uavhengig av store/små bokstaver),
 * med tittelen som reserve. Ren logikk uten ArcGIS-avhengighet.
 */
import type { Fag, FieldMap } from "./schema.ts";

export interface LagInfo {
  tittel: string;
  /** "layer" har geometri, "table" har det ikke */
  type: "layer" | "table";
  url: string;
  felt: string[];
}

export interface AutoMapping {
  objektlag: LagInfo[];
  inspeksjon: LagInfo | null;
  oppgave: LagInfo | null;
  dokument: LagInfo | null;
}

const har = (l: LagInfo, ...navn: string[]) => {
  const s = new Set(l.felt.map((f) => f.toLowerCase()));
  return navn.every((n) => s.has(n));
};

export function finnLag(lag: LagInfo[]): AutoMapping {
  const inspeksjon =
    lag.find((l) => har(l, "tilstandsgrad", "objekt_globalid")) ?? lag.find((l) => l.type === "table" && /inspeksjon/i.test(l.tittel)) ?? null;
  const oppgave = lag.find((l) => l !== inspeksjon && har(l, "oppgave_id") && har(l, "status")) ?? lag.find((l) => /oppgave/i.test(l.tittel)) ?? null;
  const dokument =
    lag.find((l) => l !== inspeksjon && l !== oppgave && har(l, "objekt_globalid", "url")) ??
    lag.find((l) => l.type === "table" && /dokument/i.test(l.tittel)) ??
    null;
  const brukt = new Set([inspeksjon, oppgave, dokument]);
  const objektlag = lag.filter((l) => l.type === "layer" && !brukt.has(l) && har(l, "objekt_id"));
  return { objektlag, inspeksjon, oppgave, dokument };
}

/** Fag ut fra lagtittelen, når laget ikke har et fag-felt. */
export function fagFraTittel(tittel: string): Fag {
  if (/\b(va|vann|overvann|drens|stikkrenne|kum|sandfang|ledning|grøft)/i.test(tittel)) return "VA";
  if (/(elektro|belysning|lys|kabel|skap|strøm)/i.test(tittel)) return "Elektro";
  return "Veg";
}

/**
 * Tilpasser en feltmapping til feltnavnene et lag faktisk har (f.eks. «OBJEKT_ID» i stedet
 * for «objekt_id»). Felt som ikke finnes beholder navnet fra mappingen.
 */
export function tilpassFelt<T>(map: FieldMap<T>, felt: string[]): FieldMap<T> {
  const etter = new Map(felt.map((f) => [f.toLowerCase(), f]));
  const ut = { ...map };
  for (const k of Object.keys(ut) as (keyof T)[]) {
    const faktisk = etter.get(String(ut[k]).toLowerCase());
    if (faktisk) ut[k] = faktisk;
  }
  return ut;
}

/** Logiske felt i mappingen som laget mangler. */
export function manglendeFelt<T>(map: FieldMap<T>, felt: string[]): (keyof T & string)[] {
  const s = new Set(felt.map((f) => f.toLowerCase()));
  return (Object.keys(map) as (keyof T & string)[]).filter((k) => !s.has(String(map[k]).toLowerCase()));
}
