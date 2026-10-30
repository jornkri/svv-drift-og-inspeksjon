import { html, nothing } from "lit";
import { signOut } from "../auth/auth.ts";
import { services } from "../services.ts";
import { navigate } from "../state/router.ts";
import { store } from "../state/store.ts";
import { ensureTasks } from "../tasks/task-store.ts";
import { dueClass, isOpen } from "../tasks/tasks.ts";
import { StoreElement } from "./base.ts";
import { icons } from "./icons.ts";
import "./search-box.ts";

type Menu = "prosjekt" | "varsler" | "bruker" | null;

/** Mørk toppstripe: logo, prosjektvelger, søk, meny, varsler og bruker. */
export class SvvTopbar extends StoreElement {
  private menu: Menu = null;

  override connectedCallback(): void {
    super.connectedCallback();
    void ensureTasks();
    document.addEventListener("click", this.onDocClick);
    document.addEventListener("keydown", this.onKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("click", this.onDocClick);
    document.removeEventListener("keydown", this.onKey);
  }

  private onDocClick = (e: MouseEvent) => {
    if (this.menu && !(e.target as HTMLElement).closest(".topbar__meny-wrap")) this.setMenu(null);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.menu) this.setMenu(null);
  };

  private setMenu(m: Menu) {
    this.menu = m;
    this.requestUpdate();
  }

  private toggle(m: Menu) {
    return (e: Event) => {
      e.stopPropagation();
      this.setMenu(this.menu === m ? null : m);
    };
  }

  protected override render() {
    const { cfg, data } = services();
    const s = this.store.state;
    const today = new Date();
    const mine = s.oppgaver.filter((o) => o.tildelt === data.user.navn && isOpen(o));
    const varsler = mine.filter((o) => ["over", "idag"].includes(dueClass(o, today)));
    const link = (route: "kart" | "oppgaver" | "oversikt", label: string, extra: unknown = nothing) => html`
      <a
        class="topbar__lenke ${s.route === route || (route === "kart" && s.route === "3d") ? "is-aktiv" : ""}"
        href="#/${route}"
        aria-current=${s.route === route ? "page" : nothing}
        @click=${(e: Event) => {
          e.preventDefault();
          navigate(route);
        }}
        >${label}${extra}</a
      >
    `;

    return html`
      <header class="topbar">
        <div class="topbar__merke">
          <img class="topbar__logo" src="/svv-merke.svg" alt="Statens vegvesen" width="43" height="30" />
          <span class="topbar__app">Drift og inspeksjon</span>
        </div>
        <span class="topbar__skille" aria-hidden="true"></span>

        <div class="topbar__meny-wrap">
          <button
            class="topbar__prosjekt"
            aria-haspopup="true"
            aria-expanded=${this.menu === "prosjekt"}
            @click=${this.toggle("prosjekt")}
          >
            <span class="visually-hidden">Prosjekt:</span>
            <strong>${cfg.prosjekt.navn}</strong>${icons.chevronDown()}
          </button>
          ${this.menu === "prosjekt"
            ? html`<div class="meny" role="menu" aria-label="Velg prosjekt">
                <button class="meny__valg is-valgt" role="menuitemradio" aria-checked="true" @click=${() => this.setMenu(null)}>
                  ${icons.check()} ${cfg.prosjekt.navn}
                </button>
                <p class="meny__hint">Flere prosjekter vises når du har tilgang til dem i portalen.</p>
              </div>`
            : nothing}
        </div>

        <svv-search-box class="topbar__sok"></svv-search-box>

        <nav class="topbar__nav" aria-label="Hovedmeny">
          ${link("kart", "Kart")}
          ${link("oppgaver", "Oppgaver", mine.length ? html` <span class="teller" aria-label="${mine.length} åpne">${mine.length}</span>` : nothing)}
          ${link("oversikt", "Oversikt")}
        </nav>

        <div class="topbar__meny-wrap">
          <button
            class="topbar__ikon"
            aria-label=${`Varsler${varsler.length ? ` (${varsler.length} nye)` : ""}`}
            aria-haspopup="true"
            aria-expanded=${this.menu === "varsler"}
            @click=${this.toggle("varsler")}
          >
            ${icons.bell()}${varsler.length ? html`<span class="topbar__prikk" aria-hidden="true"></span>` : nothing}
          </button>
          ${this.menu === "varsler"
            ? html`<div class="meny meny--hoyre" role="dialog" aria-label="Varsler">
                <h2 class="meny__tittel">Varsler</h2>
                ${varsler.length
                  ? varsler.map(
                      (o) => html`<button
                        class="meny__valg meny__valg--to"
                        @click=${() => {
                          store.set({ oppgaveValgt: o.oppgave_id });
                          navigate("oppgaver");
                          this.setMenu(null);
                        }}
                      >
                        <strong>${o.oppgave_id} · ${o.tittel}</strong>
                        <span>${dueClass(o, today) === "over" ? "Over frist" : "Frist i dag"}</span>
                      </button>`,
                    )
                  : html`<p class="meny__hint">Ingen nye varsler.</p>`}
              </div>`
            : nothing}
        </div>

        <div class="topbar__meny-wrap">
          <button
            class="topbar__bruker"
            aria-label=${`${data.user.initialer} – brukermeny for ${data.user.navn}`}
            aria-haspopup="true"
            aria-expanded=${this.menu === "bruker"}
            @click=${this.toggle("bruker")}
          >
            ${data.user.initialer}
          </button>
          ${this.menu === "bruker"
            ? html`<div class="meny meny--hoyre" role="menu" aria-label="Brukermeny">
                <p class="meny__hint"><strong>${data.user.navn}</strong><br />${data.mode === "mock" ? "Mock-modus (uten portal)" : data.user.brukernavn}</p>
                <button class="meny__valg" role="menuitem" @click=${() => signOut(cfg)}>${icons.logout(18)} Logg ut</button>
              </div>`
            : nothing}
        </div>
      </header>
    `;
  }
}

customElements.define("svv-topbar", SvvTopbar);
