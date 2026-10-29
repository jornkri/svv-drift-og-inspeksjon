import { LitElement } from "lit";
import { StoreController } from "../state/store.ts";

/**
 * Basiskomponent med lys DOM (ingen shadow root). Kartkomponentene og Calcite
 * forventer globale stiler, og felles CSS i src/styles/components.css gjelder alle.
 */
export class LightElement extends LitElement {
  protected override createRenderRoot(): HTMLElement {
    return this;
  }
}

/** Lys-DOM-komponent som tegnes på nytt når app-tilstanden endres. */
export class StoreElement extends LightElement {
  protected readonly store = new StoreController(this);
}

export const fmtNumber = (n: number | null | undefined, decimals = 2): string =>
  n == null ? "–" : n.toLocaleString("nb-NO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–";

export const fmtDateTime = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "–";
