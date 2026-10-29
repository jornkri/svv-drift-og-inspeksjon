import Graphic from "@arcgis/core/Graphic.js";
import type Layer from "@arcgis/core/layers/Layer.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import type Portal from "@arcgis/core/portal/Portal.js";
import WebMap from "@arcgis/core/WebMap.js";
import type { AppConfig, LayerRef } from "../config.ts";
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
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase())
    .slice(0, 2)
    .join("");

/**
 * Implementasjon mot SVVs ekte feature-tjenester i ArcGIS Enterprise.
 *
 * TODO(SVV): Lagene, tabellene og feltnavnene må kartlegges mot webkartet
 * (VITE_WEBMAP_ID) – bruk ?diagnose=1 etter innlogging for å se lag og felt.
 */
export class PortalDataService implements DataService {
  readonly mode = "portal" as const;
  user: UserInfo = { navn: "", brukernavn: "", initialer: "", team: [] };
  readonly objektFields: AppConfig["fields"]["objekt"];

  private webmap: WebMap | null = null;
  private resolved: ResolvedLayer[] = [];
  private queryLayers: FeatureLayer[] = [];
  private inspTable: FeatureLayer | null = null;
  private dokTable: FeatureLayer | null = null;
  private oppgaveLayer: FeatureLayer | null = null;

  constructor(
    private readonly cfg: AppConfig,
    readonly portal: Portal,
  ) {
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

    for (const fag of FAG) {
      for (const ref of this.cfg.layers[fag]) {
        const layer = await this.resolveFeatureLayer(ref);
        if (!layer) continue;
        await layer.load();
        this.resolved.push({
          fag,
          url: layer.url + (layer.layerId != null ? `/${layer.layerId}` : ""),
          title: layer.title ?? fag,
          kind: layer.geometryType === "point" || layer.geometryType === "multipoint" ? "point" : layer.geometryType === "polygon" ? "polygon" : "polyline",
        });
      }
    }
    this.queryLayers = this.resolved.map((r) => new FeatureLayer({ url: r.url, outFields: ["*"] }));
    this.inspTable = this.cfg.inspeksjonTable ? await this.resolveFeatureLayer(this.cfg.inspeksjonTable) : null;
    this.dokTable = this.cfg.dokumentTable ? await this.resolveFeatureLayer(this.cfg.dokumentTable) : null;
    this.oppgaveLayer = this.cfg.oppgaveLayer ? await this.resolveFeatureLayer(this.cfg.oppgaveLayer) : null;
    await Promise.all([this.inspTable?.load(), this.dokTable?.load(), this.oppgaveLayer?.load()]);
  }

  private async resolveFeatureLayer(ref: LayerRef): Promise<FeatureLayer | null> {
    if (ref.kind === "url") return new FeatureLayer({ url: ref.url, outFields: ["*"] });
    const all = [...(this.webmap?.allLayers.toArray() ?? []), ...(this.webmap?.allTables.toArray() ?? [])];
    const hit = all.find((l) => l.title?.trim().toLowerCase() === ref.title.toLowerCase());
    if (hit && hit.type === "feature") {
      const fl = hit as FeatureLayer;
      return new FeatureLayer({ url: `${fl.url}/${fl.layerId}`, outFields: ["*"] });
    }
    console.warn(`Fant ikke laget «${ref.title}» i webkartet`);
    return null;
  }

  createObjectLayers(): ObjectLayerHandle[] {
    return this.resolved.map((r, i) => ({
      key: `${r.fag}-${i}`,
      fag: r.fag,
      geometryKind: r.kind,
      title: r.title,
      layer: new FeatureLayer({ url: r.url, outFields: ["*"], popupEnabled: false, elevationInfo: { mode: "absolute-height" } }),
    }));
  }

  async createReferenceLayers(): Promise<Layer[]> {
    if (!this.webmap) return [];
    const objectUrls = new Set(this.resolved.map((r) => r.url));
    return this.webmap.layers
      .toArray()
      .filter((l) => !(l.type === "feature" && objectUrls.has(`${(l as FeatureLayer).url}/${(l as FeatureLayer).layerId}`)))
      .map((l) => (l as unknown as { clone(): Layer }).clone());
  }

  async objectStats(): Promise<ObjektStat[]> {
    const f = this.objektFields;
    const outFields = [f.globalid, f.fag, f.objekttype, f.mmi, f.status_inspeksjon, f.revisjon, f.modellfil, f.rev_dato, f.fagmodell];
    const out: ObjektStat[] = [];
    for (const layer of this.queryLayers) {
      const pageSize = layer.capabilities?.query.maxRecordCount ?? 1000;
      for (let start = 0; ; start += pageSize) {
        const fs = await layer.queryFeatures({ where: "1=1", outFields, returnGeometry: false, start, num: pageSize });
        out.push(...fs.features.map((g) => fromAttributes<Objekt>(g.attributes, f)));
        if (!fs.exceededTransferLimit) break;
      }
    }
    return out;
  }

  async getObject(globalid: string): Promise<ObjektTreff | null> {
    const hits = await queryLayersWhere(this.queryLayers, this.objektFields, `${this.objektFields.globalid} = ${sqlString(globalid)}`, 1);
    return hits[0] ?? null;
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
    const f = this.cfg.fields.dokument;
    const fs = await this.dokTable.queryFeatures({ where: `${f.objekt_globalid} = ${sqlString(globalid)}`, outFields: ["*"] });
    return fs.features.map((g) => fromAttributes<Dokument>(g.attributes, f));
  }

  async getInspections(globalid: string): Promise<Inspeksjon[]> {
    if (!this.inspTable) return [];
    const f = this.cfg.fields.inspeksjon;
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

  async getHistory(objekt: Objekt) {
    return deriveHistory(objekt, await this.getInspections(objekt.globalid));
  }

  async getTasks(): Promise<OppgaveMedLogg[]> {
    if (!this.oppgaveLayer) return [];
    const f = this.cfg.fields.oppgave;
    const fs = await this.oppgaveLayer.queryFeatures({ where: "1=1", outFields: ["*"], returnGeometry: false });
    // TODO(SVV): logg for oppgaver (f.eks. relatert tabell eller editor tracking)
    return fs.features.map((g) => ({ ...fromAttributes<Oppgave>(g.attributes, f), logg: [] }));
  }

  private async updateTask(oppgaveId: string, patch: Partial<Oppgave>) {
    if (!this.oppgaveLayer) throw new Error("Oppgavelaget er ikke konfigurert");
    const f = this.cfg.fields.oppgave;
    const fs = await this.oppgaveLayer.queryFeatures({ where: `${f.oppgave_id} = ${sqlString(oppgaveId)}`, outFields: [this.oppgaveLayer.objectIdField] });
    const feat = fs.features[0];
    if (!feat) throw new Error(`Fant ikke oppgave ${oppgaveId}`);
    const attributes = { ...toAttributes<Oppgave>(patch, f), [this.oppgaveLayer.objectIdField]: feat.attributes[this.oppgaveLayer.objectIdField] };
    const res = await this.oppgaveLayer.applyEdits({ updateFeatures: [new Graphic({ attributes })] });
    const err = res.updateFeatureResults[0]?.error;
    if (err) throw new Error(err.message);
  }

  reassignTask(oppgaveId: string, tildelt: string) {
    return this.updateTask(oppgaveId, { tildelt });
  }

  setTaskStatus(oppgaveId: string, status: OppgaveStatus) {
    return this.updateTask(oppgaveId, { status });
  }

  async submitInspection(insp: Inspeksjon, bilder: Fotovedlegg[]): Promise<InnsendingResultat> {
    if (!this.inspTable) throw new Error("Inspeksjonstabellen er ikke konfigurert");
    const { antall_bilder: _n, globalid: _g, ...rest } = insp;
    const attributes = toAttributes<Inspeksjon>(rest, this.cfg.fields.inspeksjon);
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

  /** Oversikt over lag, tabeller og felt i webkartet (for ?diagnose=1). */
  async diagnose(): Promise<{ tittel: string; type: string; url: string; felt: string[] }[]> {
    if (!this.webmap) return [];
    const items = [...this.webmap.allLayers.toArray(), ...this.webmap.allTables.toArray()];
    return Promise.all(
      items.map(async (l) => {
        await l.load().catch(() => undefined);
        const fl = l as FeatureLayer;
        return {
          tittel: l.title ?? "(uten tittel)",
          type: l.type,
          url: fl.url ? `${fl.url}${fl.layerId != null ? `/${fl.layerId}` : ""}` : "",
          felt: (fl.fields ?? []).map((f) => `${f.name} (${f.type})`),
        };
      }),
    );
  }
}
