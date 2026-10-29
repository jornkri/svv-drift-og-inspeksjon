import type Geometry from "@arcgis/core/geometry/Geometry.js";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import type {
  Dokument,
  Fag,
  HistorikkPost,
  Inspeksjon,
  LoggPost,
  Objekt,
  Oppgave,
  OppgaveStatus,
} from "./schema.ts";

export type GeometryKind = "point" | "polyline" | "polygon";

/** Et objektlag slik en visning (2D/3D) bruker det. */
export interface ObjectLayerHandle {
  key: string;
  fag: Fag;
  geometryKind: GeometryKind;
  title: string;
  layer: FeatureLayer;
}

export interface ObjektTreff {
  objekt: Objekt;
  geometry: Geometry;
}

/** Attributtene som trengs for telling i filter og lagpanel. */
export type ObjektStat = Pick<
  Objekt,
  "globalid" | "fag" | "objekttype" | "mmi" | "status_inspeksjon" | "revisjon" | "modellfil" | "rev_dato" | "fagmodell"
>;

export interface UserInfo {
  navn: string;
  brukernavn: string;
  initialer: string;
  /** Navn på personer i brukerens team (for «Teamet» i oppgaver og «Tildel på nytt») */
  team: string[];
}

export interface OppgaveMedLogg extends Oppgave {
  logg: LoggPost[];
}

export interface Fotovedlegg {
  id: string;
  blob: Blob;
  navn: string;
  /** Posisjon (EPSG:25833) og retning (grader fra nord) da bildet ble tatt */
  x: number | null;
  y: number | null;
  retning: number | null;
  noyaktighet_m: number | null;
  tidspunkt: string;
}

export interface InnsendingResultat {
  globalid: string;
  vedleggFeilet: number;
}

export interface DataService {
  readonly mode: "mock" | "portal";
  readonly user: UserInfo;
  /** Feltnavnene i objektlagene (brukes i where-uttrykk og renderere). */
  readonly objektFields: import("./schema.ts").FieldMap<Objekt>;
  init(): Promise<void>;

  /** Nye lagforekomster for én visning (et lag kan bare ligge i ett kart om gangen). */
  createObjectLayers(): ObjectLayerHandle[];
  /** Ekstra referanselag fra webkartet (portal), som ikke er objektlag. */
  createReferenceLayers(): Promise<import("@arcgis/core/layers/Layer.js").default[]>;

  objectStats(): Promise<ObjektStat[]>;
  getObject(globalid: string): Promise<ObjektTreff | null>;
  findByObjektId(objektId: string): Promise<ObjektTreff | null>;
  search(text: string, limit?: number): Promise<ObjektTreff[]>;
  /** Objekter innenfor radius (meter) fra et punkt i EPSG:25833. Usortert. */
  queryNearby(x: number, y: number, radiusM: number): Promise<ObjektTreff[]>;

  getDocuments(globalid: string): Promise<Dokument[]>;
  getInspections(globalid: string): Promise<Inspeksjon[]>;
  getHistory(objekt: Objekt): Promise<HistorikkPost[]>;

  getTasks(): Promise<OppgaveMedLogg[]>;
  reassignTask(oppgaveId: string, tildelt: string): Promise<void>;
  setTaskStatus(oppgaveId: string, status: OppgaveStatus): Promise<void>;

  submitInspection(insp: Inspeksjon, bilder: Fotovedlegg[]): Promise<InnsendingResultat>;
}

/** Historikk utledet fra objektfeltene og inspeksjonene (felles for mock og portal). */
export function deriveHistory(o: Objekt, insp: Inspeksjon[]): HistorikkPost[] {
  const out: HistorikkPost[] = [];
  if (o.lastet_inn) out.push({ tidspunkt: o.lastet_inn, tekst: `Modell lastet inn (${o.modellfil ?? "ukjent modellfil"})` });
  if (o.rev_dato) out.push({ tidspunkt: o.rev_dato, tekst: `Rev. ${o.revisjon ?? "–"} godkjent` });
  for (const i of insp) out.push({ tidspunkt: i.tidspunkt, tekst: `Inspeksjon registrert av ${i.inspektor} (TG ${i.tilstandsgrad})` });
  return out.sort((a, b) => b.tidspunkt.localeCompare(a.tidspunkt));
}
