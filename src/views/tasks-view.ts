import "@arcgis/map-components/components/arcgis-map";
import Graphic from "@arcgis/core/Graphic.js";
import EsriMap from "@arcgis/core/Map.js";
import Point from "@arcgis/core/geometry/Point.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import type MapView from "@arcgis/core/views/MapView.js";
import type { ArcgisMap } from "@arcgis/map-components/components/arcgis-map";
import { html, nothing } from "lit";
import type { ObjektTreff, OppgaveMedLogg } from "../data/DataService.ts";
import { FAG, OPPGAVE_STATUSER, type Fag } from "../data/schema.ts";
import { createBasemap, hasGdoAccess } from "../map/basemaps.ts";
import { services } from "../services.ts";
import { navigate } from "../state/router.ts";
import { store, velgObjekter } from "../state/store.ts";
import { dataChanged, ensureTasks } from "../tasks/task-store.ts";
import {
  DEFAULT_TASK_FILTER,
  displayStatus,
  filterTasks,
  sortTasks,
  taskStats,
  type FristFilter,
  type StatusFilter,
  type TaskFilter,
  type TaskTab,
} from "../tasks/tasks.ts";
import { StoreElement, fmtDate, fmtDateTime } from "../ui/base.ts";
import { icons } from "../ui/icons.ts";

export const statusKlasse = (s: string) =>
  s === "Over frist" ? "pille--rod" : s === "Pågår" ? "pille--blaa" : s === "Klar for kontroll" || s === "Fullført" ? "pille--gronn" : "pille--gra";
export const prioKlasse = (p: string) => (p === "Høy" ? "pille--oransje" : p === "Middels" ? "pille--gra" : "pille--ramme");

/** Kontor: oppgavetabell med nøkkeltall, faner, filtre og detaljpanel. */
export class SvvTasksView extends StoreElement {
  private f: TaskFilter = { ...DEFAULT_TASK_FILTER };
  private objekter = new Map<string, ObjektTreff | null>();
  private dialog = false;
  private miniView: MapView | null = null;
  private miniLayer = new GraphicsLayer();
  /** Minikartet viser dette (oppgave:objekt lastet); oppdateres bare når det endres */
  private miniFor = "";
  private miniInit: Promise<void> | null = null;
  private miniEl: ArcgisMap | null = null;
  /** Fokus flyttes inn i tildelingsdialogen når den åpnes, og tilbake når den lukkes */
  private dialogFokus = false;

  override connectedCallback(): void {
    super.connectedCallback();
    void ensureTasks().then(() => this.loadObjects());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.miniView = null;
    this.miniInit = null;
    this.miniFor = "";
  }

  private async loadObjects() {
    const { data } = services();
    const ids = [...new Set(this.store.state.oppgaver.map((o) => o.objekt_globalid))].filter((id) => !this.objekter.has(id));
    await Promise.all(ids.map(async (id) => this.objekter.set(id, await data.getObject(id).catch(() => null))));
    this.requestUpdate();
    void this.updateMini();
  }

  private setF(p: Partial<TaskFilter>) {
    this.f = { ...this.f, ...p };
    this.requestUpdate();
  }

  private valgt(): OppgaveMedLogg | null {
    const { oppgaver, oppgaveValgt } = this.store.state;
    return oppgaver.find((o) => o.oppgave_id === oppgaveValgt) ?? null;
  }

  private visIKart(o: OppgaveMedLogg) {
    velgObjekter([o.objekt_globalid], { zoom: true });
    navigate("kart");
  }

  private startInspeksjon(o: OppgaveMedLogg) {
    store.set({ inspeksjon: { globalid: o.objekt_globalid, oppgaveId: o.oppgave_id } });
    navigate("inspeksjon");
  }

  private eksporter(rows: OppgaveMedLogg[]) {
    const today = new Date();
    const head = ["ID", "Oppgave", "Objekt", "Fag", "Frist", "Prioritet", "Status", "Tildelt"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = rows.map((o) =>
      [o.oppgave_id, o.tittel, this.objekter.get(o.objekt_globalid)?.objekt.navn ?? "", o.fag, o.frist, o.prioritet, displayStatus(o, today), o.tildelt].map(esc).join(";"),
    );
    const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `oppgaver-${services().cfg.prosjekt.navn.replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  protected override updated(): void {
    if (this.dialog && !this.dialogFokus) {
      this.dialogFokus = true;
      this.querySelector<HTMLSelectElement>(".dialog select")?.focus();
    }
    // Ikke ved hver endring i tilstanden (meldinger o.l.): da hopper minikartet tilbake
    const o = this.valgt();
    const nokkel = o ? `${o.oppgave_id}:${this.objekter.has(o.objekt_globalid)}` : "";
    if (nokkel && nokkel !== this.miniFor) {
      this.miniFor = nokkel;
      void this.updateMini();
    }
  }

  private async updateMini() {
    const el = this.querySelector<ArcgisMap>("#minikart");
    const o = this.valgt();
    if (!el || !o) return;
    if (!this.miniView || (el.view as MapView | undefined) !== this.miniView) {
      // Én oppstart av minikartet selv om flere oppdateringer kommer samtidig
      if (this.miniInit && this.miniEl !== el) this.miniInit = null;
      this.miniEl = el;
      this.miniInit ??= this.startMini(el);
      await this.miniInit;
      if (!this.miniView) return;
    }
    const t = this.objekter.get(o.objekt_globalid);
    this.miniLayer.removeAll();
    if (!t) return;
    const g = t.geometry;
    const symbol =
      g.type === "point"
        ? new SimpleMarkerSymbol({ style: "circle", size: 12, color: [6, 94, 127, 1], outline: { color: [255, 255, 255, 1], width: 2 } })
        : g.type === "polygon"
          ? new SimpleFillSymbol({ color: [6, 94, 127, 0.3], outline: { color: [6, 94, 127, 1], width: 2 } })
          : new SimpleLineSymbol({ color: [6, 94, 127, 1], width: 5 });
    this.miniLayer.add(new Graphic({ geometry: g, symbol }));
    await this.miniView.goTo((g.type === "point" ? { target: g, scale: 1500 } : { target: g.extent!.clone().expand(3) }) as never, { animate: false }).catch(() => undefined);
  }

  private async startMini(el: ArcgisMap) {
    await customElements.whenDefined("arcgis-map");
    const { cfg } = services();
    const def = cfg.gdo.basemaps.find((b) => b.id === "kanvas") ?? cfg.gdo.basemaps[0];
    const map = new EsriMap(def && hasGdoAccess() ? { basemap: createBasemap(def, "2d") } : {});
    this.miniLayer = new GraphicsLayer();
    map.add(this.miniLayer);
    el.map = map;
    el.spatialReference = new SpatialReference({ wkid: cfg.wkid });
    el.center = new Point({ x: cfg.prosjekt.senter[0], y: cfg.prosjekt.senter[1], spatialReference: { wkid: cfg.wkid } });
    el.scale = 4000;
    await el.viewOnReady();
    this.miniView = el.view as MapView;
    this.miniView.background = { color: [236, 238, 237, 1] } as never;
  }

  protected override render() {
    const s = this.store.state;
    const { data } = services();
    const today = new Date();
    const user = data.user.navn;
    const scope = filterTasks(s.oppgaver, { ...DEFAULT_TASK_FILTER, tab: this.f.tab, status: "alle" }, user, data.user.team, today);
    const st = taskStats(scope, today);
    const rows = sortTasks(filterTasks(s.oppgaver, this.f, user, data.user.team, today), today);
    const valgt = this.valgt();

    return html`
      <div class="oppgaveside">
        <section class="oppgaveside__liste" aria-labelledby="oppgaver-tittel">
          <div class="oppgaveside__hode">
            <div>
              <h1 id="oppgaver-tittel">Oppgaver</h1>
              <p class="sekundar">Periodiske inspeksjoner, avvik og etterarbeid – ${services().cfg.prosjekt.navn}</p>
            </div>
            <button class="knapp knapp--sekundar" @click=${() => this.eksporter(rows)}>Eksporter (CSV)</button>
          </div>

          <dl class="nokkelkort">
            <div class="nokkelkort__kort"><dt>ÅPNE</dt><dd>${st.apne}</dd></div>
            <div class="nokkelkort__kort nokkelkort__kort--oransje"><dt>FORFALLER DENNE UKA</dt><dd>${st.forfallerUka}</dd></div>
            <div class="nokkelkort__kort nokkelkort__kort--rod"><dt>OVER FRIST</dt><dd>${st.overFrist}</dd></div>
            <div class="nokkelkort__kort nokkelkort__kort--gronn"><dt>FULLFØRT</dt><dd>${st.fullfort}</dd></div>
          </dl>

          <div class="oppgavefilter">
            <div class="segment segment--inline" role="tablist" aria-label="Hvem">
              ${(
                [
                  ["mine", "Mine"],
                  ["teamet", "Teamet"],
                  ["alle", "Alle"],
                ] as [TaskTab, string][]
              ).map(
                ([id, label]) => html`<button
                  role="tab"
                  class="segment__valg ${this.f.tab === id ? "is-valgt" : ""}"
                  aria-selected=${this.f.tab === id}
                  @click=${() => this.setF({ tab: id })}
                >
                  ${label}
                </button>`,
              )}
            </div>
            <label class="velgfelt">
              Fag
              <select @change=${(e: Event) => this.setF({ fag: (e.target as HTMLSelectElement).value as Fag | "Alle" })}>
                ${(["Alle", ...FAG] as const).map((x) => html`<option ?selected=${this.f.fag === x}>${x}</option>`)}
              </select>
            </label>
            <label class="velgfelt">
              Status
              <select @change=${(e: Event) => this.setF({ status: (e.target as HTMLSelectElement).value as StatusFilter })}>
                <option value="apne" ?selected=${this.f.status === "apne"}>Åpne</option>
                <option value="alle" ?selected=${this.f.status === "alle"}>Alle</option>
                ${OPPGAVE_STATUSER.map((x) => html`<option value=${x} ?selected=${this.f.status === x}>${x}</option>`)}
              </select>
            </label>
            <label class="velgfelt">
              Frist
              <select @change=${(e: Event) => this.setF({ frist: (e.target as HTMLSelectElement).value as FristFilter })}>
                <option value="alle" ?selected=${this.f.frist === "alle"}>Alle</option>
                <option value="over" ?selected=${this.f.frist === "over"}>Over frist</option>
                <option value="uke" ?selected=${this.f.frist === "uke"}>Denne uka</option>
                <option value="14d" ?selected=${this.f.frist === "14d"}>Neste 14 dager</option>
              </select>
            </label>
            <span class="sekundar" role="status">${rows.length} oppgaver</span>
          </div>

          <div class="tabellramme">
            <table class="tabell">
              <caption class="visually-hidden">Oppgaver, sortert med over frist først</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Oppgave</th>
                  <th scope="col">Objekt</th>
                  <th scope="col">Fag</th>
                  <th scope="col">Frist</th>
                  <th scope="col">Prioritet</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((o) => {
                  const ds = displayStatus(o, today);
                  const obj = this.objekter.get(o.objekt_globalid);
                  const sel = o.oppgave_id === s.oppgaveValgt;
                  return html`<tr class=${sel ? "is-valgt" : ""} aria-selected=${sel}>
                    <td><strong>${o.oppgave_id}</strong></td>
                    <td>
                      <button class="tabell__lenkeknapp" @click=${() => store.set({ oppgaveValgt: o.oppgave_id })} aria-pressed=${sel}>${o.tittel}</button>
                    </td>
                    <td>
                      <a
                        href="?objekt=${obj?.objekt.objekt_id ?? ""}#/kart"
                        @click=${(e: Event) => {
                          e.preventDefault();
                          this.visIKart(o);
                        }}
                        >${obj?.objekt.navn ?? "…"}</a
                      >
                    </td>
                    <td>${o.fag}</td>
                    <td>${fmtDate(o.frist)}</td>
                    <td><span class="pille ${prioKlasse(o.prioritet)}">${o.prioritet}</span></td>
                    <td><span class="pille ${statusKlasse(ds)}">${ds}</span></td>
                  </tr>`;
                })}
                ${rows.length
                  ? nothing
                  : html`<tr>
                      <td colspan="7" class="tom">
                        ${s.oppgaver.length
                          ? "Ingen oppgaver med valgte filtre."
                          : html`Ingen oppgaver ennå. Opprett oppgaver for avvik og forfalte inspeksjoner under
                              <a href="#/oversikt" @click=${(e: Event) => (e.preventDefault(), navigate("oversikt"))}>Oversikt</a>.`}
                      </td>
                    </tr>`}
              </tbody>
            </table>
          </div>
        </section>

        <aside class="oppgavedetalj" aria-label="Valgt oppgave">${valgt ? this.renderDetalj(valgt, today) : html`<p class="tom oppgavedetalj__tom">Velg en oppgave i tabellen for å se detaljer.</p>`}</aside>
      </div>
      ${this.dialog && valgt ? this.renderDialog(valgt) : nothing}
    `;
  }

  private renderDetalj(o: OppgaveMedLogg, today: Date) {
    const obj = this.objekter.get(o.objekt_globalid);
    const ds = displayStatus(o, today);
    return html`
      <div class="oppgavedetalj__kart">
        <arcgis-map id="minikart" popup-disabled aria-label="Oversiktskart over oppgavens objekt"></arcgis-map>
        <button class="knapp knapp--sekundar oppgavedetalj__aapne" @click=${() => this.visIKart(o)}>Åpne i kart</button>
      </div>
      <div class="oppgavedetalj__innhold">
        <div class="merker">
          <span class="pille ${prioKlasse(o.prioritet)}">${o.prioritet} prioritet</span>
          <span class="pille ${statusKlasse(ds)}">${ds}</span>
        </div>
        <h2>${o.oppgave_id} · ${o.tittel}</h2>
        ${o.beskrivelse ? html`<p>${o.beskrivelse}</p>` : nothing}
        <dl class="detaljgrid">
          <dt>Objekt</dt>
          <dd>${obj?.objekt.navn ?? "–"}</dd>
          <dt>Tildelt</dt>
          <dd>${o.tildelt}</dd>
          <dt>Frist</dt>
          <dd>${fmtDate(o.frist)}</dd>
          <dt>Skjema</dt>
          <dd>${o.skjema ?? "–"}</dd>
        </dl>
        <section class="logg">
          <h3 class="kategori">LOGG</h3>
          ${o.logg.length
            ? html`<ul>
                ${[...o.logg].sort((a, b) => a.tidspunkt.localeCompare(b.tidspunkt)).map((l) => html`<li>${fmtDateTime(l.tidspunkt)} · ${l.tekst}</li>`)}
              </ul>`
            : html`<p class="sekundar">Ingen loggføringer.</p>`}
        </section>
        <div class="knapperad">
          <button class="knapp knapp--primar" ?disabled=${o.status === "Fullført"} @click=${() => this.startInspeksjon(o)}>Start inspeksjon</button>
          <button
            class="knapp knapp--sekundar tildel-knapp"
            @click=${() => {
              this.dialog = true;
              this.requestUpdate();
            }}
          >
            Tildel på nytt
          </button>
        </div>
      </div>
    `;
  }

  private renderDialog(o: OppgaveMedLogg) {
    const { data } = services();
    const close = () => {
      this.dialog = false;
      this.dialogFokus = false;
      this.requestUpdate();
      // Fokus tilbake til knappen som åpnet dialogen
      void this.updateComplete.then(() => this.querySelector<HTMLButtonElement>(".tildel-knapp")?.focus());
    };
    return html`<div class="dialogbakgrunn" @click=${(e: Event) => e.target === e.currentTarget && close()}>
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tildel-tittel"
        @keydown=${(e: KeyboardEvent) => e.key === "Escape" && close()}
      >
        <div class="dialog__hode">
          <h2 id="tildel-tittel">Tildel ${o.oppgave_id} på nytt</h2>
          <button class="ikonknapp" aria-label="Lukk" @click=${close}>${icons.close()}</button>
        </div>
        <label class="felt">
          <span class="felt__etikett">Tildel til</span>
          <select>
            ${[...new Set([...data.user.team, o.tildelt])].map((p) => html`<option ?selected=${p === o.tildelt}>${p}</option>`)}
          </select>
        </label>
        <div class="dialog__fot">
          <button class="knapp knapp--sekundar" @click=${close}>Avbryt</button>
          <button
            class="knapp knapp--primar"
            @click=${async () => {
              // Valget leses fra listen: dialogen tegnes på nytt ved endringer i tilstanden
              const valgt = this.querySelector<HTMLSelectElement>(".dialog select")?.value ?? o.tildelt;
              try {
                await data.reassignTask(o.oppgave_id, valgt);
                store.notify(`${o.oppgave_id} er tildelt ${valgt}`, "suksess");
                dataChanged();
              } catch (e) {
                store.notify(`Kunne ikke tildele: ${e instanceof Error ? e.message : String(e)}`, "feil");
              }
              close();
            }}
          >
            Tildel
          </button>
        </div>
      </div>
    </div>`;
  }
}

customElements.define("svv-tasks-view", SvvTasksView);
