import { html, nothing } from "lit";
import { formatUtm } from "../map/coords.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "./base.ts";
import { icons } from "./icons.ts";

/** Resultat av klikk i temalag fra Geodata Online (identify). */
export class SvvTemaPanel extends StoreElement {
  protected override render() {
    const t = this.store.state.temaTreff;
    if (!t) return nothing;
    const perTema = new Map<string, typeof t.treff>();
    for (const x of t.treff) perTema.set(x.tema, [...(perTema.get(x.tema) ?? []), x]);
    return html`<aside class="objektpanel" aria-labelledby="tema-tittel">
      <div class="objektpanel__topp">
        <div class="objektpanel__sti">
          <nav aria-label="Kilde" class="sti"><span>Geodata Online</span><span aria-hidden="true">›</span><span>Temalag</span></nav>
          <span class="objektpanel__fyll"></span>
          <button class="ikonknapp" aria-label="Lukk temapanel" @click=${() => store.set({ temaTreff: null })}>${icons.close()}</button>
        </div>
        <h2 id="tema-tittel" class="objektpanel__tittel">Temainformasjon</h2>
        <div class="objektpanel__undertittel">${formatUtm(t.x, t.y)}</div>
      </div>
      <div class="objektpanel__fane">
        ${[...perTema.entries()].map(
          ([tema, liste]) => html`<section class="egenskaper">
            <h3 class="kategori">${tema.toUpperCase()}</h3>
            ${liste.map(
              (x) => html`<h4 class="tema__lag">${x.lag}</h4>
                <dl>
                  ${x.attributter.map(([k, v]) => html`<div class="egenskaper__rad"><dt>${k}</dt><dd>${v}</dd></div>`)}
                </dl>`,
            )}
          </section>`,
        )}
        <p class="sekundar liten">Kilde: Geodata Online. Feltnavn vises slik de er i tjenesten.</p>
      </div>
    </aside>`;
  }
}

customElements.define("svv-tema-panel", SvvTemaPanel);
