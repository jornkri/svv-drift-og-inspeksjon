import { html, nothing } from "lit";
import type { ObjektTreff } from "../data/DataService.ts";
import { currentGdoToken } from "../map/basemaps.ts";
import { lookupVegref, parseVegref, searchAddress, type StedTreff } from "../map/search.ts";
import { services } from "../services.ts";
import { navigate } from "../state/router.ts";
import { store } from "../state/store.ts";
import { LightElement } from "./base.ts";
import { icons } from "./icons.ts";

type Treff = { kind: "objekt"; t: ObjektTreff } | { kind: "sted"; t: StedTreff };

let uid = 0;

/** Søk på objekt-ID, vegreferanse (NVDB) og adresse (Geodata Online). */
export class SvvSearchBox extends LightElement {
  static override properties = { placeholder: { type: String } };
  declare placeholder: string;

  private uidPrefix = `sok-${++uid}`;
  private q = "";
  private treff: Treff[] = [];
  private aktiv = -1;
  private open = false;
  private busy = false;
  private timer = 0;
  private ctrl: AbortController | null = null;

  constructor() {
    super();
    this.placeholder = "Objekt-ID, vegreferanse eller adresse";
  }

  private onInput(e: Event) {
    this.q = (e.target as HTMLInputElement).value;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(), 250);
  }

  private async run() {
    const q = this.q.trim();
    this.ctrl?.abort();
    if (q.length < 2) {
      this.treff = [];
      this.open = false;
      this.requestUpdate();
      return;
    }
    const ctrl = (this.ctrl = new AbortController());
    this.busy = true;
    this.requestUpdate();
    const { data, cfg } = services();
    const vegref = parseVegref(q);
    const token = currentGdoToken();
    const [obj, veg, adr] = await Promise.all([
      data.search(q, 6).catch(() => []),
      vegref ? lookupVegref(cfg, vegref, ctrl.signal).catch(() => null) : Promise.resolve(null),
      token && !vegref ? searchAddress(cfg, q, token, ctrl.signal).catch(() => []) : Promise.resolve([]),
    ]);
    if (ctrl.signal.aborted) return;
    this.treff = [
      ...obj.map((t) => ({ kind: "objekt" as const, t })),
      ...(veg ? [{ kind: "sted" as const, t: veg }] : []),
      ...adr.map((t) => ({ kind: "sted" as const, t })),
    ];
    this.aktiv = this.treff.length ? 0 : -1;
    this.open = true;
    this.busy = false;
    this.requestUpdate();
  }

  private velg(t: Treff) {
    this.open = false;
    this.requestUpdate();
    const route = store.get().route;
    if (route !== "kart" && route !== "3d") navigate("kart");
    if (t.kind === "objekt") {
      store.set({ selection: { globalids: [t.t.objekt.globalid], index: 0 }, zoomTil: t.t.objekt.globalid, markor: null });
    } else {
      store.set({ markor: { x: t.t.x, y: t.t.y, tekst: t.t.tekst } });
    }
    this.dispatchEvent(new CustomEvent("svv-valgt", { bubbles: true }));
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" && this.treff.length) {
      e.preventDefault();
      this.open = true;
      this.aktiv = (this.aktiv + 1) % this.treff.length;
    } else if (e.key === "ArrowUp" && this.treff.length) {
      e.preventDefault();
      this.aktiv = (this.aktiv - 1 + this.treff.length) % this.treff.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = this.treff[this.aktiv];
      if (t) this.velg(t);
      else void this.run();
    } else if (e.key === "Escape") {
      this.open = false;
    } else return;
    this.requestUpdate();
  }

  private group(title: string, items: { t: Treff; i: number }[]) {
    if (!items.length) return nothing;
    return html`<li role="presentation" class="sok__gruppe">${title}</li>
      ${items.map(({ t, i }) => {
        const [a, b] =
          t.kind === "objekt"
            ? [`${t.t.objekt.objekt_id} · ${t.t.objekt.navn}`, `${t.t.objekt.fag} · ${t.t.objekt.fagmodell ?? ""} · ${t.t.objekt.vegreferanse ?? ""}`]
            : [t.t.tekst, t.t.undertekst];
        return html`<li
          id="${this.uidPrefix}-${i}"
          role="option"
          class="sok__treff ${i === this.aktiv ? "is-aktiv" : ""}"
          aria-selected=${i === this.aktiv}
          @mousedown=${(e: Event) => e.preventDefault()}
          @click=${() => this.velg(t)}
        >
          <span class="sok__a">${a}</span><span class="sok__b">${b}</span>
        </li>`;
      })}`;
  }

  protected override render() {
    const indexed = this.treff.map((t, i) => ({ t, i }));
    const token = currentGdoToken();
    return html`
      <div class="sok">
        <label class="sok__felt">
          ${icons.search(18)}
          <span class="visually-hidden">Søk</span>
          <input
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded=${this.open}
            aria-controls="${this.uidPrefix}-liste"
            aria-activedescendant=${this.aktiv >= 0 && this.open ? `${this.uidPrefix}-${this.aktiv}` : nothing}
            placeholder=${this.placeholder}
            .value=${this.q}
            @input=${this.onInput}
            @keydown=${this.onKey}
            @focus=${() => {
              if (this.treff.length) {
                this.open = true;
                this.requestUpdate();
              }
            }}
            @blur=${() => {
              this.open = false;
              this.requestUpdate();
            }}
          />
        </label>
        ${this.open
          ? html`<ul id="${this.uidPrefix}-liste" class="sok__liste" role="listbox" aria-label="Søkeresultater">
              ${this.group("OBJEKTER", indexed.filter((x) => x.t.kind === "objekt"))}
              ${this.group("VEGREFERANSE (NVDB)", indexed.filter((x) => x.t.kind === "sted" && x.t.t.kilde === "vegreferanse"))}
              ${this.group("ADRESSER (GEODATA ONLINE)", indexed.filter((x) => x.t.kind === "sted" && x.t.t.kilde === "adresse"))}
              ${!this.treff.length && !this.busy ? html`<li role="presentation" class="sok__tom">Ingen treff for «${this.q}»</li>` : nothing}
              ${!token ? html`<li role="presentation" class="sok__tom">Adressesøk krever Geodata Online-tilgang.</li>` : nothing}
            </ul>`
          : nothing}
        <span class="visually-hidden" role="status" aria-live="polite">${this.open ? `${this.treff.length} treff` : ""}</span>
      </div>
    `;
  }
}

customElements.define("svv-search-box", SvvSearchBox);
