import type { ObjektStat } from "../data/DataService.ts";
import { FAG, STATUS_INSPEKSJON, type Fag, type Inspeksjon, type StatusInspeksjon } from "../data/schema.ts";
import { ALL_PHASES, phaseOf, type PhaseId } from "../filters/mmi.ts";
import { driftskrav, nesteInspeksjon } from "../handbok/r610.ts";

/** Siste inspeksjon per objekt (globalid). */
export function latestPerObject(insp: Inspeksjon[]): Map<string, Inspeksjon> {
  const m = new Map<string, Inspeksjon>();
  for (const i of insp) {
    const cur = m.get(i.objekt_globalid);
    if (!cur || i.tidspunkt > cur.tidspunkt) m.set(i.objekt_globalid, i);
  }
  return m;
}

export function statusPerFag(stats: ObjektStat[]): Record<Fag, Record<StatusInspeksjon, number>> {
  const out = Object.fromEntries(FAG.map((f) => [f, Object.fromEntries(STATUS_INSPEKSJON.map((s) => [s, 0]))])) as Record<
    Fag,
    Record<StatusInspeksjon, number>
  >;
  for (const s of stats) out[s.fag][s.status_inspeksjon]++;
  return out;
}

export function phasePerFag(stats: ObjektStat[]): Record<Fag, Record<PhaseId, number>> {
  const out = Object.fromEntries(FAG.map((f) => [f, Object.fromEntries(ALL_PHASES.map((p) => [p, 0]))])) as Record<Fag, Record<PhaseId, number>>;
  for (const s of stats) {
    const p = phaseOf(s.mmi);
    if (p) out[s.fag][p.id]++;
  }
  return out;
}

/** Fordeling av tilstandsgrad i siste inspeksjon per objekt: [TG0, TG1, TG2, TG3]. */
export function tgFordeling(latest: Iterable<Inspeksjon>): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (const i of latest) out[i.tilstandsgrad]++;
  return out;
}

const MND = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

/** Antall inspeksjoner per måned de siste `months` månedene (eldste først, inkludert inneværende). */
export function perMaaned(insp: Inspeksjon[], today: Date, months = 12): { key: string; label: string; n: number }[] {
  const out: { key: string; label: string; n: number }[] = [];
  for (let k = months - 1; k >= 0; k--) {
    const d = new Date(today.getFullYear(), today.getMonth() - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: `${MND[d.getMonth()]}${d.getMonth() === 0 || k === months - 1 ? ` ${String(d.getFullYear()).slice(2)}` : ""}`, n: 0 });
  }
  const idx = new Map(out.map((o, i) => [o.key, i]));
  for (const i of insp) {
    const d = new Date(i.tidspunkt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const j = idx.get(key);
    if (j != null) out[j]!.n++;
  }
  return out;
}

/** Andel objekter som er inspisert de siste 12 månedene. */
export function andelInspisertSiste12(stats: ObjektStat[], latest: Map<string, Inspeksjon>, today: Date): number {
  if (!stats.length) return 0;
  const grense = new Date(today);
  grense.setFullYear(grense.getFullYear() - 1);
  const g = grense.toISOString();
  const n = stats.filter((s) => (latest.get(s.globalid)?.tidspunkt ?? "") >= g).length;
  return n / stats.length;
}

export interface AvvikRad {
  globalid: string;
  fag: Fag;
  objekttype: string;
  siste: Inspeksjon | null;
}

/** Objekter med avvik, alvorligste og nyeste først. */
export function avviksliste(stats: ObjektStat[], latest: Map<string, Inspeksjon>): AvvikRad[] {
  return stats
    .filter((s) => s.status_inspeksjon === "Avvik")
    .map((s) => ({ globalid: s.globalid, fag: s.fag, objekttype: s.objekttype, siste: latest.get(s.globalid) ?? null }))
    .sort(
      (a, b) =>
        (b.siste?.tilstandsgrad ?? 0) - (a.siste?.tilstandsgrad ?? 0) || (b.siste?.tidspunkt ?? "").localeCompare(a.siste?.tidspunkt ?? ""),
    );
}

export type FristGruppe = "ok" | "snart" | "aldri" | "forfalt";

/**
 * Inspeksjonsfrist per objekt etter intervallene i R610:2025 (via handbok/r610.ts).
 * Objekttyper uten fastsatt intervall telles ikke.
 */
export function fristerPerFag(
  stats: ObjektStat[],
  latest: Map<string, Inspeksjon>,
  today: Date,
): { perFag: Record<Fag, Record<FristGruppe, number>>; forfalt: { globalid: string; fag: Fag; frist: Date; siste: Inspeksjon }[] } {
  const perFag = Object.fromEntries(FAG.map((f) => [f, { ok: 0, snart: 0, aldri: 0, forfalt: 0 }])) as Record<Fag, Record<FristGruppe, number>>;
  const forfalt: { globalid: string; fag: Fag; frist: Date; siste: Inspeksjon }[] = [];
  for (const s of stats) {
    const siste = latest.get(s.globalid) ?? null;
    const krav = driftskrav({ objekttype: s.objekttype, navn: siste?.obj_navn ?? "" });
    const n = nesteInspeksjon(siste?.tidspunkt ?? null, krav?.intervallMnd ?? null, today);
    if (n.status === "ukjent") continue;
    perFag[s.fag][n.status]++;
    if (n.status === "forfalt" && siste && n.frist) forfalt.push({ globalid: s.globalid, fag: s.fag, frist: n.frist, siste });
  }
  forfalt.sort((a, b) => a.frist.getTime() - b.frist.getTime());
  return { perFag, forfalt };
}
