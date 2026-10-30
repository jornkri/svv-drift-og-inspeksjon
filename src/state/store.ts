import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { BasemapId } from "../config.ts";
import type { ObjektTreff } from "../data/DataService.ts";
import { DEFAULT_FILTERS, type FilterState } from "../filters/filters.ts";
import type { PhaseId } from "../filters/mmi.ts";

export type Route = "kart" | "3d" | "oppgaver" | "oversikt" | "inspeksjon" | "verktoy" | "meg" | "rapport";
export type Popover = "fag" | "mmi" | "inspeksjon" | "ekstra" | "bakgrunn" | "maaling" | "utskrift" | null;

export interface Counts {
  shown: number;
  total: number;
  perPhase: Record<PhaseId, number>;
  perFag: Record<string, number>;
  /** Antall per "Fag|Objekttype" (før lagpanelets avkrysning) */
  perType: Record<string, number>;
}

export interface GpsState {
  aktiv: boolean;
  simulert: boolean;
  /** Simulert posisjon flyttet manuelt (står stille til turen fortsetter) */
  manuell: boolean;
  x: number | null;
  y: number | null;
  noyaktighet: number | null;
  retning: number | null;
  feil: string | null;
}

export interface NaerTreff extends ObjektTreff {
  avstand: number;
}

export interface AppState {
  route: Route;
  filters: FilterState;
  colorByMmi: boolean;
  layerPanelOpen: boolean;
  layerPanelTab: "lag" | "tegnforklaring";
  popover: Popover;
  basemap: BasemapId;
  /** Synlighet for referanselag (id → på/av) */
  referanse: Record<string, boolean>;
  counts: Counts | null;
  /** Valgte treff fra kartklikk eller søk */
  selection: { globalids: string[]; index: number } | null;
  /** Objekt som skal inspiseres (globalid) og eventuell oppgave */
  inspeksjon: { globalid: string; oppgaveId: string | null } | null;
  gps: GpsState;
  /** Nærmeste objekt og andre i nærheten (fra geofence) */
  naer: NaerTreff[];
  online: boolean;
  koAntall: number;
  /** Tvungen feltvisning (mobil) uavhengig av skjermbredde */
  felt: boolean;
  oppgaveValgt: string | null;
  meldinger: { id: number; tekst: string; type: "info" | "suksess" | "feil" }[];
  /** Forespørsel om å zoome til et objekt (globalid) – konsumeres av aktiv visning */
  zoomTil: string | null;
  /** 3D: vis punktskyen og gjør vegmodellen halvgjennomsiktig ved neste zoom (kontroll mot punktsky) */
  punktskyFokus: boolean;
  /** Søkeresultat som ikke er et objekt (vegreferanse, adresse) */
  markor: { x: number; y: number; tekst: string } | null;
  /** Økes når data er endret (ny inspeksjon o.l.) slik at visninger kan laste på nytt */
  dataVersjon: number;
  oppgaver: import("../data/DataService.ts").OppgaveMedLogg[];
  /** Standardobjekt for inspeksjon i felt (globalid; nærmeste eller valgt fra listen) */
  valgtNaer: string | null;
  /** Kartet følger brukerens posisjon */
  folg: boolean;
  /** Simulert frakoblet modus (test av køen) */
  simFrakoblet: boolean;
  /** Valgt vegobjekt fra NVDB (ekte driftsdata) */
  nvdbValgt: { typeId: number; id: number } | null;
  /** Antall NVDB-objekter i kartutsnittet per type */
  nvdbAntall: Record<number, number>;
  /** Skjulte NVDB-typer (overstyrer standardvalget) */
  nvdbTyper: Record<number, boolean>;
  /** Valgt årgang for historiske flyfoto (null = av) */
  flyfotoAar: number | null;
  /** Resultat av identify i temalag */
  temaTreff: { x: number; y: number; treff: import("../map/tema-layers.ts").TemaTreff[] } | null;
}

export const initialState: AppState = {
  route: "kart",
  filters: DEFAULT_FILTERS,
  colorByMmi: true,
  layerPanelOpen: true,
  layerPanelTab: "lag",
  popover: null,
  basemap: "graatone",
  referanse: { nvdb: true },
  counts: null,
  selection: null,
  inspeksjon: null,
  gps: { aktiv: false, simulert: false, manuell: false, x: null, y: null, noyaktighet: null, retning: null, feil: null },
  naer: [],
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  koAntall: 0,
  felt: false,
  oppgaveValgt: null,
  meldinger: [],
  zoomTil: null,
  punktskyFokus: false,
  markor: null,
  dataVersjon: 0,
  oppgaver: [],
  valgtNaer: null,
  folg: true,
  simFrakoblet: false,
  nvdbValgt: null,
  nvdbAntall: {},
  nvdbTyper: {},
  flyfotoAar: null,
  temaTreff: null,
};

type Listener = (s: AppState, prev: AppState) => void;

export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor(init: AppState) {
    this.state = init;
  }

  get(): AppState {
    return this.state;
  }

  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
    const prev = this.state;
    const p = typeof patch === "function" ? patch(prev) : patch;
    this.state = { ...prev, ...p };
    for (const l of this.listeners) l(this.state, prev);
  }

  setFilters(patch: Partial<FilterState>): void {
    this.set((s) => ({ filters: { ...s.filters, ...patch } }));
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Lytter bare når valgt del av tilstanden endres (referanselikhet). */
  select<T>(pick: (s: AppState) => T, cb: (v: T, prev: T) => void): () => void {
    return this.subscribe((s, prev) => {
      const a = pick(s);
      const b = pick(prev);
      if (a !== b) cb(a, b);
    });
  }

  private msgId = 0;
  notify(tekst: string, type: "info" | "suksess" | "feil" = "info"): void {
    const id = ++this.msgId;
    this.set((s) => ({ meldinger: [...s.meldinger, { id, tekst, type }] }));
    setTimeout(() => this.set((s) => ({ meldinger: s.meldinger.filter((m) => m.id !== id) })), 5000);
  }
}

export const store = new Store(initialState);

/** Lit-kontroller som ber komponenten tegne seg på nytt når tilstanden endres. */
export class StoreController implements ReactiveController {
  private unsub?: () => void;
  constructor(
    private host: ReactiveControllerHost,
    private s: Store = store,
  ) {
    host.addController(this);
  }
  get state(): AppState {
    return this.s.get();
  }
  hostConnected() {
    this.unsub = this.s.subscribe(() => this.host.requestUpdate());
  }
  hostDisconnected() {
    this.unsub?.();
  }
}
