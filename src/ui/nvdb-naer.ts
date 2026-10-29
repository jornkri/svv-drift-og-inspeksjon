import type Geometry from "@arcgis/core/geometry/Geometry.js";
import type Point from "@arcgis/core/geometry/Point.js";
import type Polygon from "@arcgis/core/geometry/Polygon.js";
import type Polyline from "@arcgis/core/geometry/Polyline.js";
import { html, nothing } from "lit";
import type { ObjektTreff } from "../data/DataService.ts";
import { NVDB_TYPER, hentVegobjekter, minsteAvstand, oppsummer, parseWkt, wktLinjer, type NvdbType, type NvdbVegobjekt } from "../nvdb/vegobjekter.ts";
import { services } from "../services.ts";
import { store } from "../state/store.ts";
import { LightElement, fmtNumber } from "./base.ts";
import { nvdbSwatch } from "./layer-panel.ts";

/** Søkeavstand rundt modellobjektet. */
const RADIUS_M = 25;

type Naer = { type: NvdbType; o: NvdbVegobjekt; avstand: number };

function koordinater(g: Geometry): number[][][] {
  if (g.type === "point") return [[[(g as Point).x, (g as Point).y]]];
  if (g.type === "polyline") return (g as Polyline).paths;
  if (g.type === "polygon") return (g as Polygon).rings;
  return [];
}

const cache = new Map<string, Promise<Naer[]>>();

async function finnNaer(t: ObjektTreff): Promise<Naer[]> {
  const e = t.geometry.extent;
  const pts = koordinater(t.geometry);
  const bbox: [number, number, number, number] = e
    ? [e.xmin - RADIUS_M, e.ymin - RADIUS_M, e.xmax + RADIUS_M, e.ymax + RADIUS_M]
    : (() => {
        const p = pts[0]![0]!;
        return [p[0]! - RADIUS_M, p[1]! - RADIUS_M, p[0]! + RADIUS_M, p[1]! + RADIUS_M] as [number, number, number, number];
      })();
  const k = { baseUrl: services().cfg.nvdb.baseUrl, client: services().cfg.nvdb.client };
  const typer = NVDB_TYPER.filter((x) => x.id !== 241 && x.id !== 105);
  const svar = await Promise.all(typer.map((type) => hentVegobjekter(k, type.id, bbox, { maksSider: 1 }).then((os) => os.map((o) => ({ type, o }))).catch(() => [])));
  return svar
    .flat()
    .map(({ type, o }) => {
      const g = parseWkt(o.geometri?.wkt);
      return { type, o, avstand: g ? minsteAvstand(pts, wktLinjer(g)) : Infinity };
    })
    .filter((x) => x.avstand <= RADIUS_M)
    .sort((a, b) => a.avstand - b.avstand);
}

/** Ekte vegobjekter fra NVDB nær et modellobjekt – kobler prosjektmodellen til driftsdata. */
export class SvvNvdbNaer extends LightElement {
  static override properties = { treff: { attribute: false } };
  declare treff: ObjektTreff | null;

  private liste: Naer[] | null = null;
  private feil = false;
  private lastetFor: string | null = null;

  protected override willUpdate(): void {
    const t = this.treff;
    if (!t || t.objekt.globalid === this.lastetFor) return;
    const id = t.objekt.globalid;
    this.lastetFor = id;
    this.liste = null;
    this.feil = false;
    let p = cache.get(id);
    if (!p) {
      p = finnNaer(t);
      cache.set(id, p);
      p.catch(() => cache.delete(id));
    }
    p.then(
      (l) => {
        if (this.lastetFor !== id) return;
        this.liste = l;
        this.requestUpdate();
      },
      () => {
        if (this.lastetFor !== id) return;
        this.feil = true;
        this.requestUpdate();
      },
    );
  }

  protected override render() {
    if (!this.treff) return nothing;
    return html`<section class="egenskaper" aria-labelledby="nvdb-naer-tittel">
      <h3 class="kategori" id="nvdb-naer-tittel">I NVDB INNEN ${RADIUS_M} M</h3>
      ${this.feil
        ? html`<p class="sekundar">NVDB svarer ikke akkurat nå.</p>`
        : this.liste == null
          ? html`<p class="sekundar" role="status">Søker i NVDB …</p>`
          : this.liste.length
            ? html`<ul class="nvdbliste">
                ${this.liste.slice(0, 8).map(
                  (x) => html`<li>
                    <button
                      class="nvdbliste__rad"
                      @click=${() => store.set({ selection: null, nvdbValgt: { typeId: x.type.id, id: x.o.id } })}
                    >
                      ${nvdbSwatch(x.type)}
                      <span class="nvdbliste__tekst">
                        <span class="nvdbliste__navn">${x.type.navn}</span>
                        <span class="sekundar">${oppsummer(x.o) || `NVDB-id ${x.o.id}`}</span>
                      </span>
                      <span class="nvdbliste__avstand">${fmtNumber(x.avstand, 0)} m</span>
                    </button>
                  </li>`,
                )}
              </ul>`
            : html`<p class="sekundar">Ingen registrerte vegobjekter i NVDB innen ${RADIUS_M} m.</p>`}
    </section>`;
  }
}

customElements.define("svv-nvdb-naer", SvvNvdbNaer);
