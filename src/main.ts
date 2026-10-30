import "@esri/calcite-components/main.css";
import "@arcgis/map-components/main.css";
import "@arcgis/core/assets/esri/themes/light/view.css";
import "./styles/app.css";
import "./styles/components.css";
import "./styles/field.css";
import "./styles/tasks.css";
import "./styles/scene.css";
import "./styles/overview.css";

import esriConfig from "@arcgis/core/config.js";
import { setLocale } from "@arcgis/core/intl.js";
import { setAssetPath as setComponentsAssetPath } from "@arcgis/map-components";
import { setAssetPath as setCalciteAssetPath } from "@esri/calcite-components";
import { initAuth } from "./auth/auth.ts";
import { config } from "./config.ts";
import type { DataService } from "./data/DataService.ts";
import { setupGdoToken } from "./map/basemaps.ts";
import { setServices } from "./services.ts";
import { startRouter } from "./state/router.ts";
import { store } from "./state/store.ts";

setLocale("nb");

if (import.meta.env.PROD) {
  // Ressurser fra eget bygg (se localAssetsPlugin i vite.config.ts) i stedet for js.arcgis.com
  const base = new URL(import.meta.env.BASE_URL, location.href);
  esriConfig.assetsPath = new URL("arcgis/core", base).href;
  setComponentsAssetPath(new URL("arcgis/components/", base));
  setCalciteAssetPath(new URL("calcite/", base));
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}

function done() {
  document.getElementById("oppstart")?.remove();
}

async function bootstrap() {
  const params = new URLSearchParams(location.search);
  const auth = await initAuth(config);

  if (auth.status === "signed-out") {
    await import("./views/login.ts");
    const el = document.createElement("svv-login");
    if (auth.reason) el.setAttribute("reason", auth.reason);
    document.body.append(el);
    done();
    return;
  }

  let data: DataService;
  if (auth.status === "mock") {
    const { MockDataService } = await import("./data/MockDataService.ts");
    data = new MockDataService();
  } else {
    const { PortalDataService } = await import("./data/PortalDataService.ts");
    data = new PortalDataService(config, auth.portal);
  }
  await data.init();

  // Geodata Online-token fra Vite-endepunktet (dev/preview). Uten endepunkt brukes portalens
  // bakgrunnskartgruppe (VITE_BASEMAP_GROUP_ID) i portalmodus.
  const gdoToken = await setupGdoToken(config);
  setServices({ cfg: config, data, gdoToken });

  if (params.get("diagnose") === "1" && data.mode === "portal") {
    await import("./views/diagnose.ts");
    document.body.append(document.createElement("svv-diagnose"));
    done();
    return;
  }

  store.set({ felt: params.get("modus") === "felt" });
  startRouter();

  await import("./app.ts");
  document.body.append(document.createElement("svv-app"));
  done();

  const lokalt = (data as { lokalt?: string[] }).lokalt ?? [];
  if (data.mode === "portal" && lokalt.length) {
    store.notify(`Webkartet har ikke tabell for ${lokalt.join(" og ")}. De lagres foreløpig lokalt i denne nettleseren.`, "info");
  }

  // Dyplenke: ?objekt=<objekt-ID>
  const objektId = params.get("objekt");
  if (objektId) {
    const hit = await data.findByObjektId(objektId);
    if (hit) store.set({ selection: { globalids: [hit.objekt.globalid], index: 0 }, zoomTil: hit.objekt.globalid });
    else store.notify(`Fant ikke objektet «${objektId}»`, "feil");
  }
}

bootstrap().catch((e) => {
  console.error(e);
  const el = document.getElementById("oppstart");
  if (el) el.textContent = `Appen kunne ikke starte: ${e instanceof Error ? e.message : String(e)}`;
});
