/**
 * MMI-filter bygget på de grunnleggende nivåene i MMI-veilederen
 * (https://www.mmi-veilederen.no/grunnleggende-mmi-nivaer.html), gruppert i faser.
 * Fasefargene er veilederens offisielle og skal ikke endres.
 *
 * Ren logikk uten avhengighet til ArcGIS, slik at den kan enhetstestes.
 */

export type PhaseId =
  | "grunnlag"
  | "konsept"
  | "prinsipp"
  | "detaljert"
  | "utforelse"
  | "som_bygget"
  | "i_drift";

export interface Phase {
  id: PhaseId;
  navn: string;
  /** Nominelle grunnleggende nivåer i fasen (for visning, f.eks. «325–375»). */
  nivaaer: readonly number[];
  /** Klassifiseringsgrenser (inkluderende). Dekker hele 0–600 uten hull. */
  min: number;
  max: number;
  farge: string;
}

export const PHASES: readonly Phase[] = [
  { id: "grunnlag", navn: "Grunnlag", nivaaer: [0, 100], min: 0, max: 124, farge: "#BE2823" },
  { id: "konsept", navn: "Konsept", nivaaer: [125, 150, 175, 200], min: 125, max: 224, farge: "#E69637" },
  { id: "prinsipp", navn: "Prinsipp", nivaaer: [225, 250, 275, 300], min: 225, max: 324, farge: "#FAF050" },
  { id: "detaljert", navn: "Detaljert", nivaaer: [325, 350, 375], min: 325, max: 399, farge: "#B9AF3C" },
  { id: "utforelse", navn: "Utførelse", nivaaer: [400, 425, 450, 475], min: 400, max: 499, farge: "#378246" },
  { id: "som_bygget", navn: "Som bygget", nivaaer: [500], min: 500, max: 599, farge: "#1E46AF" },
  { id: "i_drift", navn: "I drift", nivaaer: [600], min: 600, max: 600, farge: "#9B00CD" },
] as const;

export const ALL_PHASES: readonly PhaseId[] = PHASES.map((p) => p.id);

export const DEFAULT_PHASES: readonly PhaseId[] = ["detaljert", "utforelse", "som_bygget", "i_drift"];

export interface MmiPreset {
  id: string;
  label: string;
  phases: readonly PhaseId[];
}

export const PRESETS: readonly MmiPreset[] = [
  { id: "prosjektering", label: "Prosjektering ≤ 375", phases: ["grunnlag", "konsept", "prinsipp", "detaljert"] },
  { id: "utforelse", label: "Klar for utførelse ≥ 400", phases: ["utforelse", "som_bygget", "i_drift"] },
  { id: "bygget", label: "Som bygget / i drift", phases: ["som_bygget", "i_drift"] },
  { id: "alle", label: "Alle", phases: ALL_PHASES },
];

const pad3 = (n: number) => String(n).padStart(3, "0");

export function getPhase(id: PhaseId): Phase {
  const p = PHASES.find((x) => x.id === id);
  if (!p) throw new Error(`Ukjent MMI-fase: ${id}`);
  return p;
}

/** Fasen et MMI-tall hører til, eller undefined utenfor 0–600. */
export function phaseOf(mmi: number | null | undefined): Phase | undefined {
  if (mmi == null || !Number.isFinite(mmi)) return undefined;
  return PHASES.find((p) => mmi >= p.min && mmi <= p.max);
}

/** Nominelt nivåspenn for en fase, f.eks. «325–375» eller «500». */
export function phaseRange(p: Phase): string {
  const lo = p.nivaaer[0]!;
  const hi = p.nivaaer[p.nivaaer.length - 1]!;
  return lo === hi ? pad3(lo) : `${pad3(lo)}–${pad3(hi)}`;
}

/** Normaliserer et utvalg til fasenes rekkefølge og fjerner duplikater. */
export function normalize(selected: Iterable<PhaseId>): PhaseId[] {
  const s = new Set(selected);
  return ALL_PHASES.filter((id) => s.has(id));
}

/** Grupperer valgte faser i sammenhengende løp (etter fase-indeks). */
export function contiguousRuns(selected: Iterable<PhaseId>): PhaseId[][] {
  const runs: PhaseId[][] = [];
  let current: PhaseId[] = [];
  let lastIdx = -2;
  for (const id of normalize(selected)) {
    const idx = ALL_PHASES.indexOf(id);
    if (idx === lastIdx + 1) current.push(id);
    else {
      if (current.length) runs.push(current);
      current = [id];
    }
    lastIdx = idx;
  }
  if (current.length) runs.push(current);
  return runs;
}

/**
 * SQL-uttrykk for valgte faser. Sammenhengende faser slås sammen til ett intervall.
 * Alle faser gir "1=1" (ingen filtrering), ingen faser gir "1=0".
 */
export function mmiWhere(selected: Iterable<PhaseId>, field = "mmi"): string {
  const sel = normalize(selected);
  if (sel.length === ALL_PHASES.length) return "1=1";
  if (sel.length === 0) return "1=0";
  const parts = contiguousRuns(sel).map((run) => {
    const lo = getPhase(run[0]!).min;
    const hi = getPhase(run[run.length - 1]!).max;
    return lo === hi ? `${field} = ${lo}` : `(${field} >= ${lo} AND ${field} <= ${hi})`;
  });
  return parts.length === 1 ? parts[0]! : `(${parts.join(" OR ")})`;
}

/**
 * Kort etikett for filterknappen: «alle», «ingen», et nivåspenn når utvalget er
 * sammenhengende («325–600», «500»), ellers antall faser («3 faser»).
 */
export function mmiLabel(selected: Iterable<PhaseId>): string {
  const sel = normalize(selected);
  if (sel.length === ALL_PHASES.length) return "alle";
  if (sel.length === 0) return "ingen";
  const runs = contiguousRuns(sel);
  if (runs.length === 1) {
    const first = getPhase(sel[0]!);
    const last = getPhase(sel[sel.length - 1]!);
    const lo = first.nivaaer[0]!;
    const hi = last.nivaaer[last.nivaaer.length - 1]!;
    return lo === hi ? pad3(lo) : `${pad3(lo)}–${pad3(hi)}`;
  }
  return `${sel.length} faser`;
}

export function isSameSelection(a: Iterable<PhaseId>, b: Iterable<PhaseId>): boolean {
  const x = normalize(a);
  const y = normalize(b);
  return x.length === y.length && x.every((id, i) => id === y[i]);
}

export function isDefaultSelection(selected: Iterable<PhaseId>): boolean {
  return isSameSelection(selected, DEFAULT_PHASES);
}

/** Teller objekter per fase fra en liste MMI-verdier. */
export function countByPhase(values: Iterable<number | null | undefined>): Record<PhaseId, number> {
  const counts = Object.fromEntries(ALL_PHASES.map((id) => [id, 0])) as Record<PhaseId, number>;
  for (const v of values) {
    const p = phaseOf(v);
    if (p) counts[p.id]++;
  }
  return counts;
}

/**
 * Relative bredder for fargestripen. Tomme faser får en minstebredde slik at de
 * fortsatt kan klikkes.
 */
export function stripWeights(counts: Record<PhaseId, number>, minShare = 0.04): Record<PhaseId, number> {
  const total = ALL_PHASES.reduce((s, id) => s + counts[id], 0);
  const out = {} as Record<PhaseId, number>;
  for (const id of ALL_PHASES) {
    const share = total > 0 ? counts[id] / total : 1 / ALL_PHASES.length;
    out[id] = Math.max(share, minShare);
  }
  return out;
}

/** Klassegrenser for en ClassBreaksRenderer på mmi-feltet. */
export function classBreaks(): { id: PhaseId; label: string; minValue: number; maxValue: number; color: string }[] {
  return PHASES.map((p) => ({
    id: p.id,
    label: `${p.navn} (${phaseRange(p)})`,
    minValue: p.min,
    maxValue: p.max,
    color: p.farge,
  }));
}

/** «MMI 400 · Utførelse» */
export function mmiBadgeText(mmi: number | null | undefined): string {
  if (mmi == null) return "MMI –";
  const p = phaseOf(mmi);
  return p ? `MMI ${pad3(mmi)} · ${p.navn}` : `MMI ${pad3(mmi)}`;
}

/** Om en fasefarge trenger mørk tekst for kontrast ≥ 4,5:1 (gul/oliven gjør det). */
export function textColorOn(hex: string): "#ffffff" | "#444f55" {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  const contrastWhite = 1.05 / (L + 0.05);
  return contrastWhite >= 4.5 ? "#ffffff" : "#444f55";
}
