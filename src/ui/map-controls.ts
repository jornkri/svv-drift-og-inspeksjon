import "@arcgis/map-components/components/arcgis-distance-measurement-2d";
import "@arcgis/map-components/components/arcgis-area-measurement-2d";
import "@arcgis/map-components/components/arcgis-print";
import Point from "@arcgis/core/geometry/Point.js";
import * as projectOperator from "@arcgis/core/geometry/operators/projectOperator.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import { html, nothing } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import type { BasemapId } from "../config.ts";
import { hasGdoAccess } from "../map/basemaps.ts";
import { mapContext } from "../map/map-context.ts";
import { services } from "../services.ts";
import { navigate } from "../state/router.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "./base.ts";
import { icons } from "./icons.ts";
import { togglePopover } from "./popover.ts";

/** Kontroller til høyre i kartet: 2D/3D, zoom, min posisjon, måling, utskrift og bakgrunnskart. */
export class SvvMapControls extends StoreElement {
  static override properties = { dim: { type: String } };
  declare dim: "2d" | "3d";

  private maaleModus: "avstand" | "areal" = "avstand";
  private maalRef = createRef<HTMLElement & { start(): Promise<void>; clear(): Promise<void> }>();

  private async zoom(dir: 1 | -1) {
    const v = mapContext()?.view;
    if (!v) return;
    await v.goTo({ scale: v.scale / (dir > 0 ? 2 : 0.5) }, { duration: 250 }).catch(() => undefined);
  }

  private locate() {
    if (!navigator.geolocation) {
      store.notify("Enheten støtter ikke posisjonering", "feil");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await projectOperator.load();
        const p = projectOperator.execute(
          new Point({ longitude: pos.coords.longitude, latitude: pos.coords.latitude }),
          new SpatialReference({ wkid: 25833 }),
        ) as Point | null;
        const v = mapContext()?.view;
        if (p && v) await v.goTo({ target: p, scale: 2000 }).catch(() => undefined);
      },
      () => store.notify("Fant ikke posisjonen din", "feil"),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  private async startMeasure() {
    document.body.dataset.maaling = "aktiv";
    await this.updateComplete;
    await this.maalRef.value?.start();
  }

  private stopMeasure() {
    delete document.body.dataset.maaling;
    void this.maalRef.value?.clear();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    delete document.body.dataset.maaling;
  }

  private async printScreenshot() {
    const v = mapContext()?.view;
    if (!v) return;
    const shot = await v.takeScreenshot({ format: "png" });
    const w = window.open("", "_blank");
    if (!w) {
      store.notify("Tillat sprettoppvinduer for å skrive ut", "feil");
      return;
    }
    const { cfg } = services();
    w.document.write(`<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>Utskrift – ${cfg.prosjekt.navn}</title>
      <style>body{font-family:Arial,sans-serif;color:#444f55;margin:16mm}h1{font-size:18pt;margin:0 0 4mm}img{max-width:100%;border:1px solid #858d90}p{font-size:9pt}</style>
      </head><body><h1>${cfg.prosjekt.navn}</h1><img src="${shot.dataUrl}" alt="Kartutsnitt"><p>Utskrevet ${new Date().toLocaleString("nb-NO")} · EUREF89 UTM33 · Målestokk 1:${Math.round(v.scale).toLocaleString("nb-NO")} · Bakgrunn: Geodata Online · Vegnett: NVDB</p>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  }

  protected override render() {
    const s = this.store.state;
    const is2d = this.dim === "2d";
    const elId = mapContext()?.elementId ?? (is2d ? "kart-2d" : "kart-3d");
    const { cfg } = services();
    return html`
      <div class="kartkontroller">
        <div class="knappegruppe" role="group" aria-label="Visning">
          <button class="kartknapp ${is2d ? "is-valgt" : ""}" aria-pressed=${is2d} @click=${() => navigate("kart")}>2D</button>
          <button class="kartknapp ${!is2d ? "is-valgt" : ""}" aria-pressed=${!is2d} @click=${() => navigate("3d")}>3D</button>
        </div>
        <div class="knappegruppe" role="group" aria-label="Navigasjon">
          <button class="kartknapp" aria-label="Zoom inn" @click=${() => this.zoom(1)}>${icons.plus()}</button>
          <button class="kartknapp" aria-label="Zoom ut" @click=${() => this.zoom(-1)}>${icons.minus()}</button>
          <button class="kartknapp" aria-label="Min posisjon" @click=${() => this.locate()}>${icons.locate()}</button>
        </div>
        ${is2d
          ? html`<div class="popwrap popwrap--venstre">
                <button
                  class="kartknapp kartknapp--enkel ${s.popover === "maaling" ? "is-valgt" : ""}"
                  aria-label="Måling"
                  aria-expanded=${s.popover === "maaling"}
                  @click=${() => {
                    if (s.popover === "maaling") this.stopMeasure();
                    togglePopover("maaling");
                  }}
                >
                  ${icons.measure()}
                </button>
                ${s.popover === "maaling" ? this.renderMeasure(elId) : nothing}
              </div>
              <div class="popwrap popwrap--venstre">
                <button
                  class="kartknapp kartknapp--enkel ${s.popover === "utskrift" ? "is-valgt" : ""}"
                  aria-label="Utskrift og eksport"
                  aria-expanded=${s.popover === "utskrift"}
                  @click=${() => togglePopover("utskrift")}
                >
                  ${icons.print()}
                </button>
                ${s.popover === "utskrift"
                  ? html`<div class="popover popover--verktoy" data-popover="utskrift" role="dialog" aria-label="Utskrift">
                      <div class="popover__hode"><h2 class="popover__tittel">Utskrift</h2></div>
                      ${cfg.printUrl
                        ? html`<arcgis-print reference-element=${elId} print-service-url=${cfg.printUrl} hide-header></arcgis-print>`
                        : html`<p class="popover__hint">
                              Utskriftstjenesten i Enterprise er ikke satt opp (VITE_PRINT_URL). Du kan skrive ut kartutsnittet som bilde.
                            </p>
                            <div class="popover__fot"><button class="knapp knapp--primar" @click=${() => this.printScreenshot()}>Skriv ut kartbilde</button></div>`}
                    </div>`
                  : nothing}
              </div>`
          : nothing}
      </div>
      <svv-basemap-picker dim=${this.dim}></svv-basemap-picker>
    `;
  }

  private renderMeasure(elId: string) {
    const avstand = this.maaleModus === "avstand";
    return html`<div class="popover popover--verktoy" data-popover="maaling" role="dialog" aria-label="Måling">
      <div class="popover__hode">
        <h2 class="popover__tittel">Måling</h2>
        <button
          class="ikonknapp"
          aria-label="Lukk måling"
          @click=${() => {
            this.stopMeasure();
            store.set({ popover: null });
          }}
        >
          ${icons.close()}
        </button>
      </div>
      <div class="segment" role="tablist" aria-label="Målemodus">
        ${(["avstand", "areal"] as const).map(
          (m) => html`<button
            role="tab"
            class="segment__valg ${this.maaleModus === m ? "is-valgt" : ""}"
            aria-selected=${this.maaleModus === m}
            @click=${() => {
              this.stopMeasure();
              this.maaleModus = m;
              this.requestUpdate();
            }}
          >
            ${m === "avstand" ? "Avstand" : "Areal"}
          </button>`,
        )}
      </div>
      <div class="maaling">
        ${avstand
          ? html`<arcgis-distance-measurement-2d ${ref(this.maalRef)} reference-element=${elId} unit="metric" hide-start-button></arcgis-distance-measurement-2d>`
          : html`<arcgis-area-measurement-2d ${ref(this.maalRef)} reference-element=${elId} unit="metric" hide-start-button></arcgis-area-measurement-2d>`}
      </div>
      <div class="popover__fot">
        <button class="knapp knapp--sekundar" @click=${() => this.stopMeasure()}>Tøm</button>
        <button class="knapp knapp--primar" @click=${() => this.startMeasure()}>Ny måling</button>
      </div>
    </div>`;
  }
}

/** Bakgrunnskartvelger som miniatyrknapp nederst til høyre. */
export class SvvBasemapPicker extends StoreElement {
  static override properties = { dim: { type: String } };
  declare dim: "2d" | "3d";

  protected override render() {
    const s = this.store.state;
    const { cfg } = services();
    const current = cfg.gdo.basemaps.find((b) => b.id === s.basemap) ?? cfg.gdo.basemaps[0]!;
    const available = hasGdoAccess() && cfg.gdo.basemaps.length > 0;
    return html`<div class="popwrap bakgrunnsvelger">
      <button
        class="bakgrunnsvelger__knapp"
        style="--thumb:${current.thumb}"
        aria-label="Bytt bakgrunnskart – nå ${current.navn} fra Geodata Online"
        aria-expanded=${s.popover === "bakgrunn"}
        @click=${() => togglePopover("bakgrunn")}
      >
        <span class="bakgrunnsvelger__navn">${current.navn}</span>
      </button>
      ${s.popover === "bakgrunn"
        ? html`<div class="popover popover--bakgrunn" data-popover="bakgrunn" role="dialog" aria-label="Bakgrunnskart">
            <div class="popover__hode"><h2 class="popover__tittel">Bakgrunnskart</h2></div>
            ${available
              ? nothing
              : html`<p class="melding melding--info">
                  Geodata Online-token mangler. Legg GDO_USERNAME og GDO_PASSWORD i .env.local for å vise bakgrunnskart i mock-modus.
                </p>`}
            <div class="bakgrunnsgrid" role="radiogroup" aria-label="Velg bakgrunnskart">
              ${cfg.gdo.basemaps.map(
                (b) => html`<button
                  role="radio"
                  aria-checked=${b.id === s.basemap}
                  class="bakgrunnskort ${b.id === s.basemap ? "is-valgt" : ""}"
                  @click=${() => store.set({ basemap: b.id as BasemapId, popover: null })}
                >
                  <span class="bakgrunnskort__bilde" style="background:${b.thumb}"></span>
                  <span class="bakgrunnskort__tekst"><strong>${b.navn}</strong><span>Geodata Online</span></span>
                </button>`,
              )}
            </div>
            <p class="popover__hint">I produksjon hentes kartene via portalens bakgrunnskartgruppe (token håndteres av ArcGIS Enterprise).</p>
          </div>`
        : nothing}
    </div>`;
  }
}

customElements.define("svv-map-controls", SvvMapControls);
customElements.define("svv-basemap-picker", SvvBasemapPicker);
