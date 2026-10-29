import { describe, expect, it } from "vitest";
import type { Oppgave } from "../../src/data/schema.ts";
import {
  DEFAULT_TASK_FILTER,
  displayStatus,
  dueClass,
  endOfWeek,
  filterTasks,
  mobileFilter,
  sortByDistance,
  sortTasks,
  taskStats,
} from "../../src/tasks/tasks.ts";

// Torsdag 29. oktober 2026
const today = new Date(2026, 9, 29, 10, 0);

const t = (p: Partial<Oppgave>): Oppgave => ({
  oppgave_id: "OPG-1",
  tittel: "Test",
  beskrivelse: null,
  objekt_globalid: "{A}",
  fag: "VA",
  frist: "2026-11-15",
  prioritet: "Middels",
  status: "Ny",
  tildelt: "Kari Nordmann",
  skjema: null,
  ...p,
});

describe("frister", () => {
  it("uka slutter søndag", () => {
    expect(endOfWeek(today)).toBe("2026-11-01");
  });
  it.each([
    ["2026-10-28", "Ny", "over"],
    ["2026-10-29", "Ny", "idag"],
    ["2026-11-01", "Pågår", "uke"],
    ["2026-11-02", "Ny", "senere"],
    ["2026-10-01", "Fullført", "utfort"],
  ] as const)("frist %s med status %s er %s", (frist, status, klasse) => {
    expect(dueClass(t({ frist, status }), today)).toBe(klasse);
  });
  it("åpne oppgaver med passert frist vises som «Over frist»", () => {
    expect(displayStatus(t({ frist: "2026-10-28", status: "Pågår" }), today)).toBe("Over frist");
    expect(displayStatus(t({ frist: "2026-10-28", status: "Fullført" }), today)).toBe("Fullført");
  });
});

describe("nøkkeltall og filtre", () => {
  const tasks = [
    t({ oppgave_id: "1", frist: "2026-10-31", status: "Pågår" }),
    t({ oppgave_id: "2", frist: "2026-10-28" }),
    t({ oppgave_id: "3", frist: "2026-11-20", tildelt: "Ola Hansen", fag: "Elektro" }),
    t({ oppgave_id: "4", frist: "2026-10-20", status: "Fullført" }),
    t({ oppgave_id: "5", frist: "2026-11-05", tildelt: "Ekstern" }),
  ];

  it("teller åpne, denne uka, over frist og fullført", () => {
    expect(taskStats(tasks, today)).toEqual({ apne: 4, forfallerUka: 1, overFrist: 1, fullfort: 1 });
  });

  it("Mine / Teamet / Alle", () => {
    const team = ["Kari Nordmann", "Ola Hansen"];
    const ids = (tab: "mine" | "teamet" | "alle") =>
      filterTasks(tasks, { ...DEFAULT_TASK_FILTER, tab }, "Kari Nordmann", team, today).map((o) => o.oppgave_id);
    expect(ids("mine")).toEqual(["1", "2"]);
    expect(ids("teamet")).toEqual(["1", "2", "3"]);
    expect(ids("alle")).toEqual(["1", "2", "3", "5"]);
  });

  it("filtrerer på fag, status og frist", () => {
    const base = { ...DEFAULT_TASK_FILTER, tab: "alle" as const };
    expect(filterTasks(tasks, { ...base, fag: "Elektro" }, "", [], today).map((o) => o.oppgave_id)).toEqual(["3"]);
    expect(filterTasks(tasks, { ...base, status: "Fullført" }, "", [], today).map((o) => o.oppgave_id)).toEqual(["4"]);
    expect(filterTasks(tasks, { ...base, frist: "over" }, "", [], today).map((o) => o.oppgave_id)).toEqual(["2"]);
    expect(filterTasks(tasks, { ...base, frist: "14d" }, "", [], today).map((o) => o.oppgave_id)).toEqual(["1", "2", "5"]);
  });

  it("sorterer over frist først, deretter frist", () => {
    expect(sortTasks(tasks, today).map((o) => o.oppgave_id)).toEqual(["2", "4", "1", "5", "3"]);
  });

  it("mobil: sorterer etter avstand og filtrerer I dag / Denne uka / Over frist / Utført", () => {
    const d: Record<string, number | null> = { "1": 120, "2": 4, "3": null, "4": 50, "5": 13 };
    expect(sortByDistance(tasks, (o) => d[o.oppgave_id]!).map((o) => o.oppgave_id)).toEqual(["2", "5", "4", "1", "3"]);
    expect(mobileFilter(tasks, "idag", today).map((o) => o.oppgave_id)).toEqual(["2"]);
    expect(mobileFilter(tasks, "uke", today).map((o) => o.oppgave_id)).toEqual(["1", "2"]);
    expect(mobileFilter(tasks, "utfort", today).map((o) => o.oppgave_id)).toEqual(["4"]);
  });
});
