/** Navnet brukeren har oppgitt i offentlig pilot (uten innlogging). Lagres i nettleseren. */
const NOKKEL = "svv-di-navn";

export function lagretNavn(): string | null {
  try {
    return localStorage.getItem(NOKKEL)?.trim() || null;
  } catch {
    return null;
  }
}

export function lagreNavn(navn: string): void {
  try {
    localStorage.setItem(NOKKEL, navn.trim());
  } catch {
    /* blokkert lagring – navnet gjelder bare denne økten */
  }
}

/** Åpner dialogen for å oppgi eller endre navn. */
export async function apneNavnDialog(): Promise<void> {
  await import("../ui/navn-dialog.ts");
  document.querySelector("svv-navn-dialog")?.remove();
  document.body.append(document.createElement("svv-navn-dialog"));
}
