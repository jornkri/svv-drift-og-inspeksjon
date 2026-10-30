import { html, nothing, svg } from "lit";
import { koblingTekst } from "../data/feltbilde-kobling.ts";
import type { Feltbilde, KobletBilde } from "../data/feltbilder.ts";
import { navigate } from "../state/router.ts";
import { store } from "../state/store.ts";
import { LightElement, fmtDateTime } from "./base.ts";
import { icons } from "./icons.ts";

const RETNING = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
const retningTekst = (g: number) => `${RETNING[Math.round(g / 45) % 8]} (${Math.round(g)}°)`;

/** Festet til siden eller stort (modal); valget huskes i nettleseren. */
const DOKK_NOKKEL = "svv-di-bilde-dokket";
const lesDokket = () => {
  try {
    return localStorage.getItem(DOKK_NOKKEL) === "1";
  } catch {
    return false;
  }
};

const ikonDokk = (paa: boolean) =>
  svg`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16"></rect>${paa ? svg`<path d="M9 4v16"></path>` : svg`<path d="M15 4v16"></path>`}
  </svg>`;

/**
 * Bildeviser for feltbilder: stort bilde med opplysninger, bla med piltaster eller knapper.
 * Vises enten stort (modal) eller festet som sidepanel til høyre, slik at kartet og det valgte
 * bildepunktet (markert i kartet) er synlig samtidig.
 */
export class SvvFeltbildeViser extends LightElement {
  static override properties = { indeks: { state: true }, dokket: { state: true } };
  bilder: (Feltbilde | KobletBilde)[] = [];
  declare indeks: number;
  declare dokket: boolean;
  private aktivNokkel = "";

  constructor() {
    super();
    this.dokket = lesDokket();
  }

  private get dialog() {
    return this.querySelector<HTMLDialogElement>("dialog");
  }

  private vis() {
    const d = this.dialog;
    if (!d) return;
    if (d.open) d.close();
    if (this.dokket) d.show();
    else d.showModal();
  }

  protected override firstUpdated(): void {
    this.vis();
  }

  protected override updated(endret: Map<string, unknown>): void {
    if (endret.has("dokket") && endret.get("dokket") !== undefined) this.vis();
    // Kartknappene flyttes inn når panelet ligger over høyre kant av kartet
    if (this.dokket) document.body.dataset.bildeDokket = "";
    else delete document.body.dataset.bildeDokket;
    const b = this.bilder[this.indeks];
    // Valgt bilde markeres i kartet (og kartet flyttes dit når det er utenfor)
    const nokkel = b ? `${b.id}:${this.dokket}` : "";
    if (b && nokkel !== this.aktivNokkel) {
      this.aktivNokkel = nokkel;
      store.set({ feltbildeAktiv: { x: b.x, y: b.y, retning: b.retning, dokket: this.dokket } });
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    delete document.body.dataset.bildeDokket;
    store.set({ feltbildeAktiv: null });
  }

  private lukk() {
    this.dialog?.close();
    this.remove();
  }

  private byttDokk() {
    this.dokket = !this.dokket;
    try {
      localStorage.setItem(DOKK_NOKKEL, this.dokket ? "1" : "0");
    } catch {
      /* privat modus */
    }
  }

  private bla(d: 1 | -1) {
    const n = this.bilder.length;
    this.indeks = (this.indeks + d + n) % n;
  }

  private visIKart(b: Feltbilde) {
    store.set({ markor: { x: b.x, y: b.y, tekst: b.tittel } });
    if (!this.dokket) this.lukk();
    navigate("kart");
  }

  protected override render() {
    const b = this.bilder[this.indeks];
    if (!b) return nothing;
    const n = this.bilder.length;
    const kobling = "kobling" in b ? b.kobling : null;
    return html`<dialog
      class="bildeviser ${this.dokket ? "bildeviser--dokket" : ""}"
      aria-labelledby="bildeviser-tittel"
      @cancel=${() => this.lukk()}
      @keydown=${(e: KeyboardEvent) => {
        if (n > 1 && e.key === "ArrowRight") this.bla(1);
        if (n > 1 && e.key === "ArrowLeft") this.bla(-1);
        if (e.key === "Escape" && this.dokket) this.lukk();
      }}
    >
      <div class="bildeviser__hode">
        <h2 id="bildeviser-tittel">${b.tittel}</h2>
        ${n > 1 ? html`<span class="bildeviser__teller" aria-live="polite">${this.indeks + 1} av ${n}</span>` : nothing}
        <button
          class="ikonknapp"
          aria-pressed=${this.dokket}
          aria-label=${this.dokket ? "Vis bildet stort" : "Fest bildet til siden av kartet"}
          title=${this.dokket ? "Vis stort" : "Fest til siden"}
          @click=${() => this.byttDokk()}
        >
          ${ikonDokk(this.dokket)}
        </button>
        <button class="ikonknapp" aria-label="Lukk bildet" @click=${() => this.lukk()}>${icons.close()}</button>
      </div>
      <div class="bildeviser__flate">
        ${n > 1 ? html`<button class="bildeviser__bla bildeviser__bla--forrige" aria-label="Forrige bilde" @click=${() => this.bla(-1)}>${icons.chevronLeft(24)}</button>` : nothing}
        <img src=${b.bildeUrl} alt="${b.tittel}${kobling ? `, ${koblingTekst(kobling).toLowerCase()}` : ""}" />
        ${n > 1 ? html`<button class="bildeviser__bla bildeviser__bla--neste" aria-label="Neste bilde" @click=${() => this.bla(1)}>${icons.chevronRight(24)}</button>` : nothing}
      </div>
      <div class="bildeviser__fot">
        <dl class="bildeviser__meta">
          ${kobling ? html`<div><dt>Kobling</dt><dd>${koblingTekst(kobling)}</dd></div>` : nothing}
          <div><dt>Tatt</dt><dd>${b.tatt ? fmtDateTime(b.tatt.toISOString()) : "–"}</dd></div>
          <div><dt>Kilde</dt><dd>${b.kilde}${b.kamera ? ` · ${b.kamera}` : ""}</dd></div>
          ${b.retning != null ? html`<div><dt>Retning</dt><dd>${retningTekst(b.retning)}</dd></div>` : nothing}
          ${b.hoydeOverBakken != null ? html`<div><dt>Høyde over bakken</dt><dd>${Math.round(b.hoydeOverBakken)} m</dd></div>` : nothing}
        </dl>
        <div class="bildeviser__knapper">
          ${this.dokket ? nothing : html`<button class="knapp knapp--sekundar" @click=${() => this.visIKart(b)}>Vis i kartet</button>`}
          <a class="knapp knapp--sekundar" href=${b.bildeUrl} target="_blank" rel="noopener">${icons.external()} Åpne bildet<span class="visually-hidden"> (ny fane)</span></a>
        </div>
      </div>
    </dialog>`;
  }
}

customElements.define("svv-feltbilde-viser", SvvFeltbildeViser);

/** Åpner bildeviseren på bilde nr. `start` i lista (erstatter et åpent bilde, også i sidepanelet). */
export function apneFeltbilder(bilder: (Feltbilde | KobletBilde)[], start = 0): void {
  const finnes = document.querySelector<SvvFeltbildeViser>("svv-feltbilde-viser");
  if (finnes) {
    finnes.bilder = bilder;
    finnes.indeks = start;
    finnes.requestUpdate();
    return;
  }
  const el = document.createElement("svv-feltbilde-viser") as SvvFeltbildeViser;
  el.bilder = bilder;
  el.indeks = start;
  document.body.append(el);
}
