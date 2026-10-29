import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer.js";
import { html, nothing } from "lit";
import { hasGdoAccess } from "../map/basemaps.ts";
import { formatHeight, formatScale, formatUtm } from "../map/coords.ts";
import { onMapContext, type MapContext } from "../map/map-context.ts";
import { services } from "../services.ts";
import { LightElement } from "./base.ts";

/** Koordinatlinje: målestokk, UTM33-koordinater, NN2000-høyde og kildeangivelse. */
export class SvvCoordBar extends LightElement {
  static override properties = { dim: { type: String } };
  declare dim: "2d" | "3d";

  private x: number | null = null;
  private y: number | null = null;
  private z: number | null = null;
  private scale = 0;
  private ctx: MapContext | null = null;
  private handles: { remove(): void }[] = [];
  private unsub: (() => void) | null = null;
  private elevation: ElevationLayer | null = null;
  private zTimer = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    if (hasGdoAccess()) this.elevation = new ElevationLayer({ url: services().cfg.gdo.elevationUrl });
    this.unsub = onMapContext((c) => this.attach(c));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsub?.();
    this.handles.forEach((h) => h.remove());
  }

  private attach(c: MapContext | null) {
    this.handles.forEach((h) => h.remove());
    this.handles = [];
    this.ctx = c;
    if (!c || c.dim !== this.dim) return;
    const view = c.view;
    const center = view.center;
    if (center) {
      this.x = center.x;
      this.y = center.y;
    }
    this.handles.push(
      reactiveUtils.watch(
        () => view.scale,
        (s) => {
          this.scale = s;
          this.requestUpdate();
        },
        { initial: true },
      ),
      view.on("pointer-move", (e) => {
        const p = view.toMap({ x: e.x, y: e.y });
        if (!p) return;
        this.x = p.x;
        this.y = p.y;
        this.z = p.hasZ ? p.z ?? null : this.z;
        this.requestUpdate();
        if (this.dim === "2d" && this.elevation) {
          clearTimeout(this.zTimer);
          this.zTimer = window.setTimeout(async () => {
            try {
              const r = await this.elevation!.queryElevation(p, { returnSampleInfo: false });
              this.z = r.geometry.z ?? null;
              this.requestUpdate();
            } catch {
              this.z = null;
            }
          }, 250);
        }
      }),
    );
    this.requestUpdate();
  }

  protected override render() {
    const gdo = hasGdoAccess() || services().data.mode === "portal";
    return html`<div class="koordlinje">
      ${this.ctx?.dim === "2d" && this.dim === "2d"
        ? html`<arcgis-scale-bar reference-element=${this.ctx.elementId} unit="metric" bar-style="line"></arcgis-scale-bar>`
        : nothing}
      <span class="koordlinje__skala">${this.scale ? formatScale(this.scale) : ""}</span>
      <span class="koordlinje__koord"
        >EUREF89 UTM33 · ${this.x != null && this.y != null ? formatUtm(this.x, this.y) : "–"} · ${formatHeight(this.z)}</span
      >
      <span class="koordlinje__kilde">
        ${gdo ? "Bakgrunn: © Geodata Online" : "Bakgrunn: mangler Geodata Online-tilgang"} · Vegnett: NVDB (NLOD)
      </span>
    </div>`;
  }
}

customElements.define("svv-coord-bar", SvvCoordBar);
