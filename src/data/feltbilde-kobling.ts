/**
 * Kobling mellom feltbilder og objekter (ren logikk, uten ArcGIS, enhetstestes).
 *
 * Bildene har posisjon (GPS) og ofte retning (drone: gimbalretning, iPhone: kompass). Et bilde
 * kobles til et objekt når
 * 1. bildet er koblet manuelt (objekt_globalid i bildelaget), eller
 * 2. bildet er tatt nær objektet (innenfor NAER_M), eller
 * 3. objektet ligger i bildets synsfelt (retning ± SYNSFELT_GRADER, innenfor SYNSFELT_M).
 * Avstand og peiling regnes til nærmeste punkt på objektet.
 */

export const NAER_M = 20;
export const SYNSFELT_M = 150;
/** Halv åpningsvinkel for synsfeltet (grader) */
export const SYNSFELT_GRADER = 35;

export type Koblingsgrunn = "manuell" | "naer" | "synsfelt";

export interface Kobling {
  grunn: Koblingsgrunn;
  /** Avstand fra kamera til nærmeste punkt på objektet (m) */
  avstand: number;
}

export interface BildePosisjon {
  x: number;
  y: number;
  /** Kameraretning i grader fra nord, med klokka */
  retning: number | null;
  objektGlobalid: string | null;
}

/** Peiling fra a til b i grader fra nord (0–360). */
export function peiling(ax: number, ay: number, bx: number, by: number): number {
  return ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360;
}

/** Minste vinkelforskjell mellom to retninger (0–180). */
export function vinkelavvik(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

export function koble(bilde: BildePosisjon, objektGlobalid: string, naermeste: { x: number; y: number }): Kobling | null {
  const avstand = Math.hypot(naermeste.x - bilde.x, naermeste.y - bilde.y);
  if (bilde.objektGlobalid && bilde.objektGlobalid.toLowerCase() === objektGlobalid.toLowerCase()) return { grunn: "manuell", avstand };
  if (avstand <= NAER_M) return { grunn: "naer", avstand };
  if (bilde.retning != null && avstand <= SYNSFELT_M && vinkelavvik(peiling(bilde.x, bilde.y, naermeste.x, naermeste.y), bilde.retning) <= SYNSFELT_GRADER) {
    return { grunn: "synsfelt", avstand };
  }
  return null;
}

const REKKEFOLGE: Record<Koblingsgrunn, number> = { manuell: 0, naer: 1, synsfelt: 2 };

/** Manuelt koblede først, deretter bilder tatt nær objektet, så bilder med objektet i synsfeltet; nærmest først. */
export function sorterKoblinger<T extends { kobling: Kobling }>(liste: T[]): T[] {
  return [...liste].sort((a, b) => REKKEFOLGE[a.kobling.grunn] - REKKEFOLGE[b.kobling.grunn] || a.kobling.avstand - b.kobling.avstand);
}

export function koblingTekst(k: Kobling): string {
  const m = `${Math.round(k.avstand)} m`;
  if (k.grunn === "manuell") return "Koblet manuelt";
  if (k.grunn === "synsfelt") return `Objektet i synsfeltet, ${m} unna`;
  return k.avstand < 1.5 ? "Tatt ved objektet" : `Tatt ${m} fra objektet`;
}
