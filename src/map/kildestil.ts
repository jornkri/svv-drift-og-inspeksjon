import type Renderer from "@arcgis/core/renderers/Renderer.js";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer.js";
import type CIMSymbol from "@arcgis/core/symbols/CIMSymbol.js";
import PolygonSymbol3D from "@arcgis/core/symbols/PolygonSymbol3D.js";
import type SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import type Symbol from "@arcgis/core/symbols/Symbol.js";
import type { Fag } from "../data/schema.ts";
import type { Dim } from "./renderers.ts";

/**
 * Symbolisering fra kilden (webkartet i portalen): unike verdier på objekttype, slik lagene er
 * satt opp der. Brukes i stedet for appens fagsymbolikk når laget har en slik renderer.
 */

export interface KildeSymbol {
  /** CSS-farger */
  fyll: string;
  kant: string;
  stiplet: boolean;
  skravert: boolean;
}

const symboler = new Map<string, KildeSymbol>();
const nokkel = (fag: Fag, type: string) => `${fag}|${type}`;

/** Tegnforklaringssymbol fra kilden for en objekttype, eller undefined. */
export function kildeSymbol(fag: Fag, type: string | null): KildeSymbol | undefined {
  return type == null ? undefined : symboler.get(nokkel(fag, type));
}

export function harKildeSymboler(): boolean {
  return symboler.size > 0;
}

const css = (c: number[] | undefined, fallback: string) => (c ? `rgba(${c[0]},${c[1]},${c[2]},${((c[3] ?? 255) / 255).toFixed(2)})` : fallback);

/** Farger og stil i et (enkelt- eller CIM-) flatesymbol. */
export function lesSymbol(s: Symbol | null | undefined): KildeSymbol | null {
  if (!s) return null;
  if (s.type === "simple-fill") {
    const f = s as SimpleFillSymbol;
    const fyll = f.color ? f.color.toRgba() : [0, 0, 0, 0];
    const kant = f.outline?.color?.toRgba();
    return {
      fyll: `rgba(${fyll.join(",")})`,
      kant: kant ? `rgba(${kant.join(",")})` : "transparent",
      stiplet: !!f.outline?.style && f.outline.style !== "solid",
      skravert: f.style !== "solid" && f.style !== "none",
    };
  }
  if (s.type === "cim") {
    const lag = ((s as CIMSymbol).data?.symbol as { symbolLayers?: { type: string; color?: number[]; enable?: boolean }[] } | undefined)?.symbolLayers ?? [];
    const fyll = lag.find((l) => l.type === "CIMSolidFill" && l.enable !== false)?.color;
    const kant = lag.find((l) => l.type === "CIMSolidStroke" && l.enable !== false)?.color;
    return { fyll: css(fyll, "transparent"), kant: css(kant, "#444f55"), stiplet: false, skravert: lag.some((l) => l.type === "CIMHatchFill") };
  }
  return null;
}

/** Unike verdier på objekttype? Returnerer rendereren klar til bruk, ellers null. */
export function objekttypeRenderer(r: Renderer | null | undefined): UniqueValueRenderer | null {
  if (!r || r.type !== "unique-value") return null;
  const u = r as UniqueValueRenderer;
  return u.field && /^(objekttype|objecttype)$/i.test(u.field) && !u.field2 ? u : null;
}

/** Registrerer tegnforklaringen for et lag fra kilden. */
export function registrerKildeSymboler(fag: Fag, r: UniqueValueRenderer): void {
  for (const i of r.uniqueValueInfos ?? []) {
    const s = lesSymbol(i.symbol);
    if (s && i.value != null) symboler.set(nokkel(fag, String(i.value)), s);
  }
}

/**
 * Kildens renderer for appens klientlag (feltet heter «objekttype»). I 3D gjøres flatesymbolene
 * om til PolygonSymbol3D med samme farger (CIM-skravur blir en lys, halvgjennomsiktig flate).
 */
export function kildeRenderer(r: UniqueValueRenderer, felt: string, dim: Dim): Renderer {
  const symbol = (s: Symbol | null | undefined) => (dim === "2d" ? (s ? (s as unknown as { clone(): Symbol }).clone() : null) : til3d(s)) as never;
  return new UniqueValueRenderer({
    field: felt,
    defaultSymbol: symbol(r.defaultSymbol) ?? undefined,
    defaultLabel: r.defaultLabel ?? undefined,
    // Tegnerekkefølge etter klassene, som i webkartet (f.eks. kjørefelt over bærelag)
    orderByClassesEnabled: r.orderByClassesEnabled,
    uniqueValueInfos: (r.uniqueValueInfos ?? []).map((i) => ({ value: i.value, label: i.label, symbol: symbol(i.symbol) })),
    ...(dim === "2d" && r.visualVariables ? { visualVariables: r.visualVariables.map((v) => v.clone()) } : {}),
  });
}

function til3d(s: Symbol | null | undefined): PolygonSymbol3D | null {
  const k = lesSymbol(s);
  if (!k) return null;
  const fyll = k.skravert || k.fyll === "transparent" ? "rgba(200,200,200,0.45)" : k.fyll;
  return new PolygonSymbol3D({
    symbolLayers: [{ type: "fill", material: { color: fyll }, outline: { color: k.kant === "transparent" ? "rgba(68,79,85,0.6)" : k.kant, size: 0.75 } }],
  });
}
