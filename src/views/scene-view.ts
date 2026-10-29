import "@arcgis/map-components/components/arcgis-scene";
import "@arcgis/map-components/components/arcgis-slice";
import "@arcgis/map-components/components/arcgis-direct-line-measurement-3d";
import "@arcgis/map-components/components/arcgis-elevation-profile";
import "@arcgis/map-components/components/arcgis-line-of-sight";
import Ground from "@arcgis/core/Ground.js";
import EsriMap from "@arcgis/core/Map.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import Extent from "@arcgis/core/geometry/Extent.js";
import Point from "@arcgis/core/geometry/Point.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer.js";
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import type SceneView from "@arcgis/core/views/SceneView.js";
import type { ArcgisScene } from "@arcgis/map-components/components/arcgis-scene";
import { html, nothing } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { createBasemap, hasGdoAccess } from "../map/basemaps.ts";
import { setMapContext } from "../map/map-context.ts";
import { ObjectLayerController } from "../map/object-layers.ts";
import { NvdbObjekterLayer } from "../map/nvdb-objekter-layer.ts";
import { services } from "../services.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "../ui/base.ts";
import { icons } from "../ui/icons.ts";
import "../ui/filter-bar.ts";
import "../ui/layer-panel.ts";
import "../ui/map-controls.ts";
import "../ui/object-panel.ts";
import "../ui/nvdb-panel.ts";

const SCENE_ID = "kart-3d";

type Verktoy = "naviger" | "snitt" | "maal" | "profil" | "sikt";
const VERKTOY: { id: Verktoy; navn: string }[] = [
  { id: "naviger", navn: "Naviger" },
  { id: "snitt", navn: "Snitt" },
  { id: "maal", navn: "Mål 3D" },
  { id: "profil", navn: "Høydeprofil" },
  { id: "sikt", navn: "Siktlinje" },
];

type AnalysisEl = HTMLElement & { start(): Promise<void>; clear(): Promise<void> };

/**
 * Kontor: 3D-scene. Lokal scene i EUREF89 UTM33 (samme koordinatsystem og Geodata Online-cache
 * som 2D, ingen omprojisering av fagmodeller, ekte meter og NN2000-høyder, og klipping av
 * prosjektområdet). Terreng fra Geodata Online (GeocacheTerreng, UTM33).
 */
export class SvvSceneView extends StoreElement {
  private view: SceneView | null = null;
  private objects: ObjectLayerController | null = null;
  private nvdb: NvdbObjekterLayer | null = null;
  private sceneLayers: { navn: string; layer: SceneLayer }[] = [];
  private fagmodeller: string[] = [];
  private verktoy: Verktoy = "naviger";
  private underBakken = true;
  private terrengGjennomsiktig = 40;
  private vegGjennomsiktig = 0;
  private harTerreng = false;
  private kamera = { hoyde: 0, tilt: 0 };
  private handles: { remove(): void }[] = [];
  private unsubs: (() => void)[] = [];
  private verktoyRef = createRef<AnalysisEl>();
  private disposed = false;

  override connectedCallback(): void {
    super.connectedCallback();
    // Terrengpanelet tar venstre side i 3D – lagpanelet åpnes ved behov
    store.set({ layerPanelOpen: false });
  }

  protected override firstUpdated(): void {
    void this.init();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.disposed = true;
    this.handles.forEach((h) => h.remove());
    this.unsubs.forEach((u) => u());
    this.objects?.destroy();
    this.nvdb?.detach();
    setMapContext(null);
  }

  private async init() {
    const { cfg, data } = services();
    const el = this.querySelector<ArcgisScene>("arcgis-scene")!;
    await customElements.whenDefined("arcgis-scene");

    const gdo = hasGdoAccess() || data.mode === "portal";
    this.harTerreng = gdo;
    const def = cfg.gdo.basemaps.find((b) => b.id === store.get().basemap) ?? cfg.gdo.basemaps[0]!;
    const ground = new Ground({
      layers: gdo ? [new ElevationLayer({ url: cfg.gdo.elevationUrl })] : [],
      navigationConstraint: { type: this.underBakken ? "none" : "stay-above" },
      opacity: gdo ? 1 - this.terrengGjennomsiktig / 100 : 0,
    });
    const map = new EsriMap({ ...(gdo ? { basemap: createBasemap(def, "3d") } : {}), ground });

    // Fagmodeller fra IFC/BIM som i3s-scenelag (portal), ellers fagmodellene i objektlagene
    this.sceneLayers = cfg.sceneLayers.map((s) => ({ navn: s.navn, layer: new SceneLayer({ url: s.url, title: s.navn }) }));
    map.addMany(this.sceneLayers.map((s) => s.layer));

    const [cx, cy] = cfg.prosjekt.senter;
    el.viewingMode = "local";
    el.spatialReference = new SpatialReference({ wkid: cfg.wkid });
    el.clippingArea = new Extent({ xmin: cx - 1500, ymin: cy - 1500, xmax: cx + 1500, ymax: cy + 1500, spatialReference: { wkid: cfg.wkid } });
    el.map = map;
    el.camera = {
      position: new Point({ x: cx + 380, y: cy - 520, z: 520, spatialReference: { wkid: cfg.wkid } }),
      heading: 330,
      tilt: 62,
    } as never;
    await el.viewOnReady();
    if (this.disposed) return;
    const view = (this.view = el.view as SceneView);
    view.environment = { background: { type: "color", color: [230, 241, 245, 1] }, starsEnabled: false, atmosphereEnabled: false } as never;

    this.objects = new ObjectLayerController(view, "3d", data);
    await this.objects.start();
    const nvdb = (this.nvdb = new NvdbObjekterLayer(cfg, "3d"));
    map.add(nvdb.group);
    nvdb.attach(view);
    this.fagmodeller = [...new Set((await data.objectStats()).map((s) => s.fagmodell).filter((x): x is string => !!x))];
    setMapContext({ dim: "3d", elementId: SCENE_ID, view, objects: this.objects });

    this.handles.push(
      view.on("click", async (e) => {
        if (this.verktoy !== "naviger" || !this.objects) return;
        const ids = await this.objects.hitTest(e);
        if (ids.length) {
          store.set({ selection: { globalids: ids, index: 0 }, nvdbValgt: null, popover: null });
          return;
        }
        const treff = (await view.hitTest(e, { include: nvdb.layers })).results.find((r) => r.type === "graphic");
        const a = treff && "graphic" in treff ? treff.graphic.attributes : null;
        store.set({ selection: null, nvdbValgt: a ? { typeId: a.type_id as number, id: a.nvdb_id as number } : null, popover: null });
      }),
      reactiveUtils.watch(
        () => view.camera,
        (c) => {
          if (!c) return;
          this.kamera = { hoyde: Math.round(c.position.z ?? 0), tilt: Math.round(c.tilt) };
          this.requestUpdate();
        },
        { initial: true },
      ),
    );
    this.unsubs.push(store.select((s) => s.zoomTil, () => void this.consumeZoom()));
    void this.consumeZoom();
    this.applyVegOpacity();
    this.setAttribute("data-klar", "");
    this.requestUpdate();
  }

  private async consumeZoom() {
    const id = store.get().zoomTil;
    if (!id || !this.view) return;
    store.set({ zoomTil: null });
    const hit = await services().data.getObject(id);
    if (!hit) return;
    const ext = hit.geometry.extent;
    const target = ext ? ext.clone().expand(3) : hit.geometry;
    await this.view.goTo({ target, tilt: 65 } as never, { duration: 800 }).catch(() => undefined);
  }

  private applyVegOpacity() {
    const o = 1 - this.vegGjennomsiktig / 100;
    for (const h of this.objects?.handles ?? []) if (h.fag === "Veg") h.layer.opacity = o;
    for (const s of this.sceneLayers) if (/veg/i.test(s.navn)) s.layer.opacity = o;
  }

  private setGround() {
    const g = this.view?.map?.ground;
    if (!g) return;
    g.navigationConstraint = { type: this.underBakken ? "none" : "stay-above" } as never;
    g.opacity = this.harTerreng ? 1 - this.terrengGjennomsiktig / 100 : 0;
  }

  private async velgVerktoy(v: Verktoy) {
    await this.verktoyRef.value?.clear().catch(() => undefined);
    this.verktoy = v;
    this.requestUpdate();
    if (v === "naviger") return;
    await this.updateComplete;
    await this.verktoyRef.value?.start().catch(() => undefined);
  }

  protected override render() {
    const s = this.store.state;
    const skjulte = new Set(s.filters.skjulteFagmodeller);
    return html`
      <div class="kartflate">
        <div class="kartflate__kart kartflate__kart--3d">
          <arcgis-scene id=${SCENE_ID} popup-disabled aria-label="3D-scene over ${services().cfg.prosjekt.navn}"></arcgis-scene>
          <svv-filter-bar></svv-filter-bar>
          ${s.layerPanelOpen ? html`<svv-layer-panel></svv-layer-panel>` : nothing}
          <svv-map-controls dim="3d"></svv-map-controls>

          <div class="verktoylinje" role="toolbar" aria-label="3D-verktøy">
            ${VERKTOY.map(
              (v) => html`<button class="verktoylinje__knapp ${this.verktoy === v.id ? "is-valgt" : ""}" aria-pressed=${this.verktoy === v.id} @click=${() => this.velgVerktoy(v.id)}>
                ${v.navn}
              </button>`,
            )}
          </div>

          <section class="terrengpanel" aria-labelledby="terreng-tittel">
            <h2 id="terreng-tittel">Under terreng</h2>
            <label class="avkrysning">
              <input
                type="checkbox"
                .checked=${this.underBakken}
                @change=${() => {
                  this.underBakken = !this.underBakken;
                  this.setGround();
                  this.requestUpdate();
                }}
              />
              Naviger under bakken
            </label>
            <label class="glider">
              <span class="glider__etikett"><span>Gjennomsiktig terreng</span><strong>${this.terrengGjennomsiktig} %</strong></span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                .value=${String(this.terrengGjennomsiktig)}
                ?disabled=${!this.harTerreng}
                @input=${(e: Event) => {
                  this.terrengGjennomsiktig = Number((e.target as HTMLInputElement).value);
                  this.setGround();
                  this.requestUpdate();
                }}
              />
            </label>
            <label class="glider">
              <span class="glider__etikett"><span>Gjennomsiktig vegmodell</span><strong>${this.vegGjennomsiktig} %</strong></span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                .value=${String(this.vegGjennomsiktig)}
                @input=${(e: Event) => {
                  this.vegGjennomsiktig = Number((e.target as HTMLInputElement).value);
                  this.applyVegOpacity();
                  this.requestUpdate();
                }}
              />
            </label>
            ${this.harTerreng ? nothing : html`<p class="melding melding--info">Terreng krever Geodata Online-tilgang. Objektene vises i riktig høyde (NN2000).</p>`}
            <fieldset class="fagmodeller">
              <legend class="kategori">${this.sceneLayers.length ? "FAGMODELLER (I3S)" : "FAGMODELLER"}</legend>
              ${this.sceneLayers.length
                ? this.sceneLayers.map(
                    (sl) => html`<label class="avkrysning avkrysning--tett">
                      <input
                        type="checkbox"
                        .checked=${sl.layer.visible}
                        @change=${() => {
                          sl.layer.visible = !sl.layer.visible;
                          this.requestUpdate();
                        }}
                      />
                      ${sl.navn}
                    </label>`,
                  )
                : this.fagmodeller.map(
                    (m) => html`<label class="avkrysning avkrysning--tett">
                      <input
                        type="checkbox"
                        .checked=${!skjulte.has(m)}
                        @change=${() =>
                          store.setFilters({
                            skjulteFagmodeller: skjulte.has(m) ? [...skjulte].filter((x) => x !== m) : [...skjulte, m],
                          })}
                      />
                      ${m}
                    </label>`,
                  )}
            </fieldset>
          </section>

          ${this.verktoy !== "naviger" ? this.renderVerktoy() : nothing}

          <div class="koordlinje">
            <span>Kamera: høyde ${this.kamera.hoyde.toLocaleString("nb-NO")} m · tilt ${this.kamera.tilt}°</span>
            <span>EUREF89 UTM33 · NN2000 · lokal scene</span>
            <span class="koordlinje__kilde">Terreng: ${this.harTerreng ? "Geodata Online høydemodell" : "mangler"} · BIM: ${this.sceneLayers.length ? "i3s fra IFC" : "objektlag"}</span>
          </div>
        </div>
        ${s.selection
          ? html`<svv-object-panel dim="3d"></svv-object-panel>`
          : s.nvdbValgt
            ? html`<svv-nvdb-panel></svv-nvdb-panel>`
            : nothing}
      </div>
    `;
  }

  private renderVerktoy() {
    const navn = VERKTOY.find((v) => v.id === this.verktoy)!.navn;
    return html`<section class="verktoypanel" aria-label=${navn}>
      <div class="popover__hode">
        <h2 class="popover__tittel">${navn}</h2>
        <button class="ikonknapp" aria-label="Lukk ${navn.toLowerCase()}" @click=${() => this.velgVerktoy("naviger")}>${icons.close()}</button>
      </div>
      <div class="verktoypanel__innhold">
        ${this.verktoy === "snitt" ? html`<arcgis-slice ${ref(this.verktoyRef)} reference-element=${SCENE_ID}></arcgis-slice>` : nothing}
        ${this.verktoy === "maal"
          ? html`<arcgis-direct-line-measurement-3d ${ref(this.verktoyRef)} reference-element=${SCENE_ID} unit="metric"></arcgis-direct-line-measurement-3d>`
          : nothing}
        ${this.verktoy === "profil" ? html`<arcgis-elevation-profile ${ref(this.verktoyRef)} reference-element=${SCENE_ID}></arcgis-elevation-profile>` : nothing}
        ${this.verktoy === "sikt" ? html`<arcgis-line-of-sight ${ref(this.verktoyRef)} reference-element=${SCENE_ID}></arcgis-line-of-sight>` : nothing}
      </div>
    </section>`;
  }
}

customElements.define("svv-scene-view", SvvSceneView);
