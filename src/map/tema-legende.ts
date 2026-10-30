import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import type ClassBreaksRenderer from "@arcgis/core/renderers/ClassBreaksRenderer.js";
import type SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer.js";
import type UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer.js";
import type Symbol from "@arcgis/core/symbols/Symbol.js";
import type { TemalagDef } from "../config.ts";
import { legendeFraJson, pentLagnavn, type LegendeGruppe } from "./legende-json.ts";

/** Post i tegnforklaringen: bilde fra tjenesten (MapServer) eller symbol fra rendereren (feature). */
export interface TemaLegendePost {
  etikett: string;
  bilde?: string;
  symbol?: Symbol;
}

export interface TemaLegende {
  grupper: { tittel: string; poster: TemaLegendePost[] }[];
  /** Tekst når tjenesten ikke har tegnforklaring (f.eks. bufret helningskart) */
  merknad?: string;
}

const cache = new Map<string, Promise<TemaLegende>>();

/** Tegnforklaringen for et temalag (hentes én gang per lag). */
export function hentTemaLegende(def: TemalagDef): Promise<TemaLegende> {
  let p = cache.get(def.id);
  if (!p) {
    p = last(def).catch((e: unknown) => {
      console.warn(`Tegnforklaring for ${def.navn} kunne ikke hentes`, e);
      cache.delete(def.id);
      return { grupper: [], merknad: "Tegnforklaringen kunne ikke hentes." };
    });
    cache.set(def.id, p);
  }
  return p;
}

async function last(def: TemalagDef): Promise<TemaLegende> {
  if (def.type === "feature") return featureLegende(def);
  if (def.type === "vector-tile") return { grupper: [], merknad: def.beskrivelse };
  const svar = (await fetch(`${def.url}/legend?f=json`).then((r) => r.json())) as Parameters<typeof legendeFraJson>[0] & { error?: unknown };
  if (svar.error) throw new Error(JSON.stringify(svar.error));
  const grupper: LegendeGruppe[] = legendeFraJson(svar, def.legendeLag ?? def.sublag);
  if (grupper.length) return { grupper };
  // Bufrede kart (f.eks. helning) har ofte ingen tegnforklaring; bruk tjenestebeskrivelsen
  const info = (await fetch(`${def.url}?f=json`).then((r) => r.json()).catch(() => ({}))) as { serviceDescription?: string; description?: string };
  return { grupper: [], merknad: (info.serviceDescription || info.description || def.beskrivelse).replace(/<[^>]+>/g, "").trim() };
}

/** Feature-lag: symbolene i rendereren (unike verdier, klasser eller enkeltsymbol). */
async function featureLegende(def: TemalagDef): Promise<TemaLegende> {
  const urler = def.sublag ? def.sublag.map((id) => `${def.url}/${id}`) : [def.url];
  const grupper = await Promise.all(
    urler.map(async (url) => {
      const fl = new FeatureLayer({ url });
      await fl.load();
      const r = fl.renderer;
      // «GeomapEiendom2 - Eiendomsgrense» → «Eiendomsgrense»
      const tittel = pentLagnavn((fl.title ?? def.navn).replace(/^.* - /, ""));
      let poster: TemaLegendePost[] = [];
      if (r?.type === "unique-value") {
        poster = ((r as UniqueValueRenderer).uniqueValueInfos ?? []).map((i) => ({ etikett: i.label || String(i.value), ...(i.symbol ? { symbol: i.symbol } : {}) }));
      } else if (r?.type === "class-breaks") {
        poster = ((r as ClassBreaksRenderer).classBreakInfos ?? []).map((i) => ({ etikett: i.label || `${i.minValue}–${i.maxValue}`, ...(i.symbol ? { symbol: i.symbol } : {}) }));
      } else if (r?.type === "simple" && (r as SimpleRenderer).symbol) {
        poster = [{ etikett: r.label || tittel, symbol: (r as SimpleRenderer).symbol! }];
      }
      fl.destroy();
      return { tittel, poster };
    }),
  );
  return { grupper: grupper.filter((g) => g.poster.length) };
}
