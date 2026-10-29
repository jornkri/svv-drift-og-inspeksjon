/**
 * Genererer mockdata for testområdet E45 Kløfta (prosjekt «E45 Kløfta B12016», Alta).
 *
 * Objektene legges langs den ekte senterlinjen for EV45 S2D1 hentet fra NVDB API Les
 * (scripts/data/ev45-klofta-nvdb.json, NLOD). Resultatet er deterministisk (fast frø).
 *
 *   node scripts/generate-mock.ts
 *
 * Skriver src/data/mock/objekter.geo.json (GeoJSON, EPSG:25833 med NN2000-høyder)
 * og src/data/mock/tabeller.json (dokumenter, inspeksjoner, oppgaver).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nvdb = JSON.parse(readFileSync(join(root, "scripts/data/ev45-klofta-nvdb.json"), "utf8")) as {
  segmenter: { vegsystemreferanse: string; fra: number; til: number; wkt: string }[];
};

// ---------------------------------------------------------------------------
// Tilfeldighet med fast frø
// ---------------------------------------------------------------------------
let seed = 12016;
function rnd(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const between = (a: number, b: number) => a + rnd() * (b - a);
const r2 = (n: number) => Math.round(n * 100) / 100;

function uuid(): string {
  const h = () => Math.floor(rnd() * 16).toString(16);
  const s = (n: number) => Array.from({ length: n }, h).join("");
  return `{${s(8)}-${s(4)}-4${s(3)}-${"89ab"[Math.floor(rnd() * 4)]}${s(3)}-${s(12)}}`.toUpperCase();
}
const IFC_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
const ifcGuid = () => Array.from({ length: 22 }, (_, i) => (i === 0 ? pick("0123".split("")) : pick(IFC_CHARS.split("")))).join("");

// ---------------------------------------------------------------------------
// Senterlinje med stasjonering (meter i vegsystemreferansen)
// ---------------------------------------------------------------------------
type P3 = [number, number, number];
interface Station {
  m: number;
  p: P3;
}
const stations: Station[] = [];
for (const seg of nvdb.segmenter
  .filter((s) => s.vegsystemreferanse.startsWith("EV45 S2D1"))
  .sort((a, b) => a.fra - b.fra)) {
  const pts = seg.wkt
    .replace(/^LINESTRING Z \(/, "")
    .replace(/\)$/, "")
    .split(",")
    .map((t) => t.trim().split(/\s+/).map(Number) as P3);
  const lens = [0];
  for (let i = 1; i < pts.length; i++) {
    lens.push(lens[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  }
  const total = lens.at(-1)!;
  pts.forEach((p, i) => {
    const m = seg.fra + (lens[i]! / total) * (seg.til - seg.fra);
    if (!stations.length || m > stations.at(-1)!.m + 0.01) stations.push({ m, p });
  });
}

function at(m: number): { p: P3; dir: [number, number] } {
  let i = stations.findIndex((s) => s.m >= m);
  if (i <= 0) i = 1;
  const a = stations[i - 1]!;
  const b = stations[i]!;
  const t = Math.min(1, Math.max(0, (m - a.m) / (b.m - a.m)));
  const dx = b.p[0] - a.p[0];
  const dy = b.p[1] - a.p[1];
  const len = Math.hypot(dx, dy) || 1;
  return {
    p: [a.p[0] + dx * t, a.p[1] + dy * t, a.p[2] + (b.p[2] - a.p[2]) * t],
    dir: [dx / len, dy / len],
  };
}

/** Punkt med sideforskyvning (positiv = venstre i stasjoneringsretningen). */
function offsetPt(m: number, d: number, dz = 0): P3 {
  const { p, dir } = at(m);
  return [r2(p[0] - dir[1] * d), r2(p[1] + dir[0] * d), r2(p[2] + dz)];
}
function offsetLine(m1: number, m2: number, d: number, dz = 0, step = 6): P3[] {
  const out: P3[] = [];
  const n = Math.max(1, Math.ceil((m2 - m1) / step));
  for (let i = 0; i <= n; i++) out.push(offsetPt(m1 + ((m2 - m1) * i) / n, d, dz));
  return out;
}
function band(m1: number, m2: number, d1: number, d2: number): P3[] {
  const a = offsetLine(m1, m2, d1);
  const b = offsetLine(m1, m2, d2).reverse();
  return [...a, ...b, a[0]!];
}
const lineLength = (pts: P3[]) =>
  pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);

const M0 = 9300;
const M1 = 11080;
const vegref = (m: number) => `EV45 S2D1 m${Math.round(m)}`;

// ---------------------------------------------------------------------------
// Objekter
// ---------------------------------------------------------------------------
type Fag = "VA" | "Elektro" | "Veg";
type Geom = { type: "Point"; coordinates: P3 } | { type: "LineString"; coordinates: P3[] } | { type: "Polygon"; coordinates: P3[][] };

interface Obj {
  lag: string;
  m: number;
  geometry: Geom;
  props: Record<string, string | number | null>;
}

const objs: Obj[] = [];

function add(o: {
  lag: string;
  fag: Fag;
  id: string;
  navn: string;
  type: string;
  fagmodell: string;
  ifc: string;
  m: number;
  geometry: Geom;
}) {
  const coords =
    o.geometry.type === "Point" ? [o.geometry.coordinates] : o.geometry.type === "LineString" ? o.geometry.coordinates : o.geometry.coordinates[0]!;
  const zs = coords.map((c) => c[2]);
  const lengde =
    o.geometry.type === "LineString" ? r2(lineLength(o.geometry.coordinates)) : o.geometry.type === "Polygon" ? r2(lineLength(coords) / 2 - 10) : null;
  objs.push({
    lag: o.lag,
    m: o.m,
    geometry: o.geometry,
    props: {
      globalid: uuid(),
      objekt_id: o.id,
      navn: o.navn,
      fag: o.fag,
      objekttype: o.type,
      mmi: null,
      revisjon: null,
      rev_dato: null,
      status_inspeksjon: "Ikke inspisert",
      vegreferanse: vegref(o.m),
      kote_min: r2(Math.min(...zs)),
      kote_max: r2(Math.max(...zs)),
      lengde_m: lengde,
      fagmodell: o.fagmodell,
      modellfil: null,
      modellert_av: `Prosjekterende ${o.fag === "VA" ? "VA" : o.fag === "Elektro" ? "elektro" : "veg"}`,
      prosjekt: "E45 Kløfta B12016",
      ifc_guid: ifcGuid(),
      ifc_klasse: o.ifc,
      lastet_inn: null,
    },
  });
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

// VA – overvannsledninger (44) og kummer (30)
{
  const n = 44;
  const len = (M1 - M0) / 22;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 7 : -7.5;
    const k = Math.floor(i / 2);
    const m1 = M0 + k * len + 2;
    const m2 = m1 + len - 4;
    add({ lag: "va_linje", fag: "VA", id: `OV-L${pad(i + 1)}`, navn: `Overvannsledning OV-L${pad(i + 1)}`, type: "Overvannsledning", fagmodell: "Overvann", ifc: "IfcPipeSegment", m: (m1 + m2) / 2, geometry: { type: "LineString", coordinates: offsetLine(m1, m2, side, -1.6) } });
  }
  for (let i = 0; i < 30; i++) {
    const m = M0 + 20 + (i * (M1 - M0 - 40)) / 29;
    const side = i % 2 === 0 ? 7 : -7.5;
    add({ lag: "va_punkt", fag: "VA", id: `OV-${101 + i}`, navn: `Kum OV-${101 + i}`, type: "Kum", fagmodell: "Overvann", ifc: "IfcDistributionChamberElement", m, geometry: { type: "Point", coordinates: offsetPt(m, side, -0.1) } });
  }
}

// VA – stikkrenner (6), tverrs av vegen. SR-003 har faste verdier fra prosjektet.
const SR_M = [9420, 9690, 10205, 10480, 10760, 10990];
SR_M.forEach((m, i) => {
  const id = `SR-${pad(i + 1, 3)}`;
  const navn = `Stikkrennetrase-${pad(i + 1, 3)}`;
  if (i === 2) {
    // 57,21 m, kote 107,99 (innløp) → 105,80 (utløp)
    const { p, dir } = at(m);
    const half = 57.21 / 2;
    const nx = -dir[1];
    const ny = dir[0];
    // liten skjevhet i kryssingen
    const ax = nx * 0.97 + dir[0] * 0.243;
    const ay = ny * 0.97 + dir[1] * 0.243;
    const al = Math.hypot(ax, ay);
    const ux = ax / al;
    const uy = ay / al;
    const coords: P3[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const s = -half + 57.21 * t;
      coords.push([r2(p[0] + ux * s), r2(p[1] + uy * s), r2(107.99 + (105.8 - 107.99) * t)]);
    }
    add({ lag: "va_linje", fag: "VA", id, navn, type: "Ledningsgrøft", fagmodell: "Overvann", ifc: "IfcPipeSegment", m, geometry: { type: "LineString", coordinates: coords } });
  } else {
    const L = between(38, 62);
    const { p, dir } = at(m);
    const coords: P3[] = [];
    for (let k = 0; k <= 8; k++) {
      const s = -L / 2 + (L * k) / 8;
      coords.push([r2(p[0] - dir[1] * s), r2(p[1] + dir[0] * s), r2(p[2] - 1.8 - 0.035 * (s + L / 2))]);
    }
    add({ lag: "va_linje", fag: "VA", id, navn, type: "Ledningsgrøft", fagmodell: "Overvann", ifc: "IfcPipeSegment", m, geometry: { type: "LineString", coordinates: coords } });
  }
});

// VA – sandfang (18) og drensledninger (42)
for (let i = 0; i < 18; i++) {
  const m = M0 + 45 + (i * (M1 - M0 - 90)) / 17;
  add({ lag: "va_punkt", fag: "VA", id: `SF-${pad(i + 1)}`, navn: `Sandfang SF-${pad(i + 1)}`, type: "Sandfang", fagmodell: "Overvann", ifc: "IfcDistributionChamberElement", m, geometry: { type: "Point", coordinates: offsetPt(m, i % 2 ? 4.6 : -4.6, -0.1) } });
}
{
  const len = (M1 - M0) / 21;
  for (let i = 0; i < 42; i++) {
    const k = Math.floor(i / 2);
    const side = i % 2 === 0 ? 6 : -6;
    const m1 = M0 + k * len + 1;
    const m2 = m1 + len - 2;
    add({ lag: "va_linje", fag: "VA", id: `DR-${pad(i + 1)}`, navn: `Drensledning DR-${pad(i + 1)}`, type: "Drensledning", fagmodell: "Drenering", ifc: "IfcPipeSegment", m: (m1 + m2) / 2, geometry: { type: "LineString", coordinates: offsetLine(m1, m2, side, -1.2) } });
  }
}

// Elektro – kabelgrøfter (14), belysningsmaster (57), tekniske skap (7)
{
  const len = (M1 - M0) / 14;
  for (let i = 0; i < 14; i++) {
    const m1 = M0 + i * len + 3;
    const m2 = m1 + len - 6;
    add({ lag: "el_linje", fag: "Elektro", id: `EL-${pad(i + 1)}`, navn: `Kabelgrøft EL-${pad(i + 1)}`, type: "Kabelgrøft", fagmodell: "Kabelanlegg", ifc: "IfcCableCarrierSegment", m: (m1 + m2) / 2, geometry: { type: "LineString", coordinates: offsetLine(m1, m2, -9.5, -0.8) } });
  }
  for (let i = 0; i < 57; i++) {
    const m = M0 + 10 + (i * (M1 - M0 - 20)) / 56;
    add({ lag: "el_punkt", fag: "Elektro", id: `BM-${pad(i + 1)}`, navn: `Belysningsmast BM-${pad(i + 1)}`, type: "Belysningsmast", fagmodell: "Belysning", ifc: "IfcLightFixture", m, geometry: { type: "Point", coordinates: offsetPt(m, -8.2, 0) } });
  }
  for (let i = 0; i < 7; i++) {
    const m = M0 + 100 + i * 255;
    add({ lag: "el_punkt", fag: "Elektro", id: `TS-${pad(i + 1)}`, navn: `Teknisk skap TS-${pad(i + 1)}`, type: "Teknisk skap", fagmodell: "Kabelanlegg", ifc: "IfcElectricDistributionPoint", m, geometry: { type: "Point", coordinates: offsetPt(m, -12, 0) } });
  }
}

// Veg – vegoverbygning (40), grøfter (10), rekkverk (22), kantstein (22)
{
  const len = (M1 - M0) / 40;
  for (let i = 0; i < 40; i++) {
    const m1 = M0 + i * len;
    const m2 = m1 + len;
    add({ lag: "veg_flate", fag: "Veg", id: `VO-${pad(i + 1)}`, navn: `Vegoverbygning VO-${pad(i + 1)}`, type: "Vegoverbygning", fagmodell: "Vegoverbygning", ifc: "IfcBuildingElementProxy", m: (m1 + m2) / 2, geometry: { type: "Polygon", coordinates: [band(m1, m2, 5, -5)] } });
  }
  const glen = (M1 - M0) / 10;
  for (let i = 0; i < 10; i++) {
    const m1 = M0 + i * glen + 4;
    const m2 = m1 + glen - 8;
    const side = i % 2 ? 1 : -1;
    add({ lag: "veg_flate", fag: "Veg", id: `GR-${pad(i + 1)}`, navn: `Grøft GR-${pad(i + 1)}`, type: "Grøft", fagmodell: "Vegoverbygning", ifc: "IfcBuildingElementProxy", m: (m1 + m2) / 2, geometry: { type: "Polygon", coordinates: [band(m1, m2, side * 10.5, side * 13.5)] } });
  }
  const rlen = (M1 - M0) / 11;
  for (let i = 0; i < 22; i++) {
    const k = Math.floor(i / 2);
    const side = i % 2 === 0 ? 5.4 : -5.4;
    const m1 = M0 + k * rlen + 10;
    const m2 = m1 + rlen * 0.6;
    add({ lag: "veg_linje", fag: "Veg", id: `RV-${pad(i + 1)}`, navn: `Rekkverk RV-${pad(i + 1)}`, type: "Rekkverk", fagmodell: "Rekkverk", ifc: "IfcRailing", m: (m1 + m2) / 2, geometry: { type: "LineString", coordinates: offsetLine(m1, m2, side, 0.75) } });
  }
  for (let i = 0; i < 22; i++) {
    const k = Math.floor(i / 2);
    const side = i % 2 === 0 ? 5.05 : -5.05;
    const m1 = M0 + k * rlen + rlen * 0.65;
    const m2 = m1 + rlen * 0.3;
    add({ lag: "veg_linje", fag: "Veg", id: `KS-${pad(i + 1)}`, navn: `Kantstein KS-${pad(i + 1)}`, type: "Kantstein", fagmodell: "Vegoverbygning", ifc: "IfcBuildingElementProxy", m: (m1 + m2) / 2, geometry: { type: "LineString", coordinates: offsetLine(m1, m2, side, 0.1) } });
  }
}

// ---------------------------------------------------------------------------
// MMI-faser fordelt langs vegen (I drift ved den eksisterende enden)
// ---------------------------------------------------------------------------
const PHASE_PLAN: [string, number, number[]][] = [
  ["i_drift", 15, [600]],
  ["som_bygget", 31, [500]],
  ["utforelse", 196, [400, 400, 400, 425, 450, 475]],
  ["detaljert", 58, [325, 350, 375]],
  ["prinsipp", 12, [225, 250, 300]],
];
if (objs.length !== PHASE_PLAN.reduce((s, p) => s + p[1], 0)) throw new Error(`Feil antall objekter: ${objs.length}`);

const order = objs.map((o, i) => ({ i, key: o.m + between(-70, 70) })).sort((a, b) => a.key - b.key);
const phaseOfObj = new Array<string>(objs.length);
{
  let k = 0;
  for (const [id, n] of PHASE_PLAN) for (let j = 0; j < n; j++) phaseOfObj[order[k++]!.i] = id;
}
const sr3 = objs.findIndex((o) => o.props.objekt_id === "SR-003");
if (phaseOfObj[sr3] !== "utforelse") {
  const swap = phaseOfObj.findIndex((p, i) => p === "utforelse" && objs[i]!.props.fag === "VA");
  phaseOfObj[swap] = phaseOfObj[sr3]!;
  phaseOfObj[sr3] = "utforelse";
}

const slug: Record<string, string> = {
  Overvann: "overvann",
  Drenering: "drenering",
  Kabelanlegg: "kabel",
  Belysning: "belysning",
  Vegoverbygning: "vegoverbygning",
  Rekkverk: "rekkverk",
};
const fagkode: Record<Fag, string> = { VA: "f", Elektro: "e", Veg: "v" };

const isoDate = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d)).toISOString();
const randomDate = (from: [number, number, number], to: [number, number, number]) => {
  const a = Date.UTC(from[0], from[1] - 1, from[2]);
  const b = Date.UTC(to[0], to[1] - 1, to[2]);
  return new Date(a + Math.floor(rnd() * ((b - a) / 86400000)) * 86400000).toISOString();
};

objs.forEach((o, i) => {
  const phase = phaseOfObj[i]!;
  const plan = PHASE_PLAN.find((p) => p[0] === phase)!;
  const mmi = pick(plan[2]);
  const P = o.props;
  P.mmi = mmi;
  P.revisjon = pick(["A", "A", "B", "B", "C", "D"]);
  P.rev_dato = randomDate([2025, 3, 1], [2026, 9, 30]);
  P.modellfil = `m_${fagkode[P.fag as Fag]}_${slug[P.fagmodell as string]}_MMI${mmi} (IFC2X3)`;
  P.lastet_inn = new Date(Date.parse(randomDate([2026, 9, 1], [2026, 10, 28])) + Math.floor(between(7, 16)) * 3600000).toISOString();
  const r = rnd();
  P.status_inspeksjon =
    phase === "i_drift" || phase === "som_bygget"
      ? r < 0.75 ? "OK" : "Avvik"
      : phase === "utforelse"
        ? r < 0.5 ? "OK" : r < 0.62 ? "Avvik" : "Ikke inspisert"
        : "Ikke inspisert";
});

// Faste verdier for Stikkrennetrase-003
Object.assign(objs[sr3]!.props, {
  mmi: 400,
  revisjon: "A",
  rev_dato: isoDate(2026, 1, 27),
  status_inspeksjon: "OK",
  kote_min: 105.8,
  kote_max: 107.99,
  lengde_m: 57.21,
  fagmodell: "Overvann",
  modellfil: "m_f_overvann_MMI400 (IFC2X3)",
  modellert_av: "Trimble Solutions Sandvika AS",
  lastet_inn: "2026-10-29T07:55:00.000Z",
});

// ---------------------------------------------------------------------------
// Dokumenter
// ---------------------------------------------------------------------------
interface Dok {
  objekt_globalid: string;
  tittel: string;
  type: "Tegning" | "Datablad" | "FDV";
  revisjon: string | null;
  url: string;
}
const dokumenter: Dok[] = [];
const dokUrl = (kode: string, tittel: string) => `mock-dok/index.html?kode=${encodeURIComponent(kode)}&tittel=${encodeURIComponent(tittel)}`;
for (const o of objs) {
  const P = o.props;
  const g = P.globalid as string;
  if (P.objekt_id === "SR-003") {
    dokumenter.push(
      { objekt_globalid: g, tittel: "G301 – Plan og profil, overvann", type: "Tegning", revisjon: "A", url: dokUrl("G301", "Plan og profil, overvann") },
      { objekt_globalid: g, tittel: "G501 – Detaljer stikkrenner", type: "Tegning", revisjon: "A", url: dokUrl("G501", "Detaljer stikkrenner") },
      { objekt_globalid: g, tittel: "Datablad – stikkrør", type: "Datablad", revisjon: null, url: dokUrl("DB-SR", "Datablad stikkrør") },
      { objekt_globalid: g, tittel: "FDV-dokumentasjon overvann", type: "FDV", revisjon: null, url: dokUrl("FDV-OV", "FDV-dokumentasjon overvann") },
    );
    continue;
  }
  const serie = P.fag === "VA" ? "G" : P.fag === "Elektro" ? "E" : "F";
  const nr = `${serie}${300 + Math.floor(rnd() * 3) * 100 + 1 + Math.floor(rnd() * 9)}`;
  dokumenter.push({ objekt_globalid: g, tittel: `${nr} – ${P.fagmodell}, plan og profil`, type: "Tegning", revisjon: P.revisjon as string, url: dokUrl(nr, `${P.fagmodell}, plan og profil`) });
  if (rnd() < 0.5) dokumenter.push({ objekt_globalid: g, tittel: `Datablad – ${String(P.objekttype).toLowerCase()}`, type: "Datablad", revisjon: null, url: dokUrl(`DB-${P.objekt_id}`, `Datablad ${P.objekttype}`) });
  if (P.mmi === 500 || P.mmi === 600) dokumenter.push({ objekt_globalid: g, tittel: `FDV-dokumentasjon ${String(P.fagmodell).toLowerCase()}`, type: "FDV", revisjon: null, url: dokUrl(`FDV-${P.objekt_id}`, `FDV ${P.fagmodell}`) });
}

// ---------------------------------------------------------------------------
// Inspeksjoner
// ---------------------------------------------------------------------------
const INSPEKTORER = ["Kari Nordmann", "Ola Hansen", "Per Olsen", "Ingrid Berg"];
const avvikFor: Record<Fag, string[]> = {
  VA: ["Tilstopping / sedimentasjon", "Erosjon / utvasking", "Setning / deformasjon"],
  Elektro: ["Skade på konstruksjon", "Korrosjon", "Mangler ved merking"],
  Veg: ["Skade på konstruksjon", "Setning / deformasjon", "Erosjon / utvasking"],
};
const kommentarOk = ["Ingen merknader.", "Fritt og i god stand.", "Kontrollert, ok."];
const kommentarAvvik: Record<string, string> = {
  "Tilstopping / sedimentasjon": "Sedimenter observert, bør spyles.",
  "Erosjon / utvasking": "Utvasking rundt innløp, steinsetting anbefales.",
  "Setning / deformasjon": "Synlig setning, følges opp ved neste inspeksjon.",
  "Skade på konstruksjon": "Skade registrert, utbedring må vurderes.",
  Korrosjon: "Begynnende korrosjon på fester.",
  "Mangler ved merking": "Merking mangler eller er uleselig.",
};

interface Insp {
  globalid: string;
  objekt_globalid: string;
  tilstandsgrad: number;
  avvikstype: string;
  tiltak_behov: "ja" | "nei";
  kommentar: string;
  inspektor: string;
  tidspunkt: string;
  pos_noyaktighet_m: number;
  pos_x: number;
  pos_y: number;
  oppgave_id: string | null;
  antall_bilder: number;
  [k: string]: unknown;
}
const inspeksjoner: Insp[] = [];
function objCopy(P: Record<string, unknown>) {
  return {
    obj_objekt_id: P.objekt_id,
    obj_navn: P.navn,
    obj_fag: P.fag,
    obj_fagmodell: P.fagmodell,
    obj_vegreferanse: P.vegreferanse,
    obj_lengde_m: P.lengde_m,
    obj_kote_min: P.kote_min,
    obj_kote_max: P.kote_max,
  };
}
const firstCoord = (g: Geom): P3 => (g.type === "Point" ? g.coordinates : g.type === "LineString" ? g.coordinates[0]! : g.coordinates[0]![0]!);

for (const o of objs) {
  const P = o.props;
  if (P.status_inspeksjon === "Ikke inspisert") continue;
  const c = firstCoord(o.geometry);
  if (P.objekt_id === "SR-003") {
    inspeksjoner.push(
      { globalid: uuid(), objekt_globalid: P.globalid as string, tilstandsgrad: 0, avvikstype: "Ingen avvik", tiltak_behov: "nei", kommentar: "Fritt innløp og utløp.", inspektor: "Kari Nordmann", tidspunkt: "2026-03-12T09:14:00.000Z", pos_noyaktighet_m: 3, pos_x: c[0] + 2, pos_y: c[1] - 1, oppgave_id: null, antall_bilder: 3, ...objCopy(P) },
      { globalid: uuid(), objekt_globalid: P.globalid as string, tilstandsgrad: 1, avvikstype: "Tilstopping / sedimentasjon", tiltak_behov: "ja", kommentar: "Noe sedimentasjon ved utløp, spylt.", inspektor: "Ola Hansen", tidspunkt: "2025-10-02T11:40:00.000Z", pos_noyaktighet_m: 4, pos_x: c[0] - 1, pos_y: c[1] + 2, oppgave_id: null, antall_bilder: 2, ...objCopy(P) },
    );
    continue;
  }
  const n = rnd() < 0.4 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const latest = k === 0;
    const avvik = latest && P.status_inspeksjon === "Avvik";
    const tg = avvik ? pick([2, 3]) : pick([0, 0, 1]);
    const avvikstype = tg === 0 ? "Ingen avvik" : pick(avvikFor[P.fag as Fag]);
    inspeksjoner.push({
      globalid: uuid(),
      objekt_globalid: P.globalid as string,
      tilstandsgrad: tg,
      avvikstype,
      tiltak_behov: tg >= 2 ? "ja" : "nei",
      kommentar: tg === 0 ? pick(kommentarOk) : kommentarAvvik[avvikstype] ?? "Avvik registrert.",
      inspektor: pick(INSPEKTORER),
      tidspunkt: latest ? randomDate([2026, 4, 1], [2026, 10, 20]) : randomDate([2025, 5, 1], [2026, 3, 30]),
      pos_noyaktighet_m: Math.round(between(2, 8)),
      pos_x: r2(c[0] + between(-4, 4)),
      pos_y: r2(c[1] + between(-4, 4)),
      oppgave_id: null,
      antall_bilder: Math.floor(between(0, 4)),
      ...objCopy(P),
    });
  }
}

// ---------------------------------------------------------------------------
// Oppgaver (frist lagres som dager fra «i dag»; mocktjenesten regner om ved lasting)
// ---------------------------------------------------------------------------
const byId = (id: string) => objs.find((o) => o.props.objekt_id === id)!.props;
interface Opg {
  oppgave_id: string;
  tittel: string;
  beskrivelse: string;
  objekt_id: string;
  objekt_globalid: string;
  fag: Fag;
  frist_dager: number;
  prioritet: "Høy" | "Middels" | "Lav";
  status: "Ny" | "Pågår" | "Klar for kontroll" | "Fullført";
  tildelt: string;
  skjema: string;
  logg: { dager: number; klokke: string; tekst: string }[];
}
const opg = (
  oppgave_id: string,
  tittel: string,
  objekt_id: string,
  frist_dager: number,
  prioritet: Opg["prioritet"],
  status: Opg["status"],
  tildelt: string,
  beskrivelse: string,
): Opg => {
  const P = byId(objekt_id);
  const skjema = P.fag === "VA" ? "Inspeksjon overvann v2" : P.fag === "Elektro" ? "Inspeksjon elektro v1" : "Inspeksjon veg v1";
  const logg = [
    { dager: Math.min(-1, frist_dager - 10), klokke: "08:55", tekst: "Opprettet fra avviksmelding" },
    { dager: Math.min(-1, frist_dager - 10), klokke: "09:20", tekst: `Tildelt ${tildelt}` },
  ];
  if (status === "Pågår") logg.push({ dager: Math.min(0, frist_dager - 1), klokke: "07:40", tekst: "Status endret til Pågår" });
  if (status === "Fullført") logg.push({ dager: frist_dager - 1, klokke: "14:05", tekst: "Inspeksjon sendt inn – oppgaven fullført" });
  return { oppgave_id, tittel, beskrivelse, objekt_id, objekt_globalid: P.globalid as string, fag: P.fag as Fag, frist_dager, prioritet, status, tildelt, skjema, logg };
};

const oppgaver: Opg[] = [
  {
    ...opg("OPG-1042", "Kontroll av innløp etter flom", "SR-003", 2, "Høy", "Pågår", "Kari Nordmann", "Sjekk innløp og utløp på stikkrenne SR-003 for erosjon og tilstopping. Dokumentér med bilder fra begge ender."),
    logg: [
      { dager: 0, klokke: "08:55", tekst: "Opprettet fra avviksmelding" },
      { dager: 0, klokke: "09:20", tekst: "Tildelt Kari Nordmann" },
    ],
  },
  opg("OPG-1038", "Periodisk inspeksjon kum", "OV-114", -1, "Middels", "Pågår", "Kari Nordmann", "Periodisk inspeksjon av kum: lokk, ramme, trinn og innløp."),
  opg("OPG-1045", "Lysmåling belysningsmaster", "BM-21", 6, "Middels", "Ny", "Kari Nordmann", "Mål lysnivå for BM-21 til BM-34 og registrer master med avvik."),
  opg("OPG-1046", "Sjekk tetting trekkerør", "EL-07", 8, "Lav", "Ny", "Kari Nordmann", "Kontroller at trekkerør i kabelgrøfta er tettet i begge ender."),
  opg("OPG-1031", "Skade på rekkverk", "RV-09", 3, "Høy", "Klar for kontroll", "Ola Hansen", "Påkjørt rekkverk er utbedret. Kontroller utførelsen."),
  opg("OPG-1049", "Spyling sandfang", "SF-05", 14, "Lav", "Ny", "Per Olsen", "Spyl sandfang SF-05 og kontroller utløp."),
  opg("OPG-1050", "Kontroll av grøfteprofil", "GR-02", 17, "Middels", "Ny", "Kari Nordmann", "Kontroller grøfteprofil mot prosjektert profil etter vårflom."),
  opg("OPG-1051", "Inspeksjon stikkrenne", "SR-005", 4, "Middels", "Ny", "Ingrid Berg", "Ordinær inspeksjon av stikkrenne, innløp og utløp."),
  opg("OPG-1052", "Årlig kontroll tekniske skap", "TS-03", 10, "Lav", "Ny", "Ola Hansen", "Visuell kontroll, lås og merking av teknisk skap."),
  opg("OPG-1053", "Sprekker i vegoverbygning", "VO-12", -3, "Høy", "Pågår", "Per Olsen", "Registrer omfang av langsgående sprekker og vurder tiltak."),
  opg("OPG-1054", "Kontroll av kantstein", "KS-08", 5, "Lav", "Ny", "Kari Nordmann", "Kontroller kantstein for skader etter brøyting."),
  opg("OPG-1055", "Termografi kabelskap", "TS-05", 12, "Middels", "Ny", "Elektroentreprenør", "Termografering av koblinger i teknisk skap."),
  opg("OPG-1056", "Kontroll belysning etter montasje", "BM-40", 9, "Middels", "Ny", "Elektroentreprenør", "Sluttkontroll av nymonterte master BM-40 til BM-48."),
  opg("OPG-1020", "Inspeksjon kum etter spyling", "OV-108", -12, "Lav", "Fullført", "Kari Nordmann", "Kontroll etter spyling."),
  opg("OPG-1021", "Inspeksjon drensledning", "DR-14", -9, "Middels", "Fullført", "Ola Hansen", "Filmet og kontrollert drensledning."),
  opg("OPG-1022", "Kontroll rekkverksavslutning", "RV-03", -7, "Høy", "Fullført", "Per Olsen", "Kontroll av endeavslutning."),
  opg("OPG-1023", "Inspeksjon stikkrenne", "SR-001", -5, "Middels", "Fullført", "Kari Nordmann", "Ordinær inspeksjon."),
  opg("OPG-1024", "Kontroll av mastefundament", "BM-05", -4, "Lav", "Fullført", "Ingrid Berg", "Kontroll av fundament og bolter."),
];

// ---------------------------------------------------------------------------
// Skriv filer
// ---------------------------------------------------------------------------
const outDir = join(root, "src/data/mock");
mkdirSync(outDir, { recursive: true });
const fc = {
  type: "FeatureCollection",
  name: "E45 Kløfta B12016 – objekter (mock)",
  crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::25833" } },
  features: objs.map((o, i) => ({ type: "Feature", id: i + 1, geometry: o.geometry, properties: { ...o.props, lag: o.lag } })),
};
writeFileSync(join(outDir, "objekter.geo.json"), JSON.stringify(fc));
writeFileSync(
  join(outDir, "tabeller.json"),
  JSON.stringify({ team: INSPEKTORER, dokumenter, inspeksjoner, oppgaver }, null, 1),
);

// Simulert GPS-rute (?simgps=1): gå langs vegskulderen forbi SR-003 og tilbake på andre siden.
{
  const step = 1.4; // gangfart, én posisjon i sekundet
  const pts: [number, number][] = [];
  const leg = (m1: number, m2: number, d: number) => {
    const n = Math.round(Math.abs(m2 - m1) / step);
    for (let i = 0; i <= n; i++) {
      const p = offsetPt(m1 + ((m2 - m1) * i) / n, d);
      pts.push([p[0], p[1]]);
    }
  };
  leg(10100, 10320, 9);
  leg(10320, 10320, -9);
  leg(10320, 10100, -9);
  writeFileSync(join(outDir, "sim-rute.json"), JSON.stringify({ beskrivelse: "Simulert gangrute langs EV45 S2D1 ved SR-003 (UTM33)", punkter: pts }));
  console.log(`Simulert rute: ${pts.length} punkter`);
}

const count = (pred: (o: Obj) => boolean) => objs.filter(pred).length;
console.log(`Objekter: ${objs.length} (VA ${count((o) => o.props.fag === "VA")}, Elektro ${count((o) => o.props.fag === "Elektro")}, Veg ${count((o) => o.props.fag === "Veg")})`);
console.log(`Dokumenter: ${dokumenter.length}, inspeksjoner: ${inspeksjoner.length}, oppgaver: ${oppgaver.length}`);
console.log("SR-003:", JSON.stringify(objs[sr3]!.props));
