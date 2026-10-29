import { html, nothing } from "lit";
import { store, type Route } from "./state/store.ts";
import { StoreElement } from "./ui/base.ts";
import "./ui/topbar.ts";
import "./ui/toasts.ts";
import "./ui/bottom-nav.ts";
import "./views/map-view.ts";

const MOBILE = window.matchMedia("(max-width: 768px)");

/** Visningene lastes ved behov. Nøkkelen er rute + layout. */
const LOADERS: Record<string, () => Promise<unknown>> = {
  "kart-kontor": async () => undefined,
  "kart-felt": () => import("./field/ui/field-map.ts"),
  "3d-kontor": () => import("./views/scene-view.ts"),
  "3d-felt": () => import("./views/scene-view.ts"),
  "oppgaver-kontor": () => import("./views/tasks-view.ts"),
  "oppgaver-felt": () => import("./field/ui/my-tasks.ts"),
  "inspeksjon-kontor": () => import("./field/ui/inspection-form.ts"),
  "inspeksjon-felt": () => import("./field/ui/inspection-form.ts"),
  "verktoy-felt": () => import("./field/ui/field-pages.ts"),
  "verktoy-kontor": () => import("./field/ui/field-pages.ts"),
  "meg-felt": () => import("./field/ui/field-pages.ts"),
  "meg-kontor": () => import("./field/ui/field-pages.ts"),
};

export class SvvApp extends StoreElement {
  private mobile = MOBILE.matches;
  private loaded = new Set<string>(["kart-kontor"]);

  override connectedCallback(): void {
    super.connectedCallback();
    MOBILE.addEventListener("change", this.onMedia);
    void import("./field/sync-setup.ts").then((m) => m.startSync());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    MOBILE.removeEventListener("change", this.onMedia);
  }

  private onMedia = (e: MediaQueryListEvent) => {
    this.mobile = e.matches;
    this.requestUpdate();
  };

  private key(route: Route): string {
    return `${route}-${this.store.state.felt || this.mobile ? "felt" : "kontor"}`;
  }

  private failed = new Set<string>();
  private pending = new Set<string>();

  private ensureLoaded(key: string): boolean {
    if (this.loaded.has(key)) return true;
    if (this.pending.has(key) || this.failed.has(key)) return false;
    this.pending.add(key);
    void (LOADERS[key]?.() ?? Promise.resolve())
      .then(() => this.loaded.add(key))
      .catch((e) => {
        console.error(`Kunne ikke laste visningen ${key}`, e);
        this.failed.add(key);
      })
      .finally(() => {
        this.pending.delete(key);
        this.requestUpdate();
      });
    return false;
  }

  private renderRoute(route: Route, felt: boolean) {
    const key = this.key(route);
    if (!this.ensureLoaded(key)) {
      return this.failed.has(key)
        ? html`<div class="laster" role="alert">
            <p>Visningen kunne ikke lastes. Sjekk nettforbindelsen.</p>
            <button class="knapp knapp--primar" @click=${() => location.reload()}>Prøv igjen</button>
          </div>`
        : html`<div class="laster" role="status">Laster …</div>`;
    }
    switch (route) {
      case "kart":
        return felt ? html`<svv-field-map></svv-field-map>` : html`<svv-map-view></svv-map-view>`;
      case "3d":
        return html`<svv-scene-view></svv-scene-view>`;
      case "oppgaver":
        return felt ? html`<svv-my-tasks></svv-my-tasks>` : html`<svv-tasks-view></svv-tasks-view>`;
      case "inspeksjon":
        return html`<svv-inspection-form></svv-inspection-form>`;
      case "verktoy":
        return html`<svv-field-tools></svv-field-tools>`;
      case "meg":
        return html`<svv-field-me></svv-field-me>`;
    }
  }

  protected override render() {
    const { route } = this.store.state;
    const felt = this.store.state.felt || this.mobile;
    return html`
      <a class="hopp-til" href="#hovedinnhold">Hopp til hovedinnhold</a>
      <div class="app ${felt ? "app--felt" : "app--kontor"}">
        ${felt ? nothing : html`<svv-topbar></svv-topbar>`}
        <main id="hovedinnhold" class="app__main" tabindex="-1">${this.renderRoute(route, felt)}</main>
        ${felt && route !== "inspeksjon" ? html`<svv-bottom-nav></svv-bottom-nav>` : nothing}
      </div>
      <svv-toasts></svv-toasts>
    `;
  }
}

customElements.define("svv-app", SvvApp);

declare global {
  interface HTMLElementTagNameMap {
    "svv-app": SvvApp;
  }
}

// Tilgjengelig for feilsøking i konsollen
(window as unknown as { svvStore: typeof store }).svvStore = store;
