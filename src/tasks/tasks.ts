import type { Fag, Oppgave, OppgaveStatus } from "../data/schema.ts";

/** Lokal dato som «YYYY-MM-DD». */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Søndag i inneværende uke (norsk uke: mandag–søndag). */
export function endOfWeek(today: Date): string {
  const d = new Date(today);
  const dow = (d.getDay() + 6) % 7; // 0 = mandag
  d.setDate(d.getDate() + (6 - dow));
  return isoDay(d);
}

export const isOpen = (o: Pick<Oppgave, "status">) => o.status !== "Fullført";

export type FristKlasse = "utfort" | "over" | "idag" | "uke" | "senere";

export function dueClass(o: Pick<Oppgave, "status" | "frist">, today: Date): FristKlasse {
  if (!isOpen(o)) return "utfort";
  const t = isoDay(today);
  const f = o.frist.slice(0, 10);
  if (f < t) return "over";
  if (f === t) return "idag";
  if (f <= endOfWeek(today)) return "uke";
  return "senere";
}

export type VisningsStatus = OppgaveStatus | "Over frist";

/** Status for visning: åpne oppgaver med passert frist vises som «Over frist». */
export function displayStatus(o: Pick<Oppgave, "status" | "frist">, today: Date): VisningsStatus {
  return dueClass(o, today) === "over" ? "Over frist" : o.status;
}

export interface TaskStats {
  apne: number;
  forfallerUka: number;
  overFrist: number;
  fullfort: number;
}

export function taskStats(tasks: Pick<Oppgave, "status" | "frist">[], today: Date): TaskStats {
  const s: TaskStats = { apne: 0, forfallerUka: 0, overFrist: 0, fullfort: 0 };
  for (const o of tasks) {
    const c = dueClass(o, today);
    if (c === "utfort") s.fullfort++;
    else {
      s.apne++;
      if (c === "over") s.overFrist++;
      else if (c === "idag" || c === "uke") s.forfallerUka++;
    }
  }
  return s;
}

export type TaskTab = "mine" | "teamet" | "alle";
export type FristFilter = "alle" | "over" | "uke" | "14d";
export type StatusFilter = "apne" | "alle" | OppgaveStatus;

export interface TaskFilter {
  tab: TaskTab;
  fag: Fag | "Alle";
  status: StatusFilter;
  frist: FristFilter;
}

export const DEFAULT_TASK_FILTER: TaskFilter = { tab: "mine", fag: "Alle", status: "apne", frist: "alle" };

export function filterTasks<T extends Oppgave>(tasks: T[], f: TaskFilter, user: string, team: string[], today: Date): T[] {
  const in14 = new Date(today);
  in14.setDate(in14.getDate() + 14);
  return tasks.filter((o) => {
    if (f.tab === "mine" && o.tildelt !== user) return false;
    if (f.tab === "teamet" && !team.includes(o.tildelt)) return false;
    if (f.fag !== "Alle" && o.fag !== f.fag) return false;
    if (f.status === "apne" && !isOpen(o)) return false;
    if (f.status !== "apne" && f.status !== "alle" && o.status !== f.status) return false;
    const c = dueClass(o, today);
    if (f.frist === "over" && c !== "over") return false;
    if (f.frist === "uke" && c !== "idag" && c !== "uke") return false;
    if (f.frist === "14d" && (c === "utfort" || o.frist.slice(0, 10) > isoDay(in14))) return false;
    return true;
  });
}

const PRIO = { Høy: 0, Middels: 1, Lav: 2 } as const;

/** Standard sortering i tabellen: over frist først, så frist, så prioritet. */
export function sortTasks<T extends Oppgave>(tasks: T[], today: Date): T[] {
  return [...tasks].sort((a, b) => {
    const oa = dueClass(a, today) === "over" ? 0 : 1;
    const ob = dueClass(b, today) === "over" ? 0 : 1;
    return oa - ob || a.frist.localeCompare(b.frist) || PRIO[a.prioritet] - PRIO[b.prioritet];
  });
}

/** Mobil: sortert etter avstand fra brukeren (ukjent avstand sist). */
export function sortByDistance<T extends Oppgave>(tasks: T[], distance: (o: T) => number | null): T[] {
  return [...tasks]
    .map((o) => ({ o, d: distance(o) }))
    .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || a.o.frist.localeCompare(b.o.frist))
    .map((x) => x.o);
}

export type MobilFilter = "idag" | "uke" | "over" | "utfort";

export function mobileFilter<T extends Oppgave>(tasks: T[], f: MobilFilter, today: Date): T[] {
  return tasks.filter((o) => {
    const c = dueClass(o, today);
    if (f === "utfort") return c === "utfort";
    if (f === "over") return c === "over";
    if (f === "idag") return c === "idag" || c === "over";
    return c === "idag" || c === "uke" || c === "over";
  });
}
