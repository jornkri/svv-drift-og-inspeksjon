/**
 * Tegnforklaring fra ArcGIS-tjenestenes /legend-endepunkt (MapServer). Ren logikk uten
 * ArcGIS-avhengighet, slik at den kan testes.
 */

export interface LegendePost {
  etikett: string;
  /** data:-URL med symbolbildet fra tjenesten */
  bilde?: string;
}

export interface LegendeGruppe {
  tittel: string;
  poster: LegendePost[];
}

interface LegendeSvar {
  layers?: { layerId: number; layerName: string; legend?: { label?: string; imageData?: string; contentType?: string }[] }[];
}

/** «GEOLOGI_LosmasseFlate» → «Losmasse flate», «forurenset_omrade_pkt» → «Forurenset omrade pkt». */
export function pentLagnavn(navn: string): string {
  const s = navn
    .replace(/^[A-ZÆØÅ]+_(?=[A-ZÆØÅa-zæøå])/, "")
    .replace(/_/g, " ")
    .replace(/([a-zæøå])([A-ZÆØÅ])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Grupper (ett per lag) fra et /legend-svar. Med «lag» vises bare de lagene, i den rekkefølgen.
 * Tomme etiketter (enkeltsymbol) får lagnavnet; «<all other values>» blir «Andre verdier».
 */
export function legendeFraJson(svar: LegendeSvar, lag?: number[]): LegendeGruppe[] {
  const alle = svar.layers ?? [];
  const valgt = lag ? lag.flatMap((id) => alle.filter((l) => l.layerId === id)) : alle;
  return valgt
    .map((l) => {
      const tittel = pentLagnavn(l.layerName);
      const poster = (l.legend ?? []).map((p) => ({
        etikett: !p.label ? tittel : p.label === "<all other values>" ? "Andre verdier" : p.label,
        ...(p.imageData ? { bilde: `data:${p.contentType ?? "image/png"};base64,${p.imageData}` } : {}),
      }));
      return { tittel, poster };
    })
    .filter((g) => g.poster.length > 0);
}
