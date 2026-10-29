import type { ObjektStat } from "../data/DataService.ts";
import { ALL_PHASES, phaseOf, type PhaseId } from "./mmi.ts";
import { matches, typeKey, type FilterState } from "./filters.ts";

export interface StatCounts {
  total: number;
  shown: number;
  /** Per fase med alle andre filtre aktive (bestemmer stripens bredder og listetall) */
  perPhase: Record<PhaseId, number>;
  perFag: Record<string, number>;
  perType: Record<string, number>;
}

/** Tellinger for filter og lagpanel, beregnet fra objektstatistikken. */
export function computeCounts(stats: ObjektStat[], f: FilterState): StatCounts {
  const perPhase = Object.fromEntries(ALL_PHASES.map((id) => [id, 0])) as Record<PhaseId, number>;
  const perFag: Record<string, number> = {};
  const perType: Record<string, number> = {};
  const allPhases = { ...f, phases: [...ALL_PHASES] };
  let shown = 0;
  for (const s of stats) {
    perFag[s.fag] = (perFag[s.fag] ?? 0) + 1;
    const k = typeKey(s.fag, s.objekttype);
    perType[k] = (perType[k] ?? 0) + 1;
    if (matches(allPhases, s)) {
      const p = phaseOf(s.mmi);
      if (p) perPhase[p.id]++;
    }
    if (matches(f, s)) shown++;
  }
  return { total: stats.length, shown, perPhase, perFag, perType };
}

/** Objekttyper per fag i fast rekkefølge (for lagpanelet). */
export function typesByFag(stats: ObjektStat[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of stats) {
    const list = (out[s.fag] ??= []);
    if (!list.includes(s.objekttype)) list.push(s.objekttype);
  }
  return out;
}
