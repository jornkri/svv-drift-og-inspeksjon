/**
 * Automatisk kartlegging av lag og tabeller i et webkart når VITE_LAYERS_* og tabellene
 * ikke er konfigurert. Lagene kjennes igjen på feltene (uavhengig av store/små bokstaver),
 * med tittelen som reserve. Ren logikk uten ArcGIS-avhengighet.
 */
import type { Fag, FieldMap, Objekt } from "./schema.ts";

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

/** Lag fra BIM-/IFC-eksport (ArcGIS «BIM File»-skjema): GlobalId og Objekttype/ObjectType. */
export function erBimLag(l: LagInfo): boolean {
  return l.type === "layer" && har(l, "globalid") && (har(l, "objekttype") || har(l, "objecttype"));
}

export interface BimRad {
  attrs: Record<string, unknown>;
  lagTittel: string;
}

/** Leser et attributt uavhengig av store/små bokstaver; «-» og tom streng regnes som tomme. */
function les(a: Record<string, unknown>, ...navn: string[]): unknown {
  const lower = new Map(Object.entries(a).map(([k, v]) => [k.toLowerCase(), v]));
  for (const n of navn) {
    const v = lower.get(n.toLowerCase());
    if (v == null) continue;
    if (typeof v === "string" && (v.trim() === "" || v.trim() === "-")) continue;
    return v;
  }
  return null;
}

const tekst = (a: Record<string, unknown>, ...navn: string[]) => {
  const v = les(a, ...navn);
  return v == null ? null : String(v).trim();
};
const tall = (a: Record<string, unknown>, ...navn: string[]) => {
  const v = les(a, ...navn);
  const n = typeof v === "number" ? v : v == null ? NaN : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** «2026-01-27» eller «22.02.2026» → «2026-01-27» */
export function bimDato(v: string | null): string | null {
  if (!v) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const nb = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (nb) return `${nb[3]}-${nb[2]!.padStart(2, "0")}-${nb[1]!.padStart(2, "0")}`;
  return null;
}

/** «400», «MMI400» eller modellfilnavnet «m_f_veg_MMI400» → 400 */
export function bimMmi(...kilder: (string | null)[]): number | null {
  for (const k of kilder) {
    if (!k) continue;
    const m = /^(\d{3})$/.exec(k.trim()) ?? /MMI[ _-]?(\d{3})/i.exec(k);
    if (m) return Number(m[1]);
  }
  return null;
}

const FAG_FRA_FAGMODELL: Record<string, Fag> = { overvann: "VA", va: "VA", vann: "VA", spillvann: "VA", drens: "VA", elektro: "Elektro", veg: "Veg", vei: "Veg" };

/**
 * Gjør BIM-eksport (IFC → ArcGIS) om til appens objektmodell. Rader uten GlobalId
 * (prosjekt/tomt-elementer) utelates (null). Objekt-ID er delmodellen (f.eks. «Stikkrennetrase-003»),
 * med løpenummer når flere objekter deler delmodell.
 */
export function bimTilObjekter(rader: BimRad[]): (Objekt | null)[] {
  const grunn = rader.map(({ attrs: a, lagTittel }) => {
    const guid = tekst(a, "GlobalId");
    if (!guid) return null;
    const delmodell = tekst(a, "Delmodell", "ProsjektinternID", "Name") ?? guid;
    const type = tekst(a, "Objekttype", "ObjectType") ?? "Ukjent";
    const fagmodell = tekst(a, "Fagmodell");
    const fag = (fagmodell && FAG_FRA_FAGMODELL[fagmodell.toLowerCase()]) || fagFraTittel(lagTittel);
    const docName = tekst(a, "DocName");
    const prosjekt = tekst(a, "ProjectName");
    const ut: Objekt = {
      globalid: guid,
      objekt_id: delmodell,
      navn: `${delmodell} – ${type}`,
      fag,
      objekttype: type,
      mmi: bimMmi(tekst(a, "MMI"), docName, lagTittel),
      revisjon: tekst(a, "Revisjonsnummer", "Bokstav"),
      rev_dato: bimDato(tekst(a, "Revisjonsdato")),
      status_inspeksjon: "Ikke inspisert",
      vegreferanse: null,
      kote_min: tall(a, "Z_Min"),
      kote_max: tall(a, "Z_Max"),
      lengde_m: tall(a, "Lengde", "Utbredelse"),
      fagmodell: fagmodell ?? fag,
      modellfil: docName ? `${docName}.ifc` : null,
      modellert_av: tekst(a, "UtarbeidetAv", "Owner", "Organization"),
      prosjekt: prosjekt && !/^default/i.test(prosjekt) ? prosjekt : null,
      ifc_guid: guid,
      ifc_klasse: tekst(a, "ElementType")?.toUpperCase() ?? null,
      lastet_inn: typeof les(a, "DocUpdate") === "number" ? new Date(les(a, "DocUpdate") as number).toISOString() : null,
    };
    const detalj = (tekst(a, "Name", "Objektnavn") ?? "").split("|")[1]?.trim() || null;
    return { o: ut, delmodell, type, detalj, objektId: tekst(a, "ObjectId") ?? guid };
  });

  // Delmodeller med flere objekter får løpenummer (sortert på IFC-id) og et mer presist navn
  const grupper = new Map<string, NonNullable<(typeof grunn)[number]>[]>();
  for (const g of grunn) if (g) grupper.set(g.delmodell, [...(grupper.get(g.delmodell) ?? []), g]);
  for (const [delmodell, liste] of grupper) {
    if (liste.length < 2) continue;
    liste.sort((x, y) => Number(x.objektId) - Number(y.objektId) || x.objektId.localeCompare(y.objektId));
    const typer = new Map<string, number>();
    for (const g of liste) typer.set(g.type, (typer.get(g.type) ?? 0) + 1);
    liste.forEach((g, i) => {
      g.o.objekt_id = `${delmodell}/${i + 1}`;
      if ((typer.get(g.type) ?? 0) > 1 && g.detalj) g.o.navn = `${delmodell} – ${g.detalj}`;
    });
  }
  return grunn.map((g) => g?.o ?? null);
}
