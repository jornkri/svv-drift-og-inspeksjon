import { html, nothing } from "lit";
import { kanLoggeUt, signOut } from "../../auth/auth.ts";
import { apneNavnDialog } from "../../auth/navn.ts";
import { services } from "../../services.ts";
import { navigate } from "../../state/router.ts";
import { store } from "../../state/store.ts";
import { StoreElement } from "../../ui/base.ts";
import { icons } from "../../ui/icons.ts";
import { isSimGps } from "../field-runtime.ts";
import { inspectionSync } from "../sync-setup.ts";

/** Felt: Verktøy */
export class SvvFieldTools extends StoreElement {
  protected override render() {
    const s = this.store.state;
    return html`<div class="feltside">
      <h1>Verktøy</h1>
      <ul class="feltliste">
        <li>
          <button class="feltliste__valg" @click=${() => navigate("3d")}>${icons.cube(22)}<span><strong>3D-visning</strong><span>Se objekter under bakken</span></span></button>
        </li>
        <li>
          <button
            class="feltliste__valg"
            @click=${() => {
              store.set({ layerPanelOpen: true });
              navigate("kart");
            }}
          >
            ${icons.layers(22)}<span><strong>Lag og tegnforklaring</strong><span>Slå fag og objekttyper av og på</span></span>
          </button>
        </li>
        <li>
          <a class="feltliste__valg" href=${isSimGps() ? location.pathname + location.hash : `${location.pathname}?simgps=1${location.hash}`}>
            ${icons.locate(22)}<span><strong>${isSimGps() ? "Slå av simulert GPS" : "Simulert GPS"}</strong><span>Gå en rute langs E45 Kløfta for testing</span></span>
          </a>
        </li>
      </ul>
      <fieldset class="bakgrunnsvalg">
        <legend class="felt__etikett">Bakgrunnskart (Geodata Online)</legend>
        ${services().cfg.gdo.basemaps.map(
          (b) => html`<label class="valgrad">
            <input type="radio" name="bakgrunn" .checked=${s.basemap === b.id} @change=${() => store.set({ basemap: b.id })} />
            <span class="valgrad__farge" style="background:${b.thumb}"></span>
            <span class="valgrad__navn">${b.navn}</span>
          </label>`,
        )}
      </fieldset>
    </div>`;
  }
}

/** Felt: Meg – bruker, tilkobling og kø */
export class SvvFieldMe extends StoreElement {
  protected override render() {
    const s = this.store.state;
    const { data, cfg } = services();
    return html`<div class="feltside">
      <h1>Meg</h1>
      <div class="profil">
        <span class="profil__initialer" aria-hidden="true">${data.user.initialer}</span>
        <div><strong>${data.user.navn}</strong><br /><span class="sekundar">${data.mode === "mock" ? "Mock-modus (uten portal)" : data.user.brukernavn}</span></div>
      </div>
      <section class="statusboks ${s.online ? "statusboks--ok" : "statusboks--frakoblet"}" aria-label="Tilkobling">
        <strong>${s.online ? "Tilkoblet" : "Frakoblet"}</strong>
        <span>${s.koAntall} ${s.koAntall === 1 ? "inspeksjon venter" : "inspeksjoner venter"} på å bli sendt.</span>
        <button class="knapp knapp--sekundar" ?disabled=${!s.online || s.koAntall === 0} @click=${() => void inspectionSync().flush()}>Send nå</button>
      </section>
      <label class="avkrysning">
        <input type="checkbox" .checked=${s.simFrakoblet} @change=${() => store.set({ simFrakoblet: !s.simFrakoblet })} />
        Simuler frakoblet modus (test av køen)
      </label>
      ${kanLoggeUt(cfg)
        ? html`<button class="knapp knapp--sekundar knapp--hoy" @click=${() => signOut(cfg)}>${icons.logout(18)} Logg ut</button>`
        : cfg.anonym
          ? html`<button class="knapp knapp--sekundar knapp--hoy" @click=${() => void apneNavnDialog()}>Endre navn</button>`
          : nothing}
    </div>`;
  }
}

customElements.define("svv-field-tools", SvvFieldTools);
customElements.define("svv-field-me", SvvFieldMe);
