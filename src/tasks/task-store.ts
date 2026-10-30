import { services } from "../services.ts";
import { store } from "../state/store.ts";

let loading: Promise<void> | null = null;

/** Laster oppgavene fra datatjenesten inn i app-tilstanden. */
export function reloadTasks(): Promise<void> {
  loading = services()
    .data.getTasks()
    .then((oppgaver) => store.set({ oppgaver }))
    .catch((e) => {
      console.warn("Kunne ikke hente oppgaver", e);
      store.notify("Kunne ikke hente oppgaver", "feil");
      // Prøv igjen neste gang oppgavene trengs (f.eks. når dekningen er tilbake)
      loading = null;
    });
  return loading;
}

// Oppgavene lastes på nytt når enheten kommer på nett igjen
if (typeof window !== "undefined") window.addEventListener("online", () => void reloadTasks());

export function ensureTasks(): Promise<void> {
  return loading ?? reloadTasks();
}

/** Kalles etter endringer i data (innsendt inspeksjon, ny tildeling …). */
export function dataChanged(): void {
  store.set((s) => ({ dataVersjon: s.dataVersjon + 1 }));
  void reloadTasks();
}
