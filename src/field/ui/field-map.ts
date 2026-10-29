import Graphic from "@arcgis/core/Graphic.js";
import Circle from "@arcgis/core/geometry/Circle.js";
import Point from "@arcgis/core/geometry/Point.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import type { ArcgisMap } from "@arcgis/map-components/components/arcgis-map";
import { html, nothing } from "lit";
import { formatDistance } from "../../map/coords.ts";
import { setup2DMap, type Map2D } from "../../map/setup-2d.ts";
import { services } from "../../services.ts";
import { navigate } from "../../state/router.ts";
import { store, type NaerTreff } from "../../state/store.ts";
import { ensureTasks } from "../../tasks/task-store.ts";
import { isOpen } from "../../tasks/tasks.ts";
import { StoreElement, fmtDate } from "../../ui/base.ts";
import { icons } from "../../ui/icons.ts";
import "../../ui/layer-panel.ts";
import "../../ui/object-panel.ts";
import "../../ui/search-box.ts";
import { startInspection } from "../../ui/object-panel.ts";
import { forrigeTekst } from "../prefill.ts";
import { startFieldRuntime } from "../field-runtime.ts";
import "./gps-status.ts";

const MAP_ID = "kart-felt";

/** Felt: kart med geofence, GPS-status og bunnark «DU ER VED». */
export class SvvFieldMap extends StoreElement {
  private static started = false;
  private kart: Map2D | null = null;
  private pos = new GraphicsLayer({ id: "min-posisjon", listMode: "hide" });
  private unsubs: (() => void)[] = [];
  private disposed = false;
  private arkApent = true;
  private sisteInsp: Record<string, string> = {};

  override connectedCallback(): void {
    super.connectedCallback();
    // Lagpanelet dekker for mye på mobil – start lukket
    if (!SvvFieldMap.started) store.set({ layerPanelOpen: false });
    SvvFieldMap.started = true;
    void ensureTasks();
    void startFieldRuntime();
  }

  protected override firstUpdated(): void {
    void setup2DMap(this.querySelector<ArcgisMap>("arcgis-map")!, MAP_ID, { scale: 1500 }).then((k) => {
      if (this.disposed) return k.dispose();
      this.kart = k;
      k.map.add(this.pos);
      this.unsubs.push(store.select((s) => s.gps, () => this.drawPosition()));
      this.drawPosition();
      this.setAttribute("data-klar", "");
    });
    this.unsubs.push(store.select((s) => s.naer, (n) => void this.loadLastInspections(n)));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.disposed = true;
    this.unsubs.forEach((u) => u());
    this.kart?.dispose();
  }

  private async loadLastInspections(naer: NaerTreff[]) {
    const { data } = services();
    for (const n of naer.slice(0, 4)) {
      const id = n.objekt.globalid;
      if (this.sisteInsp[id] !== undefined) continue;
      const insp = await data.getInspections(id);
      this.sisteInsp[id] = insp[0] ? forrigeTekst(insp[0]) : "ikke inspisert";
    }
    this.requestUpdate();
  }

  private drawPosition() {
    const { gps } = store.get();
    const view = this.kart?.view;
    this.pos.removeAll();
    if (gps.x == null || gps.y == null || !view) return;
    const center = new Point({ x: gps.x, y: gps.y, spatialReference: { wkid: 25833 } });
    const { cfg } = services();
    this.pos.addMany([
      new Graphic({
        geometry: new Circle({ center, radius: cfg.geofence.radiusM, radiusUnit: "meters" }),
        symbol: new SimpleFillSymbol({ color: [255, 150, 0, 0.1], outline: { color: [226, 117, 0, 1], width: 1.5, style: "dash" } }),
      }),
      new Graphic({
        geometry: new Circle({ center, radius: Math.max(1, gps.noyaktighet ?? 1), radiusUnit: "meters" }),
        symbol: new SimpleFillSymbol({ color: [7, 113, 151, 0.18], outline: { color: [7, 113, 151, 0.4], width: 0.5 } }),
      }),
      new Graphic({
        geometry: center,
        symbol: new SimpleMarkerSymbol({ style: "circle", size: 14, color: [6, 94, 127, 1], outline: { color: [255, 255, 255, 1], width: 3 } }),
      }),
    ]);
    if (store.get().folg) void view.goTo({ target: center }, { animate: false }).catch(() => undefined);
  }

  private standardobjekt(): NaerTreff | null {
    const { naer, valgtNaer } = this.store.state;
    return naer.find((n) => n.objekt.globalid === valgtNaer) ?? naer[0] ?? null;
  }

  protected override render() {
    const s = this.store.state;
    const { cfg } = services();
    const n = this.standardobjekt();
    const andre = s.naer.filter((x) => x !== n).slice(0, 3);
    const flere = Math.max(0, s.naer.length - 1 - andre.length);
    const oppgave = n
      ? s.oppgaver.filter((o) => o.objekt_globalid === n.objekt.globalid && isOpen(o)).sort((a, b) => a.frist.localeCompare(b.frist))[0]
      : undefined;

    return html`
      <div class="feltkart">
        <arcgis-map id=${MAP_ID} popup-disabled aria-label="Kart med din posisjon"></arcgis-map>

        <div class="feltkart__topp">
          <svv-search-box placeholder="Søk objekt eller vegreferanse"></svv-search-box>
          <button
            class="feltknapp"
            aria-label="Lag og tegnforklaring"
            aria-pressed=${s.layerPanelOpen}
            @click=${() => store.set({ layerPanelOpen: !s.layerPanelOpen })}
          >
            ${icons.layers(22)}
          </button>
        </div>
        <svv-gps-status class="feltkart__gps"></svv-gps-status>
        ${s.layerPanelOpen ? html`<svv-layer-panel class="feltkart__lag"></svv-layer-panel>` : nothing}

        <div class="feltkart__hoyre">
          <button
            class="feltknapp ${s.folg ? "feltknapp--paa" : ""}"
            aria-label="Følg min posisjon"
            aria-pressed=${s.folg}
            @click=${() => {
              store.set({ folg: !s.folg });
              this.drawPosition();
            }}
          >
            ${icons.locate(22)}
          </button>
          <button class="feltknapp feltknapp--tekst" aria-label="Bytt til 3D" @click=${() => navigate("3d")}>3D</button>
        </div>

        <section class="bunnark ${this.arkApent ? "" : "bunnark--lukket"}" aria-label="Nærmeste objekt">
          <button
            class="bunnark__hank"
            aria-expanded=${this.arkApent}
            aria-label=${this.arkApent ? "Skjul bunnark" : "Vis bunnark"}
            @click=${() => {
              this.arkApent = !this.arkApent;
              this.requestUpdate();
            }}
          >
            <span aria-hidden="true"></span>
          </button>
          ${n
            ? html`
                <div class="bunnark__etikett">
                  <span class="bunnark__du-er-ved">DU ER VED</span>
                  <span>${formatDistance(n.avstand)} unna · innenfor ${cfg.geofence.radiusM} m-sone</span>
                </div>
                <div class="bunnark__objekt">
                  <span class="bunnark__fagstrek bunnark__fagstrek--${n.objekt.fag.toLowerCase()}" aria-hidden="true"></span>
                  <div class="bunnark__tekst">
                    <strong class="bunnark__navn">${n.objekt.navn}</strong>
                    <span>${n.objekt.fagmodell ?? n.objekt.fag} · MMI ${n.objekt.mmi ?? "–"}${n.objekt.lengde_m != null ? ` · ${n.objekt.lengde_m.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} m` : ""}</span>
                    <span class="sekundar">${n.objekt.vegreferanse ?? ""} · Siste inspeksjon: ${this.sisteInsp[n.objekt.globalid] ?? "…"}</span>
                  </div>
                </div>
                ${this.arkApent
                  ? html`
                      ${oppgave
                        ? html`<div class="bunnark__oppgave"><strong>Oppgave:</strong><span>${oppgave.oppgave_id} · frist ${fmtDate(oppgave.frist)}</span></div>`
                        : nothing}
                      <div class="knapperad knapperad--to">
                        <button
                          class="knapp knapp--sekundar knapp--hoy"
                          @click=${() => store.set({ selection: { globalids: [n.objekt.globalid], index: 0 } })}
                        >
                          Info og dokumenter
                        </button>
                        <button class="knapp knapp--primar knapp--hoy" @click=${() => startInspection(n.objekt.globalid)}>Start inspeksjon</button>
                      </div>
                      ${andre.length
                        ? html`<div class="bunnark__andre">
                            <span class="sekundar">${s.naer.length - 1} ${s.naer.length - 1 === 1 ? "annet objekt" : "andre objekter"} i nærheten${flere ? ` (viser ${andre.length} nærmeste)` : ""}:</span>
                            <ul>
                              ${andre.map(
                                (a) => html`<li>
                                  <button class="naerknapp" @click=${() => store.set({ valgtNaer: a.objekt.globalid })}>
                                    <span>${a.objekt.navn}</span><span>${formatDistance(a.avstand)}</span>
                                  </button>
                                </li>`,
                              )}
                            </ul>
                          </div>`
                        : nothing}
                    `
                  : nothing}
              `
            : html`<div class="bunnark__tom">
                <strong>Ingen objekter innenfor ${cfg.geofence.radiusM} m</strong>
                <span class="sekundar"
                  >${s.gps.aktiv
                    ? "Gå nærmere et objekt, eller trykk på et objekt i kartet."
                    : "Venter på posisjon. Tips: legg til ?simgps=1 i adressen for simulert GPS."}</span
                >
              </div>`}
        </section>

        ${s.selection ? html`<svv-object-panel dim="2d" class="feltkart__objekt"></svv-object-panel>` : nothing}
      </div>
    `;
  }
}

customElements.define("svv-field-map", SvvFieldMap);
