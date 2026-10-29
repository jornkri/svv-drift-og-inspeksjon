/**
 * Lengdeprofil for linjeobjekter (stikkrenner, ledninger) etter R700-konvensjoner:
 * prosjektert linje heltrukken, eksisterende terreng stiplet, referanselinje med kote,
 * overhøyning (standard 10×), rubrikker for profilnummer, profilhøyde, terrenghøyde og overdekning.
 * Ren logikk – tegnes av ui/lengdeprofil.ts.
 */

export interface ProfilPunkt {
  /** Avstand langs objektet (m) */
  s: number;
  z: number | null;
}

export interface ProfilModell {
  lengde: number;
  objekt: ProfilPunkt[];
  terreng: ProfilPunkt[];
  zMin: number;
  zMax: number;
  /** Referanselinjens kote (hel meter under laveste punkt) */
  referanse: number;
  /** Fall i prosent, positiv når objektet faller i stasjoneringsretningen */
  fallProsent: number | null;
  /** Rubrikk: profilnummer med høyder og overdekning */
  rubrikk: { s: number; profil: number | null; terreng: number | null; overdekning: number | null }[];
  minOverdekning: number | null;
}

/** Kumulativ avstand for en linje i planet. */
export function stasjoner(pts: { x: number; y: number }[]): number[] {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  return s;
}

/** Lineær interpolasjon av z ved avstand s. */
export function zVed(pts: ProfilPunkt[], s: number): number | null {
  const v = pts.filter((p) => p.z != null) as { s: number; z: number }[];
  if (!v.length) return null;
  if (s <= v[0]!.s) return v[0]!.z;
  for (let i = 1; i < v.length; i++) {
    const a = v[i - 1]!;
    const b = v[i]!;
    if (s <= b.s) return b.s === a.s ? b.z : a.z + ((b.z - a.z) * (s - a.s)) / (b.s - a.s);
  }
  return v.at(-1)!.z;
}

/** Profilnumre for rubrikken: start, hver `intervall` meter og slutt. */
export function profilnumre(lengde: number, intervall = 10): number[] {
  const out = [0];
  // Hopp over et profilnummer som ligger så nær slutten at tekstene ville kollidert.
  for (let s = intervall; s < lengde - intervall * 0.15; s += intervall) out.push(s);
  if (lengde > 0) out.push(lengde);
  return out;
}

export function lagProfil(objekt: ProfilPunkt[], terreng: ProfilPunkt[], intervall = 10): ProfilModell {
  const lengde = objekt.at(-1)?.s ?? 0;
  const zs = [...objekt, ...terreng].map((p) => p.z).filter((z): z is number => z != null);
  const zMin = zs.length ? Math.min(...zs) : 0;
  const zMax = zs.length ? Math.max(...zs) : 1;
  const z0 = objekt[0]?.z ?? null;
  const z1 = objekt.at(-1)?.z ?? null;
  const fallProsent = z0 != null && z1 != null && lengde > 0 ? ((z0 - z1) / lengde) * 100 : null;
  const rubrikk = profilnumre(lengde, intervall).map((s) => {
    const p = zVed(objekt, s);
    const t = zVed(terreng, s);
    return { s, profil: p, terreng: t, overdekning: p != null && t != null ? t - p : null };
  });
  const od = rubrikk.map((r) => r.overdekning).filter((v): v is number => v != null);
  return {
    lengde,
    objekt,
    terreng,
    zMin,
    zMax,
    referanse: Math.floor(zMin) - 1,
    fallProsent,
    rubrikk,
    minOverdekning: od.length ? Math.min(...od) : null,
  };
}

/**
 * Overhøyning: R700 bruker 10× i lengdeprofil. Blir profilet for høyt for plassen,
 * reduseres overhøyningen til nærmeste av 10, 5, 2 eller 1.
 */
export function overhoyning(lengde: number, hoyde: number, bredde: number, tilgjengeligHoyde: number): number {
  const mPerPx = lengde / Math.max(1, bredde);
  for (const f of [10, 5, 2, 1]) {
    if ((hoyde / mPerPx) * f <= tilgjengeligHoyde) return f;
  }
  return 1;
}
