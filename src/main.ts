import "@esri/calcite-components/main.css";
import "@arcgis/map-components/main.css";
import "@arcgis/core/assets/esri/themes/light/view.css";
import "./styles/app.css";
import "./styles/components.css";
import "./styles/field.css";

import { setLocale } from "@arcgis/core/intl.js";
import { initAuth } from "./auth/auth.ts";
import { config } from "./config.ts";
import type { DataService } from "./data/DataService.ts";
import { setupGdoToken } from "./map/basemaps.ts";
import { setServices } from "./services.ts";
import { startRouter } from "./state/router.ts";
import { store } from "./state/store.ts";

setLocale("nb");

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

  // Geodata Online-token: i mock/dev fra Vite-endepunktet, i portalmodus via Enterprise
  const gdoToken = config.useMock ? await setupGdoToken(config) : null;
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
