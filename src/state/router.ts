import { store, type Route } from "./store.ts";

const ROUTES: Route[] = ["kart", "3d", "oppgaver", "oversikt", "inspeksjon", "verktoy", "meg", "rapport"];

export function parseHash(hash: string): Route {
  const r = hash.replace(/^#\/?/, "").split(/[/?]/)[0] as Route;
  return ROUTES.includes(r) ? r : "kart";
}

const TITLER: Record<Route, string> = {
  kart: "Kart",
  "3d": "3D",
  oppgaver: "Oppgaver",
  oversikt: "Oversikt",
  inspeksjon: "Inspeksjon",
  verktoy: "Verktøy",
  meg: "Meg",
  rapport: "Objektrapport",
};

let erstattNeste = false;
let forrige: Route | null = null;

/** Bytter visning. `erstatt` bytter ut gjeldende historikkoppføring (f.eks. etter innsending av et skjema). */
export function navigate(route: Route, opts: { erstatt?: boolean } = {}): void {
  if (store.get().route === route) return;
  erstattNeste = !!opts.erstatt;
  store.set({ route, popover: null });
}

/** Tilbake til visningen brukeren kom fra (uten å legge en ny oppføring i historikken). */
export function tilbake(reserve: Route = "kart"): void {
  const mal = forrige && forrige !== store.get().route ? forrige : reserve;
  navigate(mal, { erstatt: true });
}

/** Holder hash-ruten og ?objekt= i URL-en synkronisert med tilstanden. */
export function startRouter(): void {
  store.set({ route: parseHash(location.hash) });
  document.title = `${TITLER[store.get().route]} – Drift og inspeksjon`;
  window.addEventListener("hashchange", () => navigate(parseHash(location.hash)));
  store.select(
    (s) => s.route,
    (route, prev) => {
      forrige = prev;
      // Sidetittelen forteller skjermlesere og nettleserhistorikken hvor brukeren er
      document.title = `${TITLER[route]} – Drift og inspeksjon`;
      const url = `${location.pathname}${location.search}#/${route}`;
      if (parseHash(location.hash) !== route) {
        if (erstattNeste) history.replaceState(null, "", url);
        else history.pushState(null, "", url);
      }
      erstattNeste = false;
    },
  );
}

/** Lenke til et objekt (dyplenke med objekt-ID i URL). */
export function objectLink(objektId: string, route: Route = "kart"): string {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("objekt", objektId);
  url.hash = `/${route}`;
  return url.toString();
}

export function setObjectParam(objektId: string | null): void {
  const url = new URL(location.href);
  if (objektId) url.searchParams.set("objekt", objektId);
  else url.searchParams.delete("objekt");
  if (url.toString() !== location.href) history.replaceState(null, "", url);
}
