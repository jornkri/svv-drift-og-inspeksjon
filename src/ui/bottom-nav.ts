import { html, nothing, type TemplateResult } from "lit";
import { navigate } from "../state/router.ts";
import type { Route } from "../state/store.ts";
import { StoreElement } from "./base.ts";
import { icons } from "./icons.ts";

const ITEMS: { route: Route; label: string; icon: () => TemplateResult }[] = [
  { route: "kart", label: "Kart", icon: () => html`${icons.map(22)}` },
  { route: "oppgaver", label: "Oppgaver", icon: () => html`${icons.tasks(22)}` },
  { route: "verktoy", label: "Verktøy", icon: () => html`${icons.measure(22)}` },
  { route: "meg", label: "Meg", icon: () => html`${icons.user(22)}` },
];

/** Bunnmeny på mobil: Kart, Oppgaver, Verktøy og Meg. */
export class SvvBottomNav extends StoreElement {
  protected override render() {
    const r = this.store.state.route === "3d" ? "kart" : this.store.state.route;
    return html`<nav class="bunnmeny" aria-label="Hovedmeny">
      ${ITEMS.map(
        (i) => html`<a
          href="#/${i.route}"
          class="bunnmeny__lenke ${r === i.route ? "is-aktiv" : ""}"
          aria-current=${r === i.route ? "page" : nothing}
          @click=${(e: Event) => {
            e.preventDefault();
            navigate(i.route);
          }}
          >${i.icon()}<span>${i.label}</span></a
        >`,
      )}
    </nav>`;
  }
}

customElements.define("svv-bottom-nav", SvvBottomNav);
