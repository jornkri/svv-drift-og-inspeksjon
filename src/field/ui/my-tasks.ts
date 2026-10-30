import type Geometry from "@arcgis/core/geometry/Geometry.js";
import Point from "@arcgis/core/geometry/Point.js";
import * as distanceOperator from "@arcgis/core/geometry/operators/distanceOperator.js";
import { html, nothing } from "lit";
import type { ObjektTreff, OppgaveMedLogg } from "../../data/DataService.ts";
import { formatDistance } from "../../map/coords.ts";
import { services } from "../../services.ts";
import { navigate } from "../../state/router.ts";
import { store } from "../../state/store.ts";
import { ensureTasks } from "../../tasks/task-store.ts";
import { displayStatus, isOpen, mobileFilter, sortByDistance, type MobilFilter } from "../../tasks/tasks.ts";
import { StoreElement, fmtDate } from "../../ui/base.ts";
import { statusKlasse } from "../../views/tasks-view.ts";
import { startFieldRuntime } from "../field-runtime.ts";

const FILTRE: { id: MobilFilter; label: string }[] = [
  { id: "idag", label: "I dag" },
  { id: "uke", label: "Denne uka" },
  { id: "over", label: "Over frist" },
  { id: "utfort", label: "Utført" },
];

/** Felt: Mine oppgaver, sortert etter avstand. */
export class SvvMyTasks extends StoreElement {
  private filter: MobilFilter = "uke";
  private objekter = new Map<string, ObjektTreff | null>();

  override connectedCallback(): void {
    super.connectedCallback();
    void startFieldRuntime();
    void ensureTasks().then(() => this.loadObjects());
  }

  private async loadObjects() {
    const { data } = services();
    const ids = [...new Set(this.store.state.oppgaver.map((o) => o.objekt_globalid))].filter((id) => !this.objekter.has(id));
    await Promise.all(ids.map(async (id) => this.objekter.set(id, await data.getObject(id).catch(() => null))));
    this.requestUpdate();
  }

  private avstand(o: OppgaveMedLogg): number | null {
    const { gps } = this.store.state;
    const g = this.objekter.get(o.objekt_globalid)?.geometry;
    if (gps.x == null || gps.y == null || !g) return null;
    return distanceOperator.execute(new Point({ x: gps.x, y: gps.y, spatialReference: { wkid: 25833 } }), g as Geometry as never);
  }

  protected override render() {
    const s = this.store.state;
    const { data } = services();
    const today = new Date();
    const mine = s.oppgaver.filter((o) => o.tildelt === data.user.navn);
    const count = (f: MobilFilter) => mobileFilter(mine, f, today).length;
    const list = sortByDistance(mobileFilter(mine, this.filter, today), (o) => this.avstand(o));

    return html`<div class="mineoppgaver">
      <header class="mineoppgaver__hode">
        <div class="mineoppgaver__tittel">
          <h1>Mine oppgaver</h1>
          <span class="sekundar">Sortert: ${s.gps.x != null ? "nærmest" : "frist (venter på posisjon)"}</span>
        </div>
        <div class="filterknapper" role="group" aria-label="Filtrer oppgaver">
          ${FILTRE.map(
            (f) => html`<button
              class="filterknapp ${this.filter === f.id ? "is-valgt" : ""}"
              aria-pressed=${this.filter === f.id}
              @click=${() => {
                this.filter = f.id;
                this.requestUpdate();
              }}
            >
              ${f.label} (${count(f.id)})
            </button>`,
          )}
        </div>
      </header>
      <div class="mineoppgaver__liste">
        <ul aria-label="Oppgaver">
          ${list.map((o) => {
            const obj = this.objekter.get(o.objekt_globalid)?.objekt;
            const d = this.avstand(o);
            const ds = displayStatus(o, today);
            return html`<li>
              <button
                class="oppgavekort"
                @click=${() => {
                  // En fullført oppgave gjenåpnes ikke: inspeksjonen registreres da uten oppgave
                  store.set({ inspeksjon: { globalid: o.objekt_globalid, oppgaveId: isOpen(o) ? o.oppgave_id : null } });
                  navigate("inspeksjon");
                }}
              >
                <span class="oppgavekort__fag oppgavekort__fag--${o.fag.toLowerCase()}" aria-hidden="true"></span>
                <span class="oppgavekort__innhold">
                  <span class="oppgavekort__topp"><strong>${o.tittel}</strong><strong class="oppgavekort__avstand">${d != null ? formatDistance(d) : ""}</strong></span>
                  <span>${obj ? `${obj.navn} · ${o.fag}` : o.fag}</span>
                  <span class="oppgavekort__bunn"><span class="pille ${statusKlasse(ds)}">${ds}</span><span class="sekundar">${o.oppgave_id} · frist ${fmtDate(o.frist)}</span></span>
                </span>
              </button>
            </li>`;
          })}
        </ul>
        ${list.length ? nothing : html`<p class="tom">Ingen oppgaver i dette utvalget.</p>`}
        <div class="statusboks ${s.online ? "statusboks--ok" : "statusboks--frakoblet"}" role="status">
          <strong>${s.online ? "Tilkoblet" : "Frakoblet"}</strong>
          <span
            >${s.online
              ? `${mine.length} oppgaver er lastet. Inspeksjoner du sender uten dekning, lagres på enheten og sendes automatisk senere.`
              : `${s.koAntall} ${s.koAntall === 1 ? "inspeksjon venter" : "inspeksjoner venter"} på dekning.`}</span
          >
        </div>
      </div>
    </div>`;
  }
}

customElements.define("svv-my-tasks", SvvMyTasks);
