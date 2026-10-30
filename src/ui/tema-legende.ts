import * as symbolUtils from "@arcgis/core/symbols/support/symbolUtils.js";
import { html, nothing } from "lit";
import type { TemalagDef } from "../config.ts";
import { hentTemaLegende, type TemaLegende } from "../map/tema-legende.ts";
import { LightElement } from "./base.ts";

/** Så mange poster vises direkte; flere legges i en sammenleggbar liste. */
const MAKS_APEN = 8;

/**
 * Tegnforklaring for ett temalag: bilder fra tjenestens /legend (MapServer) eller symboler fra
 * rendereren (feature-lag). Kompakt i lagpanelet, fullstendig i fanen Tegnforklaring.
 */
export class SvvTemaLegende extends LightElement {
  static override properties = { def: { attribute: false }, kompakt: { type: Boolean } };
  declare def: TemalagDef;
  declare kompakt: boolean;
  private legende: TemaLegende | null = null;
  private symboler = new Map<unknown, HTMLElement>();
  private lastetFor: string | null = null;

  protected override willUpdate(): void {
    if (this.def && this.def.id !== this.lastetFor) {
      this.lastetFor = this.def.id;
      this.legende = null;
      void this.last(this.def);
    }
  }

  private async last(def: TemalagDef) {
    const l = await hentTemaLegende(def);
    // Symboler fra rendereren tegnes som små forhåndsvisninger
    for (const g of l.grupper) {
      for (const p of g.poster) {
        if (p.symbol && !this.symboler.has(p)) {
          const el = await symbolUtils.renderPreviewHTML(p.symbol as never, { size: { width: 20, height: 20 } }).catch(() => null);
          if (el) this.symboler.set(p, el as HTMLElement);
        }
      }
    }
    if (this.def?.id !== def.id) return;
    this.legende = l;
    this.requestUpdate();
  }

  private poster(l: TemaLegende) {
    const flereGrupper = l.grupper.length > 1;
    // Lag med ett symbol vises som én rad (lagnavnet er da etiketten), uten egen overskrift
    return l.grupper.map(
      (g) => html`${flereGrupper && g.poster.length > 1 ? html`<p class="temalegende__gruppe">${g.tittel}</p>` : nothing}
        <ul class="temalegende__liste">
          ${g.poster.map(
            (p) => html`<li class="temalegende__rad">
              <span class="temalegende__symbol" aria-hidden="true">${p.bilde ? html`<img src=${p.bilde} alt="" />` : (this.symboler.get(p) ?? nothing)}</span>
              <span>${g.poster.length === 1 && flereGrupper ? g.tittel : p.etikett}</span>
            </li>`,
          )}
        </ul>`,
    );
  }

  protected override render() {
    const l = this.legende;
    if (!l) return html`<p class="temalegende__laster" role="status">Laster tegnforklaring …</p>`;
    if (!l.grupper.length) return l.merknad ? html`<p class="temalegende__merknad">${l.merknad}</p>` : nothing;
    const antall = l.grupper.reduce((n, g) => n + g.poster.length, 0);
    if (antall > MAKS_APEN || (this.kompakt && antall > 4)) {
      return html`<details class="temalegende">
        <summary>Tegnforklaring (${antall})</summary>
        ${this.poster(l)}
      </details>`;
    }
    return html`<div class="temalegende">${this.poster(l)}</div>`;
  }
}

customElements.define("svv-tema-legende", SvvTemaLegende);
