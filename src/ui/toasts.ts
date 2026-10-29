import { html } from "lit";
import { store } from "../state/store.ts";
import { StoreElement } from "./base.ts";
import { icons } from "./icons.ts";

/** Korte meldinger nederst på skjermen (live region for skjermlesere). */
export class SvvToasts extends StoreElement {
  protected override render() {
    const m = this.store.state.meldinger;
    return html`<div class="toasts" role="status" aria-live="polite">
      ${m.map(
        (x) => html`<div class="toast toast--${x.type}">
          <span>${x.tekst}</span>
          <button
            class="ikonknapp ikonknapp--liten"
            aria-label="Lukk melding"
            @click=${() => store.set((s) => ({ meldinger: s.meldinger.filter((y) => y.id !== x.id) }))}
          >
            ${icons.close(16)}
          </button>
        </div>`,
      )}
    </div>`;
  }
}

customElements.define("svv-toasts", SvvToasts);
