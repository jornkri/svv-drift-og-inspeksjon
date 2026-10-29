import { html, nothing } from "lit";
import { mapContext } from "../map/map-context.ts";
import { nvdbGeometri } from "../map/nvdb-objekter-layer.ts";
import {
  formaterVerdi,
  hentTilstander,
  hentVegobjekt,
  nvdbType,
  oppsummer,
  tilstandSammendrag,
  visningsegenskaper,
  type NvdbVegobjekt,
} from "../nvdb/vegobjekter.ts";
import { services } from "../services.ts";
import { store } from "../state/store.ts";
import { StoreElement, fmtDate, fmtDateTime, fmtNumber } from "./base.ts";
import { icons } from "./icons.ts";

type Tilstand = Awaited<ReturnType<typeof hentTilstander>>[number];

/** Slår sammen like registreringer (samme type, tilstand og dato), nyeste først. */
function grupper(t: Tilstand[]): (Omit<Tilstand, "id"> & { n: number })[] {
  const m = new Map<string, Omit<Tilstand, "id"> & { n: number }>();
  for (const x of t) {
    const k = `${x.type}|${x.tilstand}|${x.dato}`;
    const g = m.get(k);
    if (g) g.n++;
    else m.set(k, { type: x.type, tilstand: x.tilstand, dato: x.dato, n: 1 });
  }
  return [...m.values()].sort((a, b) => (b.dato ?? "").localeCompare(a.dato ?? ""));
}

/** Panel for et valgt vegobjekt fra NVDB: egenskaper, plassering og tilstandsregistreringer. */
export class SvvNvdbPanel extends StoreElement {
  private lastetFor: string | null = null;
  private objekt: NvdbVegobjekt | null = null;
  private tilstander: Tilstand[] | null = null;
  private feil: string | null = null;
  private ctrl: AbortController | null = null;

  protected override willUpdate(): void {
    const v = this.store.state.nvdbValgt;
    const key = v ? `${v.typeId}:${v.id}` : null;
    if (key && key !== this.lastetFor) {
      this.lastetFor = key;
      void this.load(v!.typeId, v!.id, key);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ctrl?.abort();
  }

  private async load(typeId: number, id: number, key: string) {
    this.ctrl?.abort();
    const ctrl = (this.ctrl = new AbortController());
    this.objekt = null;
    this.tilstander = null;
    this.feil = null;
    const k = { baseUrl: services().cfg.nvdb.baseUrl, client: services().cfg.nvdb.client };
    try {
      const o = await hentVegobjekt(k, typeId, id, ctrl.signal);
      if (this.lastetFor !== key) return;
      this.objekt = o;
      this.requestUpdate();
      const t = await hentTilstander(k, o);
      if (this.lastetFor !== key) return;
      this.tilstander = t;
    } catch (e) {
      if (ctrl.signal.aborted) return;
      this.feil = e instanceof Error ? e.message : String(e);
    }
    this.requestUpdate();
  }

  private zoom() {
    const g = this.objekt ? nvdbGeometri(this.objekt) : null;
    if (g) void mapContext()?.objects.goTo(g);
  }

  protected override render() {
    const v = this.store.state.nvdbValgt;
    if (!v) return nothing;
    const t = nvdbType(v.typeId);
    const o = this.objekt;
    const lukk = html`<button class="ikonknapp" aria-label="Lukk NVDB-panel" @click=${() => store.set({ nvdbValgt: null })}>${icons.close()}</button>`;
    if (!o) {
      return html`<aside class="objektpanel" aria-label="NVDB-objekt">
        <div class="objektpanel__topp">
          <div class="objektpanel__sti"><span class="objektpanel__fyll"></span>${lukk}</div>
          ${this.feil
            ? html`<p class="tom" role="alert">Kunne ikke hente objektet fra NVDB: ${this.feil}</p>`
            : html`<div class="laster" role="status">Henter fra NVDB …</div>`}
        </div>
      </aside>`;
    }
    const vsr = o.lokasjon?.vegsystemreferanser?.[0]?.kortform;
    const kontrakt = o.lokasjon?.kontraktsområder?.[0];
    const eget = visningsegenskaper(o);
    const aar = eget.find((e) => /Etableringsår|Byggeår/.test(e.navn));
    const sum = this.tilstander ? tilstandSammendrag(this.tilstander) : null;
    const navn = t?.navn ?? o.metadata?.type?.navn ?? "Vegobjekt";

    return html`<aside class="objektpanel" aria-labelledby="nvdb-tittel">
      <div class="objektpanel__topp">
        <div class="objektpanel__sti">
          <nav aria-label="Kilde" class="sti"><span>NVDB</span><span aria-hidden="true">›</span><span>${t?.fag ?? "–"}</span><span aria-hidden="true">›</span><span>${navn}</span></nav>
          <span class="objektpanel__fyll"></span>
          ${lukk}
        </div>
        <div>
          <h2 id="nvdb-tittel" class="objektpanel__tittel">${navn}</h2>
          <div class="objektpanel__undertittel">NVDB-id ${o.id}${vsr ? ` · ${vsr}` : ""}</div>
        </div>
        <div class="merker">
          <span class="merke merke--ramme">I drift · NVDB</span>
          ${o.geometri?.egengeometri === false ? html`<span class="merke merke--noytral">Geometri avledet fra vegnettet</span>` : nothing}
          ${sum && sum.perVerdi.length
            ? html`<span class="merke ${sum.perVerdi.some(([k]) => !/^ok$/i.test(k)) ? "merke--avvik" : "merke--ok"}"
                >Tilstand: ${sum.perVerdi.map(([k, n]) => `${k} ${n}`).join(", ")}</span
              >`
            : nothing}
        </div>
        ${oppsummer(o) ? html`<p class="nvdb__oppsummering">${oppsummer(o)}</p>` : nothing}
        <dl class="nokkeltall">
          <div><dt>Lengde</dt><dd>${o.geometri?.lengde != null ? `${fmtNumber(o.geometri.lengde, 1)} m` : "–"}</dd></div>
          <div><dt>Etablert</dt><dd>${aar && aar.verdi != null ? formaterVerdi(aar) : "Ikke registrert"}</dd></div>
          <div><dt>Kontraktsområde</dt><dd class="liten">${kontrakt?.navn ?? (kontrakt?.nummer != null ? String(kontrakt.nummer) : "–")}</dd></div>
          <div><dt>Sist endret i NVDB</dt><dd class="liten">${fmtDateTime(o.metadata?.sist_modifisert)}</dd></div>
        </dl>
        <div class="knapperad">
          <button class="knapp knapp--sekundar" @click=${() => this.zoom()}>Zoom til</button>
          ${o.href
            ? html`<a class="knapp knapp--sekundar" href=${o.href} target="_blank" rel="noopener"
                >${icons.external()} Data i NVDB API<span class="visually-hidden">(åpnes i ny fane)</span></a
              >`
            : nothing}
        </div>
      </div>
      <div class="objektpanel__fane">
        <section class="egenskaper" aria-labelledby="nvdb-tilstand">
          <h3 class="kategori" id="nvdb-tilstand">TILSTAND I NVDB</h3>
          ${this.tilstander == null
            ? html`<p class="sekundar" role="status">Henter tilstandsregistreringer …</p>`
            : this.tilstander.length
              ? html`<p class="sekundar">${this.tilstander.length} registreringer${sum?.siste ? `, sist kontrollert ${fmtDate(sum.siste)}` : ""}.</p>
                  <table class="tabell tabell--kompakt">
                    <caption class="visually-hidden">Tilstandsregistreringer i NVDB</caption>
                    <thead><tr><th scope="col">Type</th><th scope="col">Tilstand</th><th scope="col">Kontrollert</th><th scope="col">Antall</th></tr></thead>
                    <tbody>
                      ${grupper(this.tilstander).map(
                        (x) => html`<tr><td>${x.type}</td><td>${x.tilstand}</td><td>${x.dato ? fmtDate(x.dato) : "–"}</td><td>${x.n}</td></tr>`,
                      )}
                    </tbody>
                  </table>`
              : html`<p class="tom">Ingen tilstandsregistreringer er knyttet til objektet i NVDB.</p>`}
        </section>
        <section class="egenskaper">
          <h3 class="kategori">EGENSKAPER</h3>
          <dl>
            ${eget.map((e) => html`<div class="egenskaper__rad"><dt>${e.navn}</dt><dd>${formaterVerdi(e)}</dd></div>`)}
          </dl>
        </section>
        <section class="egenskaper">
          <h3 class="kategori">METADATA</h3>
          <dl>
            <div class="egenskaper__rad"><dt>Versjon</dt><dd>${o.metadata?.versjon ?? "–"}</dd></div>
            <div class="egenskaper__rad"><dt>Gyldig fra</dt><dd>${fmtDate(o.metadata?.startdato)}</dd></div>
            <div class="egenskaper__rad"><dt>Første versjon</dt><dd>${fmtDate(o.metadata?.startdato_vegobjekt)}</dd></div>
          </dl>
        </section>
        <p class="sekundar liten">Kilde: Nasjonal vegdatabank (NVDB), NVDB API Les v4. Data under NLOD.</p>
      </div>
    </aside>`;
  }
}

customElements.define("svv-nvdb-panel", SvvNvdbPanel);
