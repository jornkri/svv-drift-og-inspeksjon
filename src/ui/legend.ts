import { html } from "lit";
import type { Fag } from "../data/schema.ts";
import { FAG_STIL } from "../map/renderers.ts";

/** Tegnforklaringssymbol i CSS for en objekttype (samme stil som fagsymbolikken i kartet). */
export function swatch(fag: Fag, type: string | null, color?: string) {
  const c = color ?? FAG_STIL[fag].farge;
  const cls = (() => {
    if (fag === "Veg" && (type === "Vegoverbygning" || type === "Grøft" || type === null)) return "flate";
    if (type === "Kum" || type === "Sandfang") return "punkt";
    if (type === "Belysningsmast" || type === "Teknisk skap") return "kvadrat";
    if (fag === "Elektro" || type === "Kantstein") return "stiplet";
    if (type === "Ledningsgrøft") return "tykk";
    return "linje";
  })();
  const fill =
    color ??
    (type === "Teknisk skap" ? "#444f55" : type === "Rekkverk" ? "#444f55" : type === "Kantstein" ? "#697277" : type === "Ledningsgrøft" ? FAG_STIL.VA.mork : type === "Grøft" ? "#a8b2b5" : type === "Drensledning" ? "#4f9bb8" : fag === "Veg" ? "#dadada" : c);
  return html`<span class="symbol symbol--${cls}" style="--c:${fill}" aria-hidden="true"></span>`;
}
