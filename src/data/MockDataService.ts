import Graphic from "@arcgis/core/Graphic.js";
import type Geometry from "@arcgis/core/geometry/Geometry.js";
import Point from "@arcgis/core/geometry/Point.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import {
  deriveHistory,
  type DataService,
  type Fotovedlegg,
  type InnsendingResultat,
  type ObjectLayerHandle,
  type ObjektStat,
  type ObjektTreff,
  type OppgaveMedLogg,
  type UserInfo,
} from "./DataService.ts";
import { lagKlientLag, type KlientLagDef } from "./klientlag.ts";
import { queryLayersNearby } from "./query.ts";
import {
  OBJEKT_FIELDS,
  type Dokument,
  type HistorikkPost,
  type Inspeksjon,
  type Objekt,
  type OppgaveStatus,
} from "./schema.ts";

const SR = { wkid: 25833 };

interface MockFeature {
  type: "Feature";
  id: number;
  geometry:
    | { type: "Point"; coordinates: number[] }
    | { type: "LineString"; coordinates: number[][] }
    | { type: "Polygon"; coordinates: number[][][] };
  properties: Objekt & { lag: string };
}

interface MockTables {
  team: string[];
  dokumenter: Dokument[];
  inspeksjoner: Inspeksjon[];
  oppgaver: (Omit<OppgaveMedLogg, "frist" | "logg"> & {
    objekt_id: string;
    frist_dager: number;
    logg: { dager: number; klokke: string; tekst: string }[];
  })[];
}

const LAYER_DEFS: KlientLagDef[] = [
  { key: "va_linje", fag: "VA", kind: "polyline", title: "VA – ledninger" },
  { key: "va_punkt", fag: "VA", kind: "point", title: "VA – kummer og sandfang" },
  { key: "el_linje", fag: "Elektro", kind: "polyline", title: "Elektro – kabelgrøfter" },
  { key: "el_punkt", fag: "Elektro", kind: "point", title: "Elektro – master og skap" },
  { key: "veg_flate", fag: "Veg", kind: "polygon", title: "Veg – flater" },
  { key: "veg_linje", fag: "Veg", kind: "polyline", title: "Veg – rekkverk og kantstein" },
];


const STORAGE_KEY = "svv-di-mock-innsendte";

function toGeometry(g: MockFeature["geometry"]): Geometry {
  switch (g.type) {
    case "Point": {
      const [x, y, z] = g.coordinates;
      return new Point({ x, y, z, spatialReference: SR });
    }
    case "LineString":
      return new Polyline({ paths: [g.coordinates], hasZ: true, spatialReference: SR });
    case "Polygon":
      return new Polygon({ rings: g.coordinates, hasZ: true, spatialReference: SR });
  }
}

function localDateIso(daysFromToday: number, clock = "12:00"): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const [h, m] = clock.split(":").map(Number);
  d.setHours(h ?? 12, m ?? 0, 0, 0);
  return d.toISOString();
}

/**
 * Mock-implementasjon med klientbaserte FeatureLayers fra lokal GeoJSON
 * (src/data/mock/objekter.geo.json). Kjører helt uten portaltilgang.
 */
export class MockDataService implements DataService {
  readonly mode = "mock" as const;
  readonly objektFields = OBJEKT_FIELDS;
  user: UserInfo = { navn: "Kari Nordmann", brukernavn: "kari.nordmann", initialer: "KN", team: [] };

  private objekter: { objekt: Objekt; geometry: Geometry; lag: string; oid: number }[] = [];
  private dokumenter: Dokument[] = [];
  private inspeksjoner: Inspeksjon[] = [];
  private oppgaver: OppgaveMedLogg[] = [];
  private queryLayers: FeatureLayer[] = [];
  private createdLayers: ObjectLayerHandle[] = [];

  async init(): Promise<void> {
    const [geo, tab] = await Promise.all([
      import("./mock/objekter.geo.json").then((m) => m.default as unknown as { features: MockFeature[] }),
      import("./mock/tabeller.json").then((m) => m.default as unknown as MockTables),
    ]);
    this.objekter = geo.features.map((f) => {
      const { lag, ...objekt } = f.properties;
      return { objekt, geometry: toGeometry(f.geometry), lag, oid: f.id };
    });
    this.dokumenter = tab.dokumenter;
    this.inspeksjoner = [...tab.inspeksjoner, ...this.loadSubmitted()];
    this.user = { ...this.user, team: tab.team };
    this.oppgaver = tab.oppgaver.map(({ frist_dager, logg, objekt_id: _objektId, ...rest }) => ({
      ...rest,
      frist: localDateIso(frist_dager).slice(0, 10),
      logg: logg.map((l) => ({ tidspunkt: localDateIso(l.dager, l.klokke), tekst: l.tekst })),
    }));
    // Innsendte inspeksjoner (fra tidligere økter) oppdaterer status
    for (const i of this.loadSubmitted()) this.applyStatus(i);
    this.queryLayers = this.buildLayers().map((h) => h.layer);
  }

  createObjectLayers(): ObjectLayerHandle[] {
    const handles = this.buildLayers();
    this.createdLayers.push(...handles);
    return handles;
  }

  async createReferenceLayers() {
    return [];
  }

  private buildLayers(): ObjectLayerHandle[] {
    return lagKlientLag(LAYER_DEFS, this.objekter);
  }


  async objectStats(): Promise<ObjektStat[]> {
    return this.objekter.map(({ objekt: o }) => ({
      globalid: o.globalid,
      fag: o.fag,
      objekttype: o.objekttype,
      mmi: o.mmi,
      status_inspeksjon: o.status_inspeksjon,
      revisjon: o.revisjon,
      modellfil: o.modellfil,
      rev_dato: o.rev_dato,
      fagmodell: o.fagmodell,
    }));
  }

  private treff(o: (typeof this.objekter)[number]): ObjektTreff {
    return { objekt: { ...o.objekt }, geometry: o.geometry.clone() };
  }

  async getObject(globalid: string) {
    const o = this.objekter.find((x) => x.objekt.globalid === globalid);
    return o ? this.treff(o) : null;
  }

  async findByObjektId(objektId: string) {
    const id = objektId.trim().toUpperCase();
    const o = this.objekter.find((x) => x.objekt.objekt_id.toUpperCase() === id || x.objekt.navn.toUpperCase() === id);
    return o ? this.treff(o) : null;
  }

  async search(text: string, limit = 8) {
    const q = text.trim().toUpperCase();
    if (!q) return [];
    return this.objekter
      .filter((x) => x.objekt.objekt_id.toUpperCase().includes(q) || x.objekt.navn.toUpperCase().includes(q))
      .sort((a, b) => Number(!a.objekt.objekt_id.toUpperCase().startsWith(q)) - Number(!b.objekt.objekt_id.toUpperCase().startsWith(q)))
      .slice(0, limit)
      .map((o) => this.treff(o));
  }

  queryNearby(x: number, y: number, radiusM: number) {
    return queryLayersNearby(this.queryLayers, this.objektFields, x, y, radiusM);
  }

  async getDocuments(globalid: string) {
    return this.dokumenter.filter((d) => d.objekt_globalid === globalid);
  }

  async getInspections(globalid: string) {
    return this.inspeksjoner
      .filter((i) => i.objekt_globalid === globalid)
      .sort((a, b) => b.tidspunkt.localeCompare(a.tidspunkt));
  }

  async allInspections() {
    return [...this.inspeksjoner];
  }

  async getHistory(objekt: Objekt): Promise<HistorikkPost[]> {
    return deriveHistory(objekt, await this.getInspections(objekt.globalid));
  }

  async getTasks() {
    return this.oppgaver.map((o) => ({ ...o, logg: [...o.logg] }));
  }

  async reassignTask(oppgaveId: string, tildelt: string) {
    const o = this.oppgaver.find((x) => x.oppgave_id === oppgaveId);
    if (!o) throw new Error(`Fant ikke oppgave ${oppgaveId}`);
    o.tildelt = tildelt;
    o.logg.push({ tidspunkt: new Date().toISOString(), tekst: `Tildelt ${tildelt}` });
  }

  async setTaskStatus(oppgaveId: string, status: OppgaveStatus) {
    const o = this.oppgaver.find((x) => x.oppgave_id === oppgaveId);
    if (!o) throw new Error(`Fant ikke oppgave ${oppgaveId}`);
    o.status = status;
    o.logg.push({ tidspunkt: new Date().toISOString(), tekst: `Status endret til ${status}` });
  }

  async createTask(o: Omit<OppgaveMedLogg, "oppgave_id" | "logg">): Promise<string> {
    const max = Math.max(1000, ...this.oppgaver.map((x) => Number(x.oppgave_id.replace(/\D/g, "")) || 0));
    const oppgave_id = `OPG-${max + 1}`;
    this.oppgaver.push({
      ...o,
      oppgave_id,
      logg: [{ tidspunkt: new Date().toISOString(), tekst: `Opprettet av ${this.user.navn}` }],
    });
    return oppgave_id;
  }

  async submitInspection(insp: Inspeksjon, bilder: Fotovedlegg[]): Promise<InnsendingResultat> {
    const globalid = insp.globalid ?? `{${crypto.randomUUID().toUpperCase()}}`;
    const saved: Inspeksjon = { ...insp, globalid, antall_bilder: bilder.length };
    this.inspeksjoner.push(saved);
    const submitted = this.loadSubmitted();
    submitted.push(saved);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(submitted));
    } catch {
      /* lagring er bare en bekvemmelighet i mock */
    }
    this.applyStatus(saved);
    if (insp.oppgave_id) await this.setTaskStatus(insp.oppgave_id, "Klar for kontroll").catch(() => undefined);
    return { globalid, vedleggFeilet: 0 };
  }

  private loadSubmitted(): Inspeksjon[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Inspeksjon[];
    } catch {
      return [];
    }
  }

  /** Oppdaterer inspeksjonsstatus på objektet og i alle lag som er laget. */
  private applyStatus(i: Inspeksjon) {
    const status = i.tilstandsgrad >= 2 ? "Avvik" : "OK";
    const o = this.objekter.find((x) => x.objekt.globalid === i.objekt_globalid);
    if (!o) return;
    o.objekt.status_inspeksjon = status;
    // Lag fra kartvisninger som er lukket, er ødelagt og skal ikke oppdateres
    this.createdLayers = this.createdLayers.filter((h) => !h.layer.destroyed);
    for (const layer of [...this.createdLayers.map((h) => h.layer), ...this.queryLayers]) {
      if (!layer.loaded || layer.destroyed) continue;
      layer
        .applyEdits({ updateFeatures: [new Graphic({ attributes: { oid: o.oid, status_inspeksjon: status } })] })
        .catch((e: unknown) => console.warn("Kunne ikke oppdatere status i mocklag", e));
    }
  }
}
