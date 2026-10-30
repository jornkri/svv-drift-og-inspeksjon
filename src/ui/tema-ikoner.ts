import { svg, type SVGTemplateResult } from "lit";
import type { TemalagDef } from "../config.ts";

/** Strekikoner for temalag og temagrupper (24×24, currentColor, aria-hidden), samme stil som icons.ts. */
const ikon = (body: SVGTemplateResult, s = 16) =>
  svg`<svg width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const IKON: Record<string, SVGTemplateResult> = {
  // Vanndråpe
  vann: svg`<path d="M12 3c-3 4.5-6 7.6-6 11a6 6 0 0012 0c0-3.4-3-6.5-6-11z"></path>`,
  // Bølger
  flom: svg`<path d="M3 9c2 0 2-2 4.5-2S10 9 12 9s2-2 4.5-2S19 9 21 9"></path><path d="M3 15c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2"></path>`,
  // Fjell med steinsprang
  skred: svg`<path d="M3 20l6.5-11 4 6 2.5-3.5L21 20z"></path><path d="M15 5l1.5-1.5M18.5 7.5l1.5-.5"></path>`,
  // Jordlag
  losmasser: svg`<path d="M3 7h18M3 12h18M3 17h18"></path><path d="M7 9.5h.01M14 9.5h.01M10 14.5h.01M17 14.5h.01"></path>`,
  // Teig med stiplet grense
  eiendom: svg`<path d="M4 7l8-3 8 5-2.5 11L5 18z" stroke-dasharray="3 2.2"></path><path d="M12 11v3"></path>`,
  // Plankart
  plan: svg`<path d="M6 3h9l4 4v14H6z"></path><path d="M15 3v4h4M9 12h7M9 16h5"></path>`,
  // Blad
  natur: svg`<path d="M5 19c0-8.5 6-14 15-14 0 9-6 15-14 15"></path><path d="M5 19l8-8"></path>`,
  // Tønne
  forurensning: svg`<ellipse cx="12" cy="5.5" rx="6" ry="2"></ellipse><path d="M6 5.5v13c0 1.1 2.7 2 6 2s6-.9 6-2v-13"></path><path d="M6 12c0 1.1 2.7 2 6 2s6-.9 6-2"></path>`,
  // Søylebygning
  kultur: svg`<path d="M3 9l9-5 9 5z"></path><path d="M5 20h14M7 10v8M12 10v8M17 10v8"></path>`,
  // Høydekurver
  kurver: svg`<path d="M3 18c3-3 6-3 9 0s6 3 9 0"></path><path d="M6 13c2-3 4-5 6-5s4 2 6 5"></path><path d="M10 8.5c.6-1.3 1.3-2 2-2s1.4.7 2 2"></path>`,
  // Skråning
  helning: svg`<path d="M3 20h18L3 7z"></path><path d="M9 20a5 5 0 00-1.4-3.5"></path>`,
  // Bil
  trafikk: svg`<path d="M5 16v-3l2-5h10l2 5v3z"></path><path d="M5 13h14"></path><circle cx="8" cy="17.5" r="1.5"></circle><circle cx="16" cy="17.5" r="1.5"></circle>`,
};

const LAG: Record<string, keyof typeof IKON> = {
  drenering: "vann",
  flom: "flom",
  skred: "skred",
  geologi: "losmasser",
  losmasser: "losmasser",
  eiendom: "eiendom",
  regulering: "plan",
  natur: "natur",
  kulturminner: "kultur",
  grunnforurensning: "forurensning",
  hoydekurver: "kurver",
  helning: "helning",
  ulykker: "trafikk",
};

const GRUPPE: Record<TemalagDef["gruppe"], keyof typeof IKON> = {
  "Vann og drenering": "vann",
  "Skred og grunn": "skred",
  "Eiendom og plan": "plan",
  "Natur, kultur og miljø": "natur",
  Terreng: "kurver",
  Trafikk: "trafikk",
};

export function temaIkon(def: TemalagDef, s?: number): SVGTemplateResult {
  return ikon(IKON[LAG[def.id] ?? GRUPPE[def.gruppe]]!, s);
}

export function gruppeIkon(gruppe: TemalagDef["gruppe"], s?: number): SVGTemplateResult {
  return ikon(IKON[GRUPPE[gruppe]]!, s);
}
