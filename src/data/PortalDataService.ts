import Graphic from "@arcgis/core/Graphic.js";
import type Geometry from "@arcgis/core/geometry/Geometry.js";
import type Layer from "@arcgis/core/layers/Layer.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import type Portal from "@arcgis/core/portal/Portal.js";
import WebMap from "@arcgis/core/WebMap.js";
import WebScene from "@arcgis/core/WebScene.js";
import type { AppConfig, LayerRef } from "../config.ts";
import { bimTilObjekter, erBimLag, fagFraTittel, finnLag, manglendeFelt, tilpassFelt, type AutoMapping, type LagInfo } from "./auto-mapping.ts";
import { objekttypeRenderer, registrerKildeSymboler } from "../map/kildestil.ts";
import { hentVegreferanse } from "../nvdb/vegobjekter.ts";
import { lagKlientLag, type KlientLagDef, type KlientObjekt } from "./klientlag.ts";
import {
  deriveHistory,
  type DataService,
  type Fotovedlegg,
  type GeometryKind,
  type InnsendingResultat,
  type ObjectLayerHandle,
  type ObjektStat,
  type ObjektTreff,
  type OppgaveMedLogg,
  type UserInfo,
} from "./DataService.ts";
import { queryLayersNearby, queryLayersWhere } from "./query.ts";
import {
  FAG,
  OBJEKT_FIELDS,
  fromAttributes,
  sqlString,
  toAttributes,
  type Dokument,
  type Fag,
  type Inspeksjon,
  type Objekt,
  type Oppgave,
  type OppgaveStatus,
} from "./schema.ts";

interface ResolvedLayer {
  fag: Fag;
  url: string;
  title: string;
  kind: GeometryKind;
  /** Utvalg når ett lag inneholder flere fag */
  where?: string;
}

export interface DiagnoseRad {
  tittel: string;
  type: string;
  url: string;
  rolle: string;
  redigerbar: boolean;
  wkid: number | null;
  felt: string[];
  /** Logiske felt i mappingen som laget mangler */
  mangler: string[];
}

/** Lokal lagring når webkartet mangler inspeksjons- eller oppgavetabell (demo/pilot). */
const LOKAL_INSP = "svv-di-portal-inspeksjoner";
const LOKAL_OPPG = "svv-di-portal-oppgaver";

function lesLokalt<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function skrivLokalt<T>(key: string, v: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* full eller blokkert lagring – posten finnes fortsatt i minnet */
  }
}

function lagUrl(l: FeatureLayer | null | undefined): string {
  if (!l?.url) return "";
  return /\/\d+$/.test(l.url) || l.layerId == null ? l.url : `${l.url}/${l.layerId}`;
}

/** Enkeltlag (grupper flates ut) som ikke er objektlag eller tabeller, klonet for en ny visning. */
function referanselag(alle: Layer[], brukt: Set<string>): Layer[] {
  return alle
    .filter((l) => l.type !== "group")
    .filter((l) => !(l.type === "feature" && brukt.has(lagUrl(l as FeatureLayer))))
    .flatMap((l) => {
      const k = l as unknown as { clone?: () => Layer };
      return typeof k.clone === "function" ? [k.clone()] : [];
    });
}

function geometriType(l: FeatureLayer): GeometryKind {
  return l.geometryType === "point" || l.geometryType === "multipoint" ? "point" : l.geometryType === "polygon" ? "polygon" : "polyline";
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase())
    .slice(0, 2)
    .join("");

/**
 * Implementasjon mot ekte feature-tjenester i portalen (ArcGIS Enterprise eller ArcGIS Online).
 *
 * Lagene hentes fra VITE_LAYERS_* og tabell-variablene. Er ingen av dem satt, kartlegges
 * webkartet automatisk ut fra feltene (se auto-mapping.ts). Mangler inspeksjons- eller
 * oppgavetabell, lagres postene lokalt i nettleseren. Se ?diagnose=1 for lag og felt.
 */
export class PortalDataService implements DataService {
  readonly mode = "portal" as const;
  user: UserInfo = { navn: "", brukernavn: "", initialer: "", team: [] };
  objektFields: AppConfig["fields"]["objekt"];
  /** Resultatet av automatisk kartlegging (null når lagene er konfigurert) */
  auto: AutoMapping | null = null;
  /** Tabeller som mangler i webkartet, og som derfor lagres lokalt */
  lokalt: ("inspeksjoner" | "oppgaver")[] = [];

  private fields: AppConfig["fields"];
  private webmap: WebMap | null = null;
  private webscenePromise: Promise<WebScene | null> | null = null;
  private resolved: ResolvedLayer[] = [];
  private queryLayers: FeatureLayer[] = [];
  private objektFeltFinnes = new Set<string>();
  private inspTable: FeatureLayer | null = null;
  private dokTable: FeatureLayer | null = null;
  private oppgaveLayer: FeatureLayer | null = null;
  /** BIM-lag (IFC-eksport) lest inn og gjort om til appens skjema i klientlag */
  private klient: { objekter: KlientObjekt[]; defs: KlientLagDef[]; urler: Set<string> } | null = null;
  private klientHandles: ObjectLayerHandle[] = [];
  private lokalInsp = lesLokalt<Inspeksjon>(LOKAL_INSP);
  private lokalOppg = lesLokalt<OppgaveMedLogg>(LOKAL_OPPG);

  constructor(
    private readonly cfg: AppConfig,
    readonly portal: Portal,
  ) {
    this.fields = { ...cfg.fields };
    this.objektFields = cfg.fields.objekt;
  }

  async init(): Promise<void> {
    const u = this.portal.user;
    const navn = u?.fullName || u?.username || "Ukjent bruker";
    this.user = {
      navn,
      brukernavn: u?.username ?? "",
      initialer: initialsOf(navn),
      // TODO(SVV): hent teamet fra en portalgruppe eller oppgavelaget
      team: [navn],
    };

    if (this.cfg.webmapId) {
      this.webmap = new WebMap({ portalItem: { id: this.cfg.webmapId, portal: this.portal } });
      await this.webmap.loadAll();
    }

    const konfigurert = FAG.some((f) => this.cfg.layers[f].length) || !!(this.cfg.inspeksjonTable || this.cfg.oppgaveLayer || this.cfg.dokumentTable);
    if (konfigurert || !this.webmap) {
      for (const fag of FAG) {
        for (const ref of this.cfg.layers[fag]) {
          const layer = await this.resolveFeatureLayer(ref);
          if (!layer) continue;
          await layer.load();
          this.resolved.push({ fag, url: lagUrl(layer), title: layer.title ?? fag, kind: geometriType(layer) });
        }
      }
      this.inspTable = this.cfg.inspeksjonTable ? await this.resolveFeatureLayer(this.cfg.inspeksjonTable) : null;
      this.dokTable = this.cfg.dokumentTable ? await this.resolveFeatureLayer(this.cfg.dokumentTable) : null;
      this.oppgaveLayer = this.cfg.oppgaveLayer ? await this.resolveFeatureLayer(this.cfg.oppgaveLayer) : null;
    } else {
      await this.autoKartlegg();
    }
    await Promise.all([this.inspTable?.load(), this.dokTable?.load(), this.oppgaveLayer?.load()]);

    if (this.klient) {
      this.objektFields = OBJEKT_FIELDS;
      this.objektFeltFinnes = new Set(Object.values(OBJEKT_FIELDS));
      this.queryLayers = lagKlientLag(this.klient.defs, this.klient.objekter).map((h) => h.layer);
      this.lokalt = [...(this.inspTable ? [] : (["inspeksjoner"] as const)), ...(this.oppgaveLayer ? [] : (["oppgaver"] as const))];
      for (const i of this.lokalInsp) this.oppdaterKlientStatus(i);
      return;
    }

    // Feltnavn med andre store/små bokstaver enn mappingen (vanlig i ArcGIS Online)
    const forste = this.resolved[0] ? new FeatureLayer({ url: this.resolved[0].url }) : null;
    await forste?.load().catch(() => undefined);
    const feltnavn = (l: FeatureLayer | null) => (l?.fields ?? []).map((f) => f.name);
    if (forste?.fields) this.fields.objekt = tilpassFelt(this.fields.objekt, feltnavn(forste));
    if (this.inspTable?.fields) this.fields.inspeksjon = tilpassFelt(this.fields.inspeksjon, feltnavn(this.inspTable));
    if (this.dokTable?.fields) this.fields.dokument = tilpassFelt(this.fields.dokument, feltnavn(this.dokTable));
    if (this.oppgaveLayer?.fields) this.fields.oppgave = tilpassFelt(this.fields.oppgave, feltnavn(this.oppgaveLayer));
    this.objektFields = this.fields.objekt;
    this.objektFeltFinnes = new Set(feltnavn(forste));

    this.queryLayers = this.resolved.map((r) => new FeatureLayer({ url: r.url, outFields: ["*"], ...(r.where ? { definitionExpression: r.where } : {}) }));
    this.lokalt = [...(this.inspTable ? [] : (["inspeksjoner"] as const)), ...(this.oppgaveLayer ? [] : (["oppgaver"] as const))];
  }

  /** Lag og tabeller i webkartet med felt (for automatisk kartlegging og diagnose). */
  private async lagIWebkartet(): Promise<{ info: LagInfo; layer: FeatureLayer }[]> {
    if (!this.webmap) return [];
    const alle = [...this.webmap.allLayers.toArray(), ...this.webmap.allTables.toArray()].filter((l) => l.type === "feature") as FeatureLayer[];
    const ut = await Promise.all(
      alle.map(async (l) => {
        await l.load().catch(() => undefined);
        if (!l.loaded || !l.url) return null;
        const info: LagInfo = {
          tittel: l.title ?? "(uten tittel)",
          type: l.isTable || !l.geometryType ? "table" : "layer",
          url: lagUrl(l),
          felt: (l.fields ?? []).map((f) => f.name),
        };
        return { info, layer: l };
      }),
    );
    return ut.filter((x): x is { info: LagInfo; layer: FeatureLayer } => !!x);
  }

  private async autoKartlegg() {
    const lag = await this.lagIWebkartet();
    const m = (this.auto = finnLag(lag.map((l) => l.info)));
    for (const info of m.objektlag) {
      const l = lag.find((x) => x.info === info)!.layer;
      const kind = geometriType(l);
      const fagFelt = l.fields?.find((f) => f.name.toLowerCase() === this.cfg.fields.objekt.fag.toLowerCase())?.name;
      let fager: Fag[] = [];
      if (fagFelt) {
        const fs = await l.queryFeatures({ where: "1=1", outFields: [fagFelt], returnDistinctValues: true, returnGeometry: false }).catch(() => null);
        fager = (fs?.features ?? []).map((g) => g.attributes[fagFelt] as Fag).filter((v) => FAG.includes(v));
      }
      if (fager.length <= 1) {
        this.resolved.push({ fag: fager[0] ?? fagFraTittel(info.tittel), url: info.url, title: info.tittel, kind });
      } else {
        for (const fag of fager) {
          this.resolved.push({ fag, url: info.url, title: `${info.tittel} – ${fag}`, kind, where: `${fagFelt} = ${sqlString(fag)}` });
        }
      }
    }
    if (!m.objektlag.length) {
      const bim = lag.filter((l) => erBimLag(l.info));
      if (bim.length) await this.lastBim(bim);
    }
    const tabell = (i: LagInfo | null) => (i ? new FeatureLayer({ url: i.url, outFields: ["*"] }) : null);
    this.inspTable = tabell(m.inspeksjon);
    this.oppgaveLayer = tabell(m.oppgave);
    this.dokTable = tabell(m.dokument);
  }

  /**
   * Leser alle objekter i BIM-lagene (IFC → ArcGIS) og gjør dem om til appens skjema.
   * Egnet for prosjektmodeller (hundrer til noen tusen objekter); store forvaltningslag
   * bør i stedet konfigureres med VITE_LAYERS_* og feltmapping.
   */
  private async lastBim(lag: { info: LagInfo; layer: FeatureLayer }[]) {
    const objekter: KlientObjekt[] = [];
    const defs: KlientLagDef[] = [];
    let oid = 1;
    for (const [i, { info, layer }] of lag.entries()) {
      const rader: { attrs: Record<string, unknown>; geometry: Geometry }[] = [];
      const pageSize = layer.capabilities?.query.maxRecordCount ?? 1000;
      for (let start = 0; ; start += pageSize) {
        const fs = await layer.queryFeatures({ where: "1=1", outFields: ["*"], returnGeometry: true, returnZ: true, outSpatialReference: { wkid: 25833 }, start, num: pageSize });
        rader.push(...fs.features.filter((f) => f.geometry).map((f) => ({ attrs: f.attributes as Record<string, unknown>, geometry: f.geometry! })));
        if (!fs.exceededTransferLimit) break;
      }
      const konvertert = bimTilObjekter(rader.map((r) => ({ attrs: r.attrs, lagTittel: info.tittel })));
      const key = `bim-${i}`;
      const egne = konvertert.flatMap((o, j) => (o ? [{ objekt: o, geometry: rader[j]!.geometry, lag: key, oid: oid++ }] : []));
      if (!egne.length) continue;
      objekter.push(...egne);
      const fag = FAG.map((f) => [f, egne.filter((o) => o.objekt.fag === f).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
      // Symbolisering som i webkartet (unike verdier på Objekttype)
      const renderer = objekttypeRenderer(layer.renderer);
      if (renderer) registrerKildeSymboler(fag, renderer);
      defs.push({ key, fag, kind: geometriType(layer), title: info.tittel.replace(/\s*2D$/i, ""), ...(renderer ? { renderer } : {}) });
    }
    // Objekt-ID-er må være unike på tvers av lagene
    const sett = new Map<string, number>();
    for (const o of objekter) sett.set(o.objekt.objekt_id, (sett.get(o.objekt.objekt_id) ?? 0) + 1);
    for (const o of objekter) if ((sett.get(o.objekt.objekt_id) ?? 0) > 1) o.objekt.objekt_id = `${o.objekt.objekt_id} (${o.objekt.fag})`;
    this.klient = { objekter, defs, urler: new Set(lag.map((l) => l.info.url)) };
  }

  /** Oppdaterer inspeksjonsstatus i klientlagene etter en lokal inspeksjon. */
  private oppdaterKlientStatus(i: Inspeksjon) {
    const o = this.klient?.objekter.find((x) => x.objekt.globalid === i.objekt_globalid);
    if (!o) return;
    const status = i.tilstandsgrad >= 2 ? "Avvik" : "OK";
    o.objekt.status_inspeksjon = status;
    this.klientHandles = this.klientHandles.filter((h) => !h.layer.destroyed);
    for (const layer of [...this.klientHandles.map((h) => h.layer), ...this.queryLayers]) {
      if (!layer.loaded || layer.destroyed) continue;
      layer
        .applyEdits({ updateFeatures: [new Graphic({ attributes: { oid: o.oid, status_inspeksjon: status } })] })
        .catch((e: unknown) => console.warn("Kunne ikke oppdatere status i klientlag", e));
    }
  }

  /** Webscenen (VITE_WEBSCENE_ID) for 3D, lastet én gang. */
  webscene(): Promise<WebScene | null> {
    if (!this.cfg.websceneId) return Promise.resolve(null);
    this.webscenePromise ??= (async () => {
      const ws = new WebScene({ portalItem: { id: this.cfg.websceneId, portal: this.portal } });
      await ws.loadAll();
      return ws;
    })().catch((e: unknown) => {
      console.warn("Webscenen kunne ikke lastes", e);
      return null;
    });
    return this.webscenePromise;
  }

  private async resolveFeatureLayer(ref: LayerRef): Promise<FeatureLayer | null> {
    if (ref.kind === "url") return new FeatureLayer({ url: ref.url, outFields: ["*"] });
    const all = [...(this.webmap?.allLayers.toArray() ?? []), ...(this.webmap?.allTables.toArray() ?? [])];
    const hit = all.find((l) => l.title?.trim().toLowerCase() === ref.title.toLowerCase());
    if (hit && hit.type === "feature") return new FeatureLayer({ url: lagUrl(hit as FeatureLayer), outFields: ["*"] });
    console.warn(`Fant ikke laget «${ref.title}» i webkartet`);
    return null;
  }

  /** URL-ene til objektlagene og tabellene (de vises ikke som referanselag). */
  private brukteUrler(): Set<string> {
    return new Set(
      [...this.resolved.map((r) => r.url), ...(this.klient?.urler ?? []), lagUrl(this.inspTable), lagUrl(this.oppgaveLayer), lagUrl(this.dokTable)].filter(Boolean),
    );
  }

  createObjectLayers(): ObjectLayerHandle[] {
    if (this.klient) {
      const handles = lagKlientLag(this.klient.defs, this.klient.objekter);
      this.klientHandles.push(...handles);
      return handles;
    }
    return this.resolved.map((r, i) => ({
      key: `${r.fag}-${i}`,
      fag: r.fag,
      geometryKind: r.kind,
      title: r.title,
      layer: new FeatureLayer({
        url: r.url,
        outFields: ["*"],
        popupEnabled: false,
        elevationInfo: { mode: "absolute-height" },
        ...(r.where ? { definitionExpression: r.where } : {}),
      }),
    }));
  }

  async createReferenceLayers(): Promise<Layer[]> {
    if (!this.webmap) return [];
    return referanselag(this.webmap.allLayers.toArray(), this.brukteUrler());
  }

  /** Operative lag i webscenen som ikke er objektlag (fagmodeller, bygg, mesh osv.). */
  async sceneLag(): Promise<Layer[]> {
    const ws = await this.webscene();
    if (!ws) return [];
    return referanselag(ws.allLayers.toArray(), this.brukteUrler());
  }

  async objectStats(): Promise<ObjektStat[]> {
    const f = this.objektFields;
    const alle = [f.globalid, f.fag, f.objekttype, f.mmi, f.status_inspeksjon, f.revisjon, f.modellfil, f.rev_dato, f.fagmodell];
    // Felt laget ikke har, gir feil i spørringen
    const outFields = this.objektFeltFinnes.size ? alle.filter((x) => this.objektFeltFinnes.has(x)) : alle;
    const out: ObjektStat[] = [];
    for (const layer of this.queryLayers) {
      const pageSize = layer.capabilities?.query.maxRecordCount ?? 1000;
      for (let start = 0; ; start += pageSize) {
        const fs = await layer.queryFeatures({ where: "1=1", outFields, returnGeometry: false, start, num: pageSize });
        out.push(...fs.features.map((g) => fromAttributes<Objekt>(g.attributes, f)));
        if (!fs.exceededTransferLimit) break;
      }
    }
    return out.map((o) => this.medLokalStatus(o));
  }

  /** Status fra lokale inspeksjoner (når inspeksjonstabellen mangler). */
  private medLokalStatus<T extends Pick<Objekt, "globalid" | "status_inspeksjon">>(o: T): T {
    if (!this.lokalInsp.length) return o;
    const siste = this.lokalInsp.filter((i) => i.objekt_globalid === o.globalid).sort((a, b) => b.tidspunkt.localeCompare(a.tidspunkt))[0];
    return siste ? { ...o, status_inspeksjon: siste.tilstandsgrad >= 2 ? "Avvik" : "OK" } : o;
  }

  async getObject(globalid: string): Promise<ObjektTreff | null> {
    const hits = await queryLayersWhere(this.queryLayers, this.objektFields, `${this.objektFields.globalid} = ${sqlString(globalid)}`, 1);
    const t = hits[0];
    if (!t) return null;
    const objekt = this.medLokalStatus(t.objekt);
    if (this.klient && !objekt.vegreferanse) objekt.vegreferanse = await this.vegreferanse(objekt.globalid, t.geometry);
    return { ...t, objekt };
  }

  /** Vegreferanse fra NVDB for BIM-objekter (som mangler den), slått opp ved første visning. */
  private async vegreferanse(globalid: string, g: Geometry): Promise<string | null> {
    const k = this.klient?.objekter.find((o) => o.objekt.globalid === globalid);
    if (k?.objekt.vegreferanse) return k.objekt.vegreferanse;
    const c = g.extent?.center ?? (g.type === "point" ? (g as unknown as { x: number; y: number }) : null);
    if (!c) return null;
    const v = await hentVegreferanse(this.cfg.nvdb, c.x, c.y).catch(() => null);
    if (k && v) k.objekt.vegreferanse = v;
    return v;
  }

  async findByObjektId(objektId: string): Promise<ObjektTreff | null> {
    const f = this.objektFields;
    const v = sqlString(objektId.trim().toUpperCase());
    const hits = await queryLayersWhere(this.queryLayers, f, `UPPER(${f.objekt_id}) = ${v} OR UPPER(${f.navn}) = ${v}`, 1);
    return hits[0] ?? null;
  }

  async search(text: string, limit = 8): Promise<ObjektTreff[]> {
    const f = this.objektFields;
    const q = sqlString(`%${text.trim().toUpperCase()}%`);
    const hits = await queryLayersWhere(this.queryLayers, f, `UPPER(${f.objekt_id}) LIKE ${q} OR UPPER(${f.navn}) LIKE ${q}`, limit);
    return hits.slice(0, limit);
  }

  queryNearby(x: number, y: number, radiusM: number) {
    return queryLayersNearby(this.queryLayers, this.objektFields, x, y, radiusM);
  }

  async getDocuments(globalid: string): Promise<Dokument[]> {
    if (!this.dokTable) return [];
    const f = this.fields.dokument;
    const fs = await this.dokTable.queryFeatures({ where: `${f.objekt_globalid} = ${sqlString(globalid)}`, outFields: ["*"] });
    return fs.features.map((g) => fromAttributes<Dokument>(g.attributes, f));
  }

  async getInspections(globalid: string): Promise<Inspeksjon[]> {
    if (!this.inspTable) return this.lokalInsp.filter((i) => i.objekt_globalid === globalid);
    const f = this.fields.inspeksjon;
    const fs = await this.inspTable.queryFeatures({
      where: `${f.objekt_globalid} = ${sqlString(globalid)}`,
      outFields: ["*"],
      orderByFields: [`${f.tidspunkt} DESC`],
    });
    const insp = fs.features.map((g) => fromAttributes<Inspeksjon>(g.attributes, f));
    if (this.inspTable.capabilities?.data.supportsAttachment && fs.features.length) {
      const oidField = this.inspTable.objectIdField;
      const ids = fs.features.map((g) => g.attributes[oidField] as number);
      const att = await this.inspTable.queryAttachments({ objectIds: ids }).catch(() => ({}) as Record<number, unknown[]>);
      fs.features.forEach((g, i) => {
        insp[i]!.antall_bilder = (att as Record<number, unknown[]>)[g.attributes[oidField] as number]?.length ?? 0;
      });
    }
    return insp;
  }

  async allInspections(): Promise<Inspeksjon[]> {
    if (!this.inspTable) return [...this.lokalInsp];
    const f = this.fields.inspeksjon;
    const out: Inspeksjon[] = [];
    const pageSize = this.inspTable.capabilities?.query.maxRecordCount ?? 1000;
    for (let start = 0; ; start += pageSize) {
      const fs = await this.inspTable.queryFeatures({ where: "1=1", outFields: ["*"], start, num: pageSize });
      out.push(...fs.features.map((g) => fromAttributes<Inspeksjon>(g.attributes, f)));
      if (!fs.exceededTransferLimit) break;
    }
    return out;
  }

  async getHistory(objekt: Objekt) {
    return deriveHistory(objekt, await this.getInspections(objekt.globalid));
  }

  async getTasks(): Promise<OppgaveMedLogg[]> {
    if (!this.oppgaveLayer) return this.lokalOppg.map((o) => ({ ...o, logg: [...o.logg] }));
    const f = this.fields.oppgave;
    const fs = await this.oppgaveLayer.queryFeatures({ where: "1=1", outFields: ["*"], returnGeometry: false });
    // TODO(SVV): logg for oppgaver (f.eks. relatert tabell eller editor tracking)
    return fs.features.map((g) => ({ ...fromAttributes<Oppgave>(g.attributes, f), logg: [] }));
  }

  private async updateTask(oppgaveId: string, patch: Partial<Oppgave>, loggTekst: string) {
    if (!this.oppgaveLayer) {
      const o = this.lokalOppg.find((x) => x.oppgave_id === oppgaveId);
      if (!o) throw new Error(`Fant ikke oppgave ${oppgaveId}`);
      Object.assign(o, patch);
      o.logg.push({ tidspunkt: new Date().toISOString(), tekst: loggTekst });
      skrivLokalt(LOKAL_OPPG, this.lokalOppg);
      return;
    }
    const f = this.fields.oppgave;
    const fs = await this.oppgaveLayer.queryFeatures({ where: `${f.oppgave_id} = ${sqlString(oppgaveId)}`, outFields: [this.oppgaveLayer.objectIdField] });
    const feat = fs.features[0];
    if (!feat) throw new Error(`Fant ikke oppgave ${oppgaveId}`);
    const attributes = { ...toAttributes<Oppgave>(patch, f), [this.oppgaveLayer.objectIdField]: feat.attributes[this.oppgaveLayer.objectIdField] };
    const res = await this.oppgaveLayer.applyEdits({ updateFeatures: [new Graphic({ attributes })] });
    const err = res.updateFeatureResults[0]?.error;
    if (err) throw new Error(err.message);
  }

  reassignTask(oppgaveId: string, tildelt: string) {
    return this.updateTask(oppgaveId, { tildelt }, `Tildelt ${tildelt}`);
  }

  setTaskStatus(oppgaveId: string, status: OppgaveStatus) {
    return this.updateTask(oppgaveId, { status }, `Status endret til ${status}`);
  }

  async createTask(o: Omit<Oppgave, "oppgave_id">): Promise<string> {
    if (!this.oppgaveLayer) {
      const max = Math.max(1000, ...this.lokalOppg.map((x) => Number(x.oppgave_id.replace(/\D/g, "")) || 0));
      const oppgave_id = `OPG-${max + 1}`;
      this.lokalOppg.push({ ...o, oppgave_id, logg: [{ tidspunkt: new Date().toISOString(), tekst: `Opprettet av ${this.user.navn}` }] });
      skrivLokalt(LOKAL_OPPG, this.lokalOppg);
      return oppgave_id;
    }
    // TODO(SVV): oppgave-ID bør genereres av tjenesten (Attribute Rule / sekvens). Midlertidig lokal ID.
    const oppgave_id = `OPG-${Date.now().toString(36).toUpperCase()}`;
    const attributes = toAttributes<Oppgave>({ ...o, oppgave_id }, this.fields.oppgave);
    const res = await this.oppgaveLayer.applyEdits({ addFeatures: [new Graphic({ attributes })] });
    const err = res.addFeatureResults[0]?.error;
    if (err) throw new Error(err.message);
    return oppgave_id;
  }

  async submitInspection(insp: Inspeksjon, bilder: Fotovedlegg[]): Promise<InnsendingResultat> {
    if (!this.inspTable) {
      // Bilder er for store for nettleserlagringen og regnes som ikke lastet opp.
      const globalid = `{${crypto.randomUUID().toUpperCase()}}`;
      this.lokalInsp.push({ ...insp, globalid, antall_bilder: 0 });
      skrivLokalt(LOKAL_INSP, this.lokalInsp);
      this.oppdaterKlientStatus({ ...insp, globalid });
      if (insp.oppgave_id) await this.setTaskStatus(insp.oppgave_id, "Klar for kontroll").catch(() => undefined);
      return { globalid, vedleggFeilet: bilder.length };
    }
    const { antall_bilder: _n, globalid: _g, ...rest } = insp;
    const alle = toAttributes<Inspeksjon>(rest, this.fields.inspeksjon);
    // Felt tabellen ikke har (f.eks. konsekvensgrad/sjekkliste før tjenesten er utvidet) utelates.
    const finnes = new Set((this.inspTable.fields ?? []).map((f) => f.name.toLowerCase()));
    const attributes = finnes.size ? Object.fromEntries(Object.entries(alle).filter(([k]) => finnes.has(k.toLowerCase()))) : alle;
    const res = await this.inspTable.applyEdits({ addFeatures: [new Graphic({ attributes })] });
    const add = res.addFeatureResults[0];
    if (!add || add.error) throw new Error(add?.error?.message ?? "Lagring feilet");
    let vedleggFeilet = 0;
    const feature = new Graphic({ attributes: { [this.inspTable.objectIdField]: add.objectId } });
    for (const b of bilder) {
      const form = new FormData();
      form.append("attachment", b.blob, b.navn);
      form.append("f", "json");
      try {
        await this.inspTable.addAttachment(feature, form);
      } catch (e) {
        console.warn("Vedlegg feilet", e);
        vedleggFeilet++;
      }
    }
    if (insp.oppgave_id) await this.setTaskStatus(insp.oppgave_id, "Klar for kontroll").catch(() => undefined);
    return { globalid: add.globalId ?? String(add.objectId), vedleggFeilet };
  }

  /** Oversikt over lag, tabeller og felt i webkartet, med rollen hvert lag har fått (for ?diagnose=1). */
  async diagnose(): Promise<DiagnoseRad[]> {
    const lag = await this.lagIWebkartet();
    const rolle = (url: string): string => {
      const r = this.resolved.filter((x) => x.url === url);
      if (r.length) return `Objektlag (${r.map((x) => x.fag).join(", ")})`;
      if (this.klient?.urler.has(url)) return "Objektlag (BIM, lest inn i appen)";
      if (url === lagUrl(this.inspTable)) return "Inspeksjoner";
      if (url === lagUrl(this.oppgaveLayer)) return "Oppgaver";
      if (url === lagUrl(this.dokTable)) return "Dokumenter";
      return "Referanselag";
    };
    const mangler = (r: string, felt: string[]): string[] => {
      if (r.includes("BIM")) return [];
      if (r.startsWith("Objektlag")) return manglendeFelt(this.cfg.fields.objekt, felt);
      if (r === "Inspeksjoner") return manglendeFelt(this.cfg.fields.inspeksjon, felt).filter((k) => k !== "globalid" && k !== "antall_bilder");
      if (r === "Oppgaver") return manglendeFelt(this.cfg.fields.oppgave, felt);
      if (r === "Dokumenter") return manglendeFelt(this.cfg.fields.dokument, felt);
      return [];
    };
    return lag.map(({ info, layer }) => {
      const r = rolle(info.url);
      return {
        tittel: info.tittel,
        type: info.type === "table" ? "tabell" : (layer.geometryType ?? "lag"),
        url: info.url,
        rolle: r,
        redigerbar: !!layer.capabilities?.operations?.supportsAdd,
        wkid: layer.spatialReference?.wkid ?? null,
        felt: (layer.fields ?? []).map((f) => `${f.name} (${f.type.replace("esriFieldType", "")})`),
        mangler: mangler(r, info.felt),
      };
    });
  }
}
