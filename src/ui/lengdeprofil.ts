import Polyline from "@arcgis/core/geometry/Polyline.js";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer.js";
import { html, nothing, svg, type TemplateResult } from "lit";
import type { ObjektTreff } from "../data/DataService.ts";
import { hasGdoAccess } from "../map/basemaps.ts";
import { lagProfil, overhoyning, stasjoner, type ProfilModell, type ProfilPunkt } from "../reports/lengdeprofil.ts";
import { services } from "../services.ts";
import { LightElement, fmtNumber } from "./base.ts";
import { dataTable } from "./charts.ts";

/**
 * Lengdeprofil for linjeobjekter, tegnet etter R700-konvensjoner:
 * heltrukken objektlinje, stiplet eksisterende terreng (Geodata Online-høydemodell),
 * referanselinje med kote til venstre, oppgitt overhøyning og rubrikk med
 * profilnummer, profilhøyde, terrenghøyde og overdekning (tekst loddrett som i R700).
 */

let hoydemodell: ElevationLayer | null = null;
const terrengCache = new Map<string, Promise<ProfilPunkt[] | null>>();

function terrengTilgjengelig(): boolean {
  return hasGdoAccess() || services().data.mode === "portal";
}

/** Punktene i linja med stasjonering og eventuell z. */
export function objektPunkter(linje: Polyline): { x: number; y: number; z: number | null; s: number }[] {
  const pts = linje.paths.flat().map((p) => ({ x: p[0]!, y: p[1]!, z: linje.hasZ ? (p[2] ?? null) : null }));
  const s = stasjoner(pts);
  return pts.map((p, i) => ({ ...p, s: s[i]! }));
}

/** Henter terrenghøyder langs linja (ca. hver meter, maks 200 punkter). */
async function hentTerreng(id: string, linje: Polyline): Promise<ProfilPunkt[] | null> {
  if (!terrengTilgjengelig()) return null;
  const cached = terrengCache.get(id);
  if (cached) return cached;
  const p = (async () => {
    hoydemodell ??= new ElevationLayer({ url: services().cfg.gdo.elevationUrl });
    const pts = objektPunkter(linje);
    const lengde = pts.at(-1)?.s ?? 0;
    if (lengde <= 0) return null;
    const steg = Math.max(1, lengde / 200);
    const prove: { x: number; y: number; s: number }[] = [];
    const n = Math.ceil(lengde / steg);
    for (let k = 0, i = 1; k <= n; k++) {
      const s = Math.min(lengde, k * steg);
      while (i < pts.length - 1 && pts[i]!.s < s) i++;
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const t = b.s === a.s ? 0 : Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s)));
      prove.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s });
    }
    const sporing = new Polyline({ paths: [prove.map((q) => [q.x, q.y])], spatialReference: linje.spatialReference });
    const res = await hoydemodell.queryElevation(sporing, { demResolution: "finest-contiguous", noDataValue: -9999 });
    const z = (res.geometry as Polyline).paths[0] ?? [];
    return prove.map((q, i) => {
      const v = z[i]?.[2];
      return { s: q.s, z: v == null || v === -9999 ? null : v };
    });
  })().catch((e: unknown) => {
    terrengCache.delete(id);
    throw e;
  });
  terrengCache.set(id, p);
  return p;
}

/** Velger avstand mellom profilnumre slik at rubrikken ikke blir for tett. */
export function profilIntervall(lengde: number): number {
  for (const i of [10, 20, 50, 100, 200, 500]) if (lengde / i <= 8) return i;
  return 1000;
}

const fmtK = (n: number | null) => fmtNumber(n, 2);
const fmtS = (s: number) => (Number.isInteger(s) ? String(s) : fmtNumber(s, 2));

/** Tegner SVG-en for en ferdig modell. */
export function profilSvg(m: ProfilModell, opts: { innlopUtlop: boolean; tittel: string }): TemplateResult {
  const W = 360;
  const venstre = 88;
  const hoyre = 10;
  const plotW = W - venstre - hoyre;
  const topp = 22;
  const zTopp = Math.ceil(m.zMax + 0.5);
  const hoyde = zTopp - m.referanse;
  const tilgjengelig = 170;
  const f = overhoyning(m.lengde, hoyde, plotW, tilgjengelig);
  const pxPerM = plotW / Math.max(m.lengde, 0.01);
  const plotH = Math.max(60, hoyde * pxPerM * f);
  const X = (s: number) => venstre + s * pxPerM;
  const Y = (z: number) => topp + plotH - (z - m.referanse) * (plotH / hoyde);
  const radH = 40;
  const rader = [
    { navn: "Profilnr.", verdi: (r: ProfilModell["rubrikk"][number]) => fmtS(r.s) },
    { navn: "Profilhøyde", verdi: (r: ProfilModell["rubrikk"][number]) => fmtK(r.profil) },
    { navn: "Terrenghøyde", verdi: (r: ProfilModell["rubrikk"][number]) => fmtK(r.terreng) },
    { navn: "Overdekning", verdi: (r: ProfilModell["rubrikk"][number]) => fmtK(r.overdekning) },
  ];
  const rubrikkTopp = topp + plotH + 10;
  const H = rubrikkTopp + rader.length * radH + 2;
  const kotesteg = hoyde <= 8 ? 1 : hoyde <= 20 ? 2 : hoyde <= 50 ? 5 : 10;
  const koter: number[] = [];
  for (let z = m.referanse + kotesteg; z <= zTopp; z += kotesteg) koter.push(z);

  const sti = (pts: ProfilPunkt[]) => {
    let d = "";
    let pen = false;
    for (const p of pts) {
      if (p.z == null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${X(p.s).toFixed(1)},${Y(p.z).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const z0 = m.objekt[0]?.z ?? null;
  const z1 = m.objekt.at(-1)?.z ?? null;
  const startHoy = z0 != null && z1 != null && z0 >= z1;
  const endeTekst = (z: number | null, start: boolean) => {
    if (z == null) return "";
    if (!opts.innlopUtlop) return `k. ${fmtK(z)}`;
    return `${start === startHoy ? "Innløp" : "Utløp"} k. ${fmtK(z)}`;
  };

  return html`<figure class="diagram lengdeprofil">
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label=${opts.tittel}>
      <text x=${venstre} y="12" class="diagram__tick">Overhøyning ${f}× · koter i NN2000</text>
      ${koter.map(
        (z) => svg`<line x1=${venstre} x2=${W - hoyre} y1=${Y(z)} y2=${Y(z)} class="diagram__rutenett"></line>
          <text x=${venstre - 6} y=${Y(z) + 3.5} text-anchor="end" class="diagram__tick">${z}</text>`,
      )}
      ${m.rubrikk.map((r) => svg`<line x1=${X(r.s)} x2=${X(r.s)} y1=${topp} y2=${H - 2} class="diagram__rutenett"></line>`)}
      <line x1=${venstre} x2=${W - hoyre} y1=${Y(m.referanse)} y2=${Y(m.referanse)} class="profil__referanse"></line>
      <text x=${venstre - 6} y=${Y(m.referanse) + 3.5} text-anchor="end" class="profil__kote">${m.referanse}</text>
      ${m.terreng.length ? svg`<path d=${sti(m.terreng)} class="profil__terreng"></path>` : nothing}
      <path d=${sti(m.objekt)} class="profil__objekt"></path>
      ${z0 != null
        ? svg`<circle cx=${X(0)} cy=${Y(z0)} r="3" class="profil__ende"></circle>
            <text x=${X(0) + 5} y=${Y(z0) - 7} class="profil__endetekst">${endeTekst(z0, true)}</text>`
        : nothing}
      ${z1 != null
        ? svg`<circle cx=${X(m.lengde)} cy=${Y(z1)} r="3" class="profil__ende"></circle>
            <text x=${X(m.lengde) - 5} y=${Y(z1) + 14} text-anchor="end" class="profil__endetekst">${endeTekst(z1, false)}</text>`
        : nothing}
      ${m.fallProsent != null
        ? svg`<text x=${X(m.lengde / 2)} y=${Y(((z0 ?? 0) + (z1 ?? 0)) / 2) + 16} text-anchor="middle" class="profil__fall">${fmtNumber(Math.abs(m.fallProsent), 1)} % ${m.fallProsent >= 0 ? "fall" : "stigning"}</text>`
        : nothing}

      ${rader.map((rad, i) => {
        const y = rubrikkTopp + i * radH;
        return svg`<g>
          <line x1="0" x2=${W - hoyre} y1=${y} y2=${y} class="diagram__akse"></line>
          <text x="2" y=${y + radH / 2 + 3.5} class="diagram__etikett profil__radnavn">${rad.navn}</text>
          ${m.rubrikk.map(
            (r) => svg`<text transform="translate(${X(r.s) + 3.5} ${y + radH - 4}) rotate(-90)" class="profil__verdi ${i === 3 && r.overdekning != null && r.overdekning < 0 ? "profil__verdi--neg" : ""}">${rad.verdi(r)}</text>`,
          )}
        </g>`;
      })}
      <line x1="0" x2=${W - hoyre} y1=${H - 2} y2=${H - 2} class="diagram__akse"></line>

      ${m.rubrikk.map((r, i) => {
        const a = i === 0 ? 0 : (m.rubrikk[i - 1]!.s + r.s) / 2;
        const b = i === m.rubrikk.length - 1 ? m.lengde : (m.rubrikk[i + 1]!.s + r.s) / 2;
        return svg`<rect x=${X(a)} y=${topp} width=${Math.max(1, X(b) - X(a))} height=${H - topp} fill="transparent">
          <title>Profil ${fmtS(r.s)}: profilhøyde ${fmtK(r.profil)}, terreng ${fmtK(r.terreng)}, overdekning ${fmtK(r.overdekning)} m</title>
        </rect>`;
      })}
    </svg>
    <figcaption class="forklaring">
      <span class="forklaring__post"><span class="profil__strek profil__strek--objekt" aria-hidden="true"></span>Objekt (modell)</span>
      ${m.terreng.length
        ? html`<span class="forklaring__post"><span class="profil__strek profil__strek--terreng" aria-hidden="true"></span>Eksisterende terreng</span>`
        : nothing}
      <span class="forklaring__post"><span class="profil__strek profil__strek--ref" aria-hidden="true"></span>Referanse k. ${m.referanse}</span>
    </figcaption>
    ${dataTable(
      opts.tittel,
      ["Profilnr.", "Profilhøyde", "Terrenghøyde", "Overdekning"],
      m.rubrikk.map((r) => [fmtS(r.s), fmtK(r.profil), fmtK(r.terreng), fmtK(r.overdekning)]),
    )}
  </figure>`;
}

/** Profilfanen i objektpanelet. */
export class SvvLengdeprofil extends LightElement {
  static override properties = { treff: { attribute: false } };
  declare treff: ObjektTreff | null;

  private terreng: ProfilPunkt[] | null = null;
  private status: "laster" | "ok" | "ingen-tilgang" | "feil" = "laster";
  private lastetFor: string | null = null;

  protected override willUpdate(): void {
    const t = this.treff;
    if (!t || t.geometry.type !== "polyline") return;
    if (t.objekt.globalid === this.lastetFor) return;
    this.lastetFor = t.objekt.globalid;
    this.terreng = null;
    if (!terrengTilgjengelig()) {
      this.status = "ingen-tilgang";
      return;
    }
    this.status = "laster";
    const id = t.objekt.globalid;
    hentTerreng(id, t.geometry as Polyline)
      .then((p) => {
        if (this.lastetFor !== id) return;
        this.terreng = p;
        this.status = "ok";
        this.requestUpdate();
      })
      .catch(() => {
        if (this.lastetFor !== id) return;
        this.status = "feil";
        this.requestUpdate();
      });
  }

  protected override render() {
    const t = this.treff;
    if (!t || t.geometry.type !== "polyline") return nothing;
    const o = t.objekt;
    const pts = objektPunkter(t.geometry as Polyline);
    const objekt: ProfilPunkt[] = pts.map((p) => ({ s: p.s, z: p.z }));
    const lengde = pts.at(-1)?.s ?? 0;
    const harZ = objekt.some((p) => p.z != null);
    const m = lagProfil(objekt, this.terreng ?? [], profilIntervall(lengde));
    const innlopUtlop = o.fag === "VA";

    return html`<section class="seksjon profilseksjon" aria-labelledby="profil-tittel">
      <h3 id="profil-tittel" class="seksjon__tittel">LENGDEPROFIL</h3>
      ${harZ
        ? profilSvg(m, { innlopUtlop, tittel: `Lengdeprofil for ${o.navn}` })
        : html`<p class="sekundar">Objektet har ikke høyder i modellen, så profilet kan ikke tegnes.</p>`}
      <dl class="nokkeltall nokkeltall--kompakt">
        <div><dt>Lengde (plan)</dt><dd>${fmtNumber(lengde)} m</dd></div>
        <div><dt>Fall</dt><dd>${m.fallProsent != null ? `${fmtNumber(m.fallProsent, 2)} %` : "–"}</dd></div>
        <div><dt>Minste overdekning</dt><dd>${m.minOverdekning != null ? `${fmtNumber(m.minOverdekning)} m` : "–"}</dd></div>
      </dl>
      <p class="sekundar liten" role="status">
        ${this.status === "laster" ? "Henter terrenghøyder fra Geodata Online …" : nothing}
        ${this.status === "ok" ? "Terreng: Geodata Online terrengmodell. Overdekning = terrenghøyde − objektkote i modellen; negativ verdi (rød) betyr at objektet ligger over terrenget." : nothing}
        ${this.status === "ingen-tilgang" ? "Terrengprofil krever tilgang til Geodata Online (se README)." : nothing}
        ${this.status === "feil" ? "Kunne ikke hente terrenghøyder fra Geodata Online." : nothing}
      </p>
    </section>`;
  }
}

customElements.define("svv-lengdeprofil", SvvLengdeprofil);
