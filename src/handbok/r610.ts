import data from "./handboker.json";
import type { Objekt } from "../data/schema.ts";

/**
 * Fagkunnskap fra Statens vegvesens håndbøker (hovedsakelig R610:2025 Standard for drift og
 * vedlikehold av riksveger). Kildegrunnlaget ligger i handboker.json (kopi av docs/research/handboker.json),
 * der hvert punkt er merket «verifisert» (lest i primærkilden) eller «usikker». Appen bruker bare
 * verifiserte punkter.
 */

export interface Kildepunkt {
  tekst: string;
  kilde: string;
  punkt?: string;
}

export interface Driftskrav {
  /** Nøkkel i håndbokdataene, f.eks. «Stikkrenne» */
  type: string;
  intervallMnd: number | null;
  intervallTekst: string;
  intervallKilde: string;
  sjekkpunkter: Kildepunkt[];
  typiskeAvvik: Kildepunkt[];
  tiltak: Kildepunkt[];
  funksjonskrav: Kildepunkt[];
}

type RaaPunkt = { tekst: string; kilde: string; punkt?: string; status: string };
type RaaType = {
  funksjonskrav?: RaaPunkt[];
  inspeksjonsintervall?: { tekst: string; maaneder: number | null; kilde: string; punkt?: string; status: string };
  sjekkpunkter?: RaaPunkt[];
  typiske_avvik?: RaaPunkt[];
  tiltak?: RaaPunkt[];
};

const typer = data.objekttyper as unknown as Record<string, RaaType>;
const verifisert = (l: RaaPunkt[] | undefined): Kildepunkt[] =>
  (l ?? []).filter((p) => p.status === "verifisert").map((p) => ({ tekst: p.tekst, kilde: p.kilde, ...(p.punkt ? { punkt: p.punkt } : {}) }));

export const KILDER = data.kilder as { id: string; tittel: string; utgave: string; url: string }[];

/** Objekttypene i datamodellen koblet til håndbokens objekttyper. */
export function handbokType(o: Pick<Objekt, "objekttype" | "navn">): string | null {
  const t = o.objekttype;
  if (t === "Ledningsgrøft") return /stikkrenne/i.test(o.navn) ? "Stikkrenne" : "Overvannsledning";
  return t in typer ? t : null;
}

export function driftskrav(o: Pick<Objekt, "objekttype" | "navn">): Driftskrav | null {
  const type = handbokType(o);
  const r = type ? typer[type] : undefined;
  if (!type || !r) return null;
  const iv = r.inspeksjonsintervall;
  const ok = iv?.status === "verifisert";
  return {
    type,
    intervallMnd: ok ? iv!.maaneder : null,
    intervallTekst: ok ? iv!.tekst : "Ikke fastsatt i kildegrunnlaget.",
    intervallKilde: ok ? `${iv!.kilde} ${iv!.punkt ?? ""}`.trim() : "",
    sjekkpunkter: verifisert(r.sjekkpunkter),
    typiskeAvvik: verifisert(r.typiske_avvik),
    tiltak: verifisert(r.tiltak),
    funksjonskrav: verifisert(r.funksjonskrav),
  };
}

/** Kort tekst for intervallet, f.eks. «hver 12. måned» eller «hvert 5. år». */
export function intervallKort(mnd: number | null): string {
  if (mnd == null) return "ikke fastsatt";
  if (mnd % 12 === 0 && mnd >= 24) return `hvert ${mnd / 12}. år`;
  return `hver ${mnd}. måned`;
}

export function leggTilMaaneder(iso: string, mnd: number): Date {
  const d = new Date(iso);
  const dag = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + mnd);
  const sisteDag = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dag, sisteDag));
  return d;
}

export type FristStatus = "forfalt" | "snart" | "ok" | "aldri" | "ukjent";

/** Neste inspeksjonsfrist ut fra siste inspeksjon og intervall. «Snart» = innen 30 dager. */
export function nesteInspeksjon(
  sisteIso: string | null,
  intervallMnd: number | null,
  idag: Date,
): { frist: Date | null; status: FristStatus; dagerIgjen: number | null } {
  if (intervallMnd == null) return { frist: null, status: "ukjent", dagerIgjen: null };
  if (!sisteIso) return { frist: null, status: "aldri", dagerIgjen: null };
  const frist = leggTilMaaneder(sisteIso, intervallMnd);
  const dager = Math.floor((frist.getTime() - idag.getTime()) / 86_400_000);
  return { frist, status: dager < 0 ? "forfalt" : dager <= 30 ? "snart" : "ok", dagerIgjen: dager };
}

export interface Konsekvensgrad {
  kg: 0 | 1 | 2 | 3;
  navn: string;
  beskrivelse: string;
  /** Tiltakstid i dager for ÅDT 0–3000 og over 3000 (null = ikke angitt) */
  dager: [number | null, number | null];
  kilde: string;
}

const tilDager = (s: string | null): number | null => {
  if (!s) return null;
  const m = /(\d+)\s*(dag|uke)/i.exec(s);
  if (!m) return null;
  return Number(m[1]) * (m[2]!.toLowerCase().startsWith("uke") ? 7 : 1);
};

export const KONSEKVENSGRADER: Konsekvensgrad[] = (
  data.konsekvensgrader as { kg: number; navn: string; beskrivelse: string; tiltakstid: { aadt_0_3000: string | null; aadt_over_3000: string | null }; kilde: string; status: string }[]
)
  .filter((k) => k.status === "verifisert")
  .map((k) => ({
    kg: k.kg as 0 | 1 | 2 | 3,
    navn: k.navn,
    // Første setning er nok i skjemaet; resten står i kilden.
    beskrivelse: k.beskrivelse.split(/(?<=\.)\s/)[0]!,
    dager: [tilDager(k.tiltakstid.aadt_0_3000), tilDager(k.tiltakstid.aadt_over_3000)],
    kilde: k.kilde,
  }));

/** Tiltakstid i dager etter R610:2025 tabell 1.3—1 (konsekvensgrad og ÅDT). */
export function tiltakstid(kg: number, aadt: number | null): number | null {
  const k = KONSEKVENSGRADER.find((x) => x.kg === kg);
  if (!k) return null;
  return aadt != null && aadt > 3000 ? k.dager[1] : k.dager[0];
}
