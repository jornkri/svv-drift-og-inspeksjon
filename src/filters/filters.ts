import { sqlString, type Fag, type FieldMap, type Objekt, type StatusInspeksjon } from "../data/schema.ts";
import { ALL_PHASES, DEFAULT_PHASES, isDefaultSelection, mmiWhere, phaseOf, type PhaseId } from "./mmi.ts";

export interface FilterState {
  fag: Fag | "Alle";
  phases: PhaseId[];
  inspeksjon: StatusInspeksjon | "Alle";
  /** Objekttyper slått av i lagpanelet, som nøkkel "Fag|Objekttype". */
  skjulteTyper: string[];
  revisjon: string;
  modellfil: string;
  /** ISO-dato (YYYY-MM-DD) for revisjonsdato */
  datoFra: string;
  datoTil: string;
}

export const DEFAULT_FILTERS: FilterState = {
  fag: "Alle",
  phases: [...DEFAULT_PHASES],
  inspeksjon: "Alle",
  skjulteTyper: [],
  revisjon: "",
  modellfil: "",
  datoFra: "",
  datoTil: "",
};

export const typeKey = (fag: Fag, objekttype: string) => `${fag}|${objekttype}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Uttrykk for «+ Filter»-feltene (revisjon, modellfil, dato). */
export function extraWhere(f: FilterState, fields: FieldMap<Objekt>): string[] {
  const parts: string[] = [];
  if (f.revisjon.trim()) parts.push(`${fields.revisjon} = ${sqlString(f.revisjon.trim())}`);
  if (f.modellfil.trim()) parts.push(`UPPER(${fields.modellfil}) LIKE ${sqlString(`%${f.modellfil.trim().toUpperCase()}%`)}`);
  if (DATE_RE.test(f.datoFra)) parts.push(`${fields.rev_dato} >= DATE ${sqlString(f.datoFra)}`);
  if (DATE_RE.test(f.datoTil)) parts.push(`${fields.rev_dato} <= DATE ${sqlString(f.datoTil)}`);
  return parts;
}

/**
 * Kombinert where-uttrykk for et objektlag med gitt fag.
 * Fag, MMI, inspeksjonsstatus, lagpanelets typer og ekstrafiltre kombineres med AND.
 */
export function buildWhere(f: FilterState, fields: FieldMap<Objekt>, layerFag: Fag): string {
  if (f.fag !== "Alle" && f.fag !== layerFag) return "1=0";
  const parts: string[] = [];
  const mmi = mmiWhere(f.phases, fields.mmi);
  if (mmi === "1=0") return "1=0";
  if (mmi !== "1=1") parts.push(mmi);
  if (f.inspeksjon !== "Alle") parts.push(`${fields.status_inspeksjon} = ${sqlString(f.inspeksjon)}`);
  const hidden = f.skjulteTyper
    .filter((k) => k.startsWith(`${layerFag}|`))
    .map((k) => k.slice(layerFag.length + 1));
  if (hidden.length) parts.push(`${fields.objekttype} NOT IN (${hidden.map(sqlString).join(", ")})`);
  parts.push(...extraWhere(f, fields));
  return parts.length ? parts.join(" AND ") : "1=1";
}

export function hasExtra(f: FilterState): boolean {
  return Boolean(f.revisjon.trim() || f.modellfil.trim() || f.datoFra || f.datoTil);
}

export function extraCount(f: FilterState): number {
  return [f.revisjon.trim(), f.modellfil.trim(), f.datoFra || f.datoTil].filter(Boolean).length;
}

/** Om noe avviker fra standardfilteret (styrer «Nullstill»). */
export function isDirty(f: FilterState): boolean {
  return (
    f.fag !== "Alle" ||
    !isDefaultSelection(f.phases) ||
    f.inspeksjon !== "Alle" ||
    f.skjulteTyper.length > 0 ||
    hasExtra(f)
  );
}

/** Evaluerer filteret mot en post i minnet (brukes til telling og mobil-lister). */
export function matches(f: FilterState, o: Pick<Objekt, "fag" | "mmi" | "status_inspeksjon" | "objekttype" | "revisjon" | "modellfil" | "rev_dato">): boolean {
  if (f.fag !== "Alle" && f.fag !== o.fag) return false;
  const sel = new Set(f.phases);
  if (sel.size < ALL_PHASES.length) {
    // phaseOf bruker de samme klassegrensene som mmiWhere
    const p = phaseOf(o.mmi);
    if (!p || !sel.has(p.id)) return false;
  }
  if (f.inspeksjon !== "Alle" && f.inspeksjon !== o.status_inspeksjon) return false;
  if (f.skjulteTyper.includes(typeKey(o.fag, o.objekttype))) return false;
  if (f.revisjon.trim() && o.revisjon !== f.revisjon.trim()) return false;
  if (f.modellfil.trim() && !(o.modellfil ?? "").toUpperCase().includes(f.modellfil.trim().toUpperCase())) return false;
  const d = o.rev_dato?.slice(0, 10) ?? "";
  if (DATE_RE.test(f.datoFra) && (!d || d < f.datoFra)) return false;
  if (DATE_RE.test(f.datoTil) && (!d || d > f.datoTil)) return false;
  return true;
}
