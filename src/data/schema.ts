/**
 * Datamodell for Drift og inspeksjon.
 *
 * Feltnavnene her er de LOGISKE navnene appen bruker. Navnene i SVVs ekte tjenester
 * kan avvike; de mappes i config (fieldMaps) og oversettes med fromAttributes/toAttributes.
 */

export type Fag = "VA" | "Elektro" | "Veg";
export const FAG: readonly Fag[] = ["VA", "Elektro", "Veg"];

export type StatusInspeksjon = "OK" | "Avvik" | "Ikke inspisert";
export const STATUS_INSPEKSJON: readonly StatusInspeksjon[] = ["OK", "Avvik", "Ikke inspisert"];

export interface Objekt {
  globalid: string;
  objekt_id: string;
  navn: string;
  fag: Fag;
  objekttype: string;
  mmi: number | null;
  revisjon: string | null;
  /** ISO-dato */
  rev_dato: string | null;
  status_inspeksjon: StatusInspeksjon;
  vegreferanse: string | null;
  kote_min: number | null;
  kote_max: number | null;
  lengde_m: number | null;
  fagmodell: string | null;
  modellfil: string | null;
  modellert_av: string | null;
  prosjekt: string | null;
  ifc_guid: string | null;
  ifc_klasse: string | null;
  /** ISO-tidspunkt */
  lastet_inn: string | null;
}

export type DokumentType = "Tegning" | "Datablad" | "FDV";

export interface Dokument {
  objekt_globalid: string;
  tittel: string;
  type: DokumentType;
  revisjon: string | null;
  url: string;
}

export type Tilstandsgrad = 0 | 1 | 2 | 3;

export const TILSTANDSGRADER: readonly { tg: Tilstandsgrad; navn: string }[] = [
  { tg: 0, navn: "Ingen" },
  { tg: 1, navn: "Små" },
  { tg: 2, navn: "Middels" },
  { tg: 3, navn: "Store" },
];

export const AVVIKSTYPER: readonly string[] = [
  "Ingen avvik",
  "Erosjon / utvasking",
  "Tilstopping / sedimentasjon",
  "Skade på konstruksjon",
  "Setning / deformasjon",
  "Korrosjon",
  "Lekkasje",
  "Mangler ved merking",
  "Annet",
];

export interface Inspeksjon {
  globalid?: string;
  objekt_globalid: string;
  tilstandsgrad: Tilstandsgrad;
  avvikstype: string;
  tiltak_behov: "ja" | "nei";
  kommentar: string;
  inspektor: string;
  /** ISO-tidspunkt */
  tidspunkt: string;
  pos_noyaktighet_m: number | null;
  pos_x: number | null;
  pos_y: number | null;
  oppgave_id: string | null;
  // Autoutfylte kopier av objektfeltene
  obj_objekt_id: string;
  obj_navn: string;
  obj_fag: Fag;
  obj_fagmodell: string | null;
  obj_vegreferanse: string | null;
  obj_lengde_m: number | null;
  obj_kote_min: number | null;
  obj_kote_max: number | null;
  /** Antall bildevedlegg (beregnet, lagres ikke) */
  antall_bilder?: number;
}

export type Prioritet = "Høy" | "Middels" | "Lav";
export type OppgaveStatus = "Ny" | "Pågår" | "Klar for kontroll" | "Fullført";
export const OPPGAVE_STATUSER: readonly OppgaveStatus[] = ["Ny", "Pågår", "Klar for kontroll", "Fullført"];

export interface Oppgave {
  oppgave_id: string;
  tittel: string;
  beskrivelse: string | null;
  objekt_globalid: string;
  fag: Fag;
  /** ISO-dato */
  frist: string;
  prioritet: Prioritet;
  status: OppgaveStatus;
  tildelt: string;
  skjema: string | null;
}

export interface LoggPost {
  tidspunkt: string;
  tekst: string;
}

export interface HistorikkPost {
  tidspunkt: string;
  tekst: string;
}

// ---------------------------------------------------------------------------
// Feltmapping
// ---------------------------------------------------------------------------

export type FieldMap<T> = { [K in keyof T]-?: string };

export const OBJEKT_FIELDS: FieldMap<Objekt> = {
  globalid: "globalid",
  objekt_id: "objekt_id",
  navn: "navn",
  fag: "fag",
  objekttype: "objekttype",
  mmi: "mmi",
  revisjon: "revisjon",
  rev_dato: "rev_dato",
  status_inspeksjon: "status_inspeksjon",
  vegreferanse: "vegreferanse",
  kote_min: "kote_min",
  kote_max: "kote_max",
  lengde_m: "lengde_m",
  fagmodell: "fagmodell",
  modellfil: "modellfil",
  modellert_av: "modellert_av",
  prosjekt: "prosjekt",
  ifc_guid: "ifc_guid",
  ifc_klasse: "ifc_klasse",
  lastet_inn: "lastet_inn",
};

export const DOKUMENT_FIELDS: FieldMap<Dokument> = {
  objekt_globalid: "objekt_globalid",
  tittel: "tittel",
  type: "type",
  revisjon: "revisjon",
  url: "url",
};

export const INSPEKSJON_FIELDS: FieldMap<Inspeksjon> = {
  globalid: "globalid",
  objekt_globalid: "objekt_globalid",
  tilstandsgrad: "tilstandsgrad",
  avvikstype: "avvikstype",
  tiltak_behov: "tiltak_behov",
  kommentar: "kommentar",
  inspektor: "inspektor",
  tidspunkt: "tidspunkt",
  pos_noyaktighet_m: "pos_noyaktighet_m",
  pos_x: "pos_x",
  pos_y: "pos_y",
  oppgave_id: "oppgave_id",
  obj_objekt_id: "obj_objekt_id",
  obj_navn: "obj_navn",
  obj_fag: "obj_fag",
  obj_fagmodell: "obj_fagmodell",
  obj_vegreferanse: "obj_vegreferanse",
  obj_lengde_m: "obj_lengde_m",
  obj_kote_min: "obj_kote_min",
  obj_kote_max: "obj_kote_max",
  antall_bilder: "antall_bilder",
};

export const OPPGAVE_FIELDS: FieldMap<Oppgave> = {
  oppgave_id: "oppgave_id",
  tittel: "tittel",
  beskrivelse: "beskrivelse",
  objekt_globalid: "objekt_globalid",
  fag: "fag",
  frist: "frist",
  prioritet: "prioritet",
  status: "status",
  tildelt: "tildelt",
  skjema: "skjema",
};

/** Logiske felt som er datofelt (epoch ms i tjenestene, ISO-streng i appen). */
export const DATE_FIELDS = new Set(["rev_dato", "lastet_inn", "tidspunkt", "frist"]);

/** Leser attributter fra en tjeneste til en logisk post via feltmappingen. */
export function fromAttributes<T>(attrs: Record<string, unknown>, map: FieldMap<T>): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(map) as (keyof T & string)[]) {
    const raw = attrs[map[key]];
    if (DATE_FIELDS.has(key) && typeof raw === "number") out[key] = new Date(raw).toISOString();
    else out[key] = raw === undefined ? null : raw;
  }
  return out as T;
}

/** Skriver en logisk post til tjenestens attributter. Felt som er undefined utelates. */
export function toAttributes<T>(rec: Partial<T>, map: FieldMap<T>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(rec) as (keyof T & string)[]) {
    const field = map[key];
    const v = rec[key];
    if (field === undefined || v === undefined) continue;
    out[field] = DATE_FIELDS.has(key) && typeof v === "string" ? Date.parse(v) : v;
  }
  return out;
}

/** Escaper en strengverdi for bruk i et SQL where-uttrykk. */
export function sqlString(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}
