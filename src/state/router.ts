import { store, type Route } from "./store.ts";

const ROUTES: Route[] = ["kart", "3d", "oppgaver", "inspeksjon", "verktoy", "meg"];

export function parseHash(hash: string): Route {
  const r = hash.replace(/^#\/?/, "").split(/[/?]/)[0] as Route;
  return ROUTES.includes(r) ? r : "kart";
}

export function navigate(route: Route): void {
  if (store.get().route !== route) store.set({ route, popover: null });
}

/** Holder hash-ruten og ?objekt= i URL-en synkronisert med tilstanden. */
export function startRouter(): void {
  store.set({ route: parseHash(location.hash) });
  window.addEventListener("hashchange", () => navigate(parseHash(location.hash)));
  store.select(
    (s) => s.route,
    (route) => {
      if (parseHash(location.hash) !== route) history.pushState(null, "", `${location.pathname}${location.search}#/${route}`);
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
