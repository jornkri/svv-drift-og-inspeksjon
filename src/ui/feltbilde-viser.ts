import { html, nothing } from "lit";
import { koblingTekst } from "../data/feltbilde-kobling.ts";
import type { Feltbilde, KobletBilde } from "../data/feltbilder.ts";
import { navigate } from "../state/router.ts";
import { store } from "../state/store.ts";
import { LightElement, fmtDateTime } from "./base.ts";
import { icons } from "./icons.ts";

const RETNING = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
const retningTekst = (g: number) => `${RETNING[Math.round(g / 45) % 8]} (${Math.round(g)}°)`;

/** Bildeviser (modal): stort bilde med opplysninger, bla med piltaster eller knapper. */
export class SvvFeltbildeViser extends LightElement {
  static override properties = { indeks: { state: true } };
  bilder: (Feltbilde | KobletBilde)[] = [];
  declare indeks: number;

  protected override firstUpdated(): void {
    this.querySelector<HTMLDialogElement>("dialog")?.showModal();
  }

  private lukk() {
    this.querySelector<HTMLDialogElement>("dialog")?.close();
    this.remove();
  }

  private bla(d: 1 | -1) {
    const n = this.bilder.length;
    this.indeks = (this.indeks + d + n) % n;
  }

  private visIKart(b: Feltbilde) {
    store.set({ markor: { x: b.x, y: b.y, tekst: b.tittel } });
    this.lukk();
    navigate("kart");
  }

  protected override render() {
    const b = this.bilder[this.indeks];
    if (!b) return nothing;
    const n = this.bilder.length;
    const kobling = "kobling" in b ? b.kobling : null;
    return html`<dialog
      class="bildeviser"
      aria-labelledby="bildeviser-tittel"
      @cancel=${() => this.lukk()}
      @keydown=${(e: KeyboardEvent) => {
        if (n > 1 && e.key === "ArrowRight") this.bla(1);
        if (n > 1 && e.key === "ArrowLeft") this.bla(-1);
      }}
    >
      <div class="bildeviser__hode">
        <h2 id="bildeviser-tittel">${b.tittel}</h2>
        ${n > 1 ? html`<span class="bildeviser__teller" aria-live="polite">${this.indeks + 1} av ${n}</span>` : nothing}
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
          <button class="knapp knapp--sekundar" @click=${() => this.visIKart(b)}>Vis i kartet</button>
          <a class="knapp knapp--sekundar" href=${b.bildeUrl} target="_blank" rel="noopener">${icons.external()} Åpne bildet<span class="visually-hidden"> (ny fane)</span></a>
        </div>
      </div>
    </dialog>`;
  }
}

customElements.define("svv-feltbilde-viser", SvvFeltbildeViser);

/** Åpner bildeviseren på bilde nr. `start` i lista. */
export function apneFeltbilder(bilder: (Feltbilde | KobletBilde)[], start = 0): void {
  document.querySelector("svv-feltbilde-viser")?.remove();
  const el = document.createElement("svv-feltbilde-viser") as SvvFeltbildeViser;
  el.bilder = bilder;
  el.indeks = start;
  document.body.append(el);
}
