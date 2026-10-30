import { html, nothing } from "lit";
import { kanLoggeUt, signOut } from "../../auth/auth.ts";
import { apneNavnDialog } from "../../auth/navn.ts";
import { services } from "../../services.ts";
import { navigate } from "../../state/router.ts";
import { store } from "../../state/store.ts";
import { StoreElement, fmtDateTime } from "../../ui/base.ts";
import { icons } from "../../ui/icons.ts";
import { isSimGps } from "../field-runtime.ts";
import type { KoElement } from "../offline-queue.ts";
import { inspectionSync, offlineQueue } from "../sync-setup.ts";
import { erForbigaende } from "../sync.ts";

/** Adressen med simulert GPS av eller på; andre parametere (f.eks. ?modus=felt) beholdes. */
function simGpsLenke(paa: boolean): string {
  const q = new URLSearchParams(location.search);
  if (paa) q.set("simgps", "1");
  else q.delete("simgps");
  const s = q.toString();
  return `${location.pathname}${s ? `?${s}` : ""}${location.hash}`;
}

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
          <a class="feltliste__valg" href=${simGpsLenke(!isSimGps())}>
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
  private ko: KoElement[] = [];
  private koVersjon = -1;
  private sender = false;

  protected override updated(): void {
    // Lista lastes på nytt når antallet i køen endres
    const n = this.store.state.koAntall;
    if (n === this.koVersjon) return;
    this.koVersjon = n;
    void offlineQueue()
      .list()
      .then((l) => {
        this.ko = l;
        this.requestUpdate();
      })
      .catch(() => undefined);
  }

  private async sendNa() {
    this.sender = true;
    this.requestUpdate();
    try {
      const r = await inspectionSync().flush();
      if (r.sendt && !r.feilet) store.notify(`${r.sendt} ${r.sendt === 1 ? "inspeksjon er sendt" : "inspeksjoner er sendt"}`, "suksess");
      else if (r.feilet) store.notify(`${r.sendt} sendt, ${r.feilet} feilet – se feilmeldingen i køen`, "feil");
    } finally {
      this.sender = false;
      this.koVersjon = -1;
      this.requestUpdate();
    }
  }

  private async slett(el: KoElement) {
    if (!confirm(`Slette inspeksjonen av ${el.inspeksjon.obj_navn ?? "objektet"} fra køen? Den blir ikke sendt.`)) return;
    await offlineQueue().remove(el.id);
    await inspectionSync().notify();
  }

  private renderKo() {
    if (!this.ko.length) return nothing;
    return html`<ul class="koliste" aria-label="Inspeksjoner i kø">
      ${this.ko.map(
        (el) => html`<li class="koliste__rad">
          <span
            ><strong>${el.inspeksjon.obj_navn ?? el.inspeksjon.objekt_globalid}</strong><br /><span class="sekundar liten"
              >TG ${el.inspeksjon.tilstandsgrad} · ${fmtDateTime(el.opprettet)}${el.bilder.length ? ` · ${el.bilder.length} bilder` : ""}</span
            >${el.sisteFeil
              ? html`<br /><span class="koliste__feil">Feilet ${el.forsok} ${el.forsok === 1 ? "gang" : "ganger"}: ${el.sisteFeil}</span>`
              : nothing}</span
          >
          ${el.sisteFeil && !erForbigaende(el.sisteFeil)
            ? html`<button class="knapp knapp--sekundar knapp--hoy" @click=${() => void this.slett(el)}>Slett</button>`
            : nothing}
        </li>`,
      )}
    </ul>`;
  }

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
        <button class="knapp knapp--sekundar knapp--hoy" ?disabled=${!s.online || s.koAntall === 0 || this.sender} @click=${() => void this.sendNa()}>
          ${this.sender ? "Sender …" : "Send nå"}
        </button>
      </section>
      ${this.renderKo()}
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
