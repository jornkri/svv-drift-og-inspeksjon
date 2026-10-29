import type { ObjektTreff } from "../data/DataService.ts";
import { nvdbGeometri } from "../map/nvdb-objekter-layer.ts";
import { services } from "../services.ts";
import { nvdbTilObjekt, parseNvdbGlobalid } from "./objekt.ts";
import { hentVegobjekt } from "./vegobjekter.ts";

/** Slår opp et objekt – modellobjekt via datatjenesten, NVDB-objekt via NVDB API Les. */
export async function finnObjekt(globalid: string): Promise<ObjektTreff | null> {
  const { data, cfg } = services();
  const n = parseNvdbGlobalid(globalid);
  if (!n) return data.getObject(globalid);
  const o = await hentVegobjekt({ baseUrl: cfg.nvdb.baseUrl, client: cfg.nvdb.client }, n.typeId, n.id);
  const geometry = nvdbGeometri(o);
  if (!geometry) return null;
  const insp = await data.getInspections(globalid);
  const objekt = nvdbTilObjekt(o);
  if (insp[0]) objekt.status_inspeksjon = insp[0].tilstandsgrad >= 2 ? "Avvik" : "OK";
  return { objekt, geometry };
}
