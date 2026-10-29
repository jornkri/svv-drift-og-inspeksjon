/**
 * Formatering av koordinater i EUREF89 UTM33 (EPSG:25833) og høyder i NN2000.
 * Eksempel: «N 7 744 215 · Ø 835 472»
 */

/** Heltall med mellomrom som tusenskille (ikke-brytende mellomrom unngås for kopiering). */
export function groupDigits(n: number): string {
  const s = Math.round(Math.abs(n)).toString();
  const out = s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return n < 0 ? `−${out}` : out;
}

export function formatUtm(x: number, y: number): string {
  return `N ${groupDigits(y)} · Ø ${groupDigits(x)}`;
}

/** «NN2000 106,4 m» */
export function formatHeight(z: number | null | undefined): string {
  if (z == null || !Number.isFinite(z)) return "NN2000 –";
  return `NN2000 ${z.toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
}

/** Avstand for visning: «4 m», «320 m», «1,2 km» */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} km`;
}

/** «1:6 000» */
export function formatScale(scale: number): string {
  return `1:${groupDigits(scale)}`;
}
