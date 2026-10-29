import type { Fag, Objekt } from "../data/schema.ts";
import { egenskap, nvdbType, parseWkt, wktLinjer, type NvdbVegobjekt } from "./vegobjekter.ts";

/**
 * NVDB-objekter som inspeksjonsobjekter i appen. Id-en «nvdb:<type>:<id>» brukes som
 * objekt_globalid i inspeksjoner, slik at inspeksjoner av eksisterende vegobjekter
 * kan registreres i samme tabell som modellobjektene.
 */
export const NVDB_PREFIKS = "nvdb:";

export const nvdbGlobalid = (typeId: number, id: number) => `${NVDB_PREFIKS}${typeId}:${id}`;

export function parseNvdbGlobalid(g: string): { typeId: number; id: number } | null {
  const m = /^nvdb:(\d+):(\d+)$/.exec(g);
  return m ? { typeId: Number(m[1]), id: Number(m[2]) } : null;
}

/** NVDB-type → objekttype i håndbokdataene (R610), for sjekklister og intervaller. */
export const NVDB_HANDBOKTYPE: Record<number, string> = {
  79: "Stikkrenne",
  83: "Kum",
  77: "Overvannsledning",
  78: "Drensledning",
  80: "Grøft",
  87: "Belysningsmast",
  852: "Kabelgrøft",
  502: "Teknisk skap",
  5: "Rekkverk",
  14: "Rekkverk",
  95: "Skilt",
  9: "Kantstein",
  241: "Vegoverbygning",
};

/** Lager et appobjekt av et NVDB-vegobjekt (ren funksjon). */
export function nvdbTilObjekt(o: NvdbVegobjekt): Objekt {
  const typeId = o.metadata?.type?.id ?? 0;
  const t = nvdbType(typeId);
  const navn = t?.navn ?? o.metadata?.type?.navn ?? "Vegobjekt";
  const g = parseWkt(o.geometri?.wkt);
  const z = g ? wktLinjer(g).flat().map((c) => c[2]).filter((v): v is number => typeof v === "number") : [];
  const fag: Fag = t?.fag === "VA" || t?.fag === "Elektro" ? t.fag : "Veg";
  const lengde = o.geometri?.lengde ?? (egenskap(o, "Lengde")?.verdi as number | undefined) ?? null;
  return {
    globalid: nvdbGlobalid(typeId, o.id),
    objekt_id: `NVDB-${o.id}`,
    navn: `${navn} ${o.id}`,
    fag,
    objekttype: NVDB_HANDBOKTYPE[typeId] ?? navn,
    mmi: null,
    revisjon: o.metadata?.versjon != null ? `v${o.metadata.versjon}` : null,
    rev_dato: o.metadata?.startdato ?? null,
    status_inspeksjon: "Ikke inspisert",
    vegreferanse: o.lokasjon?.vegsystemreferanser?.[0]?.kortform ?? null,
    kote_min: z.length ? Math.min(...z) : null,
    kote_max: z.length ? Math.max(...z) : null,
    lengde_m: typeof lengde === "number" ? lengde : null,
    fagmodell: "NVDB",
    modellfil: null,
    modellert_av: null,
    prosjekt: null,
    ifc_guid: null,
    ifc_klasse: null,
    lastet_inn: o.metadata?.sist_modifisert ?? null,
  };
}
