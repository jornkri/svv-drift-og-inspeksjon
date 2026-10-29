/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import { cpSync } from "node:fs";
import { VitePWA } from "vite-plugin-pwa";

const GDO_TOKEN_URL = "https://services.geodataonline.no/arcgis/tokens/generateToken";

/**
 * Utviklings-endepunkt /api/gdo-token: henter Geodata Online-token server-til-server
 * med brukernavn/passord fra .env.local (GDO_USERNAME / GDO_PASSWORD). Passordet
 * forlater aldri dev-serveren. I produksjon håndteres token av ArcGIS Enterprise
 * (bakgrunnskartgruppe / lagrede legitimasjoner i portalen).
 */
function gdoTokenPlugin(env: Record<string, string>): Plugin {
  const cache = new Map<string, { token: string; expires: number }>();

  async function handler(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
    const username = env.GDO_USERNAME;
    const password = env.GDO_PASSWORD;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (!username || !password) {
      // 200 med token: null, så nettleseren ikke logger en feil når tilgang mangler
      res.end(JSON.stringify({ token: null, melding: "GDO_USERNAME/GDO_PASSWORD er ikke satt i .env.local" }));
      return;
    }
    const host = req.headers.host ?? "localhost:5180";
    const referer = `http://${host}/`;
    const hit = cache.get(referer);
    if (hit && hit.expires - Date.now() > 5 * 60_000) {
      res.end(JSON.stringify(hit));
      return;
    }
    try {
      const body = new URLSearchParams({
        username,
        password,
        client: "referer",
        referer,
        expiration: "60",
        f: "json",
      });
      const r = await fetch(GDO_TOKEN_URL, { method: "POST", body });
      const json = (await r.json()) as { token?: string; expires?: number; error?: unknown };
      if (!json.token) throw new Error(JSON.stringify(json.error ?? json));
      const value = { token: json.token, expires: json.expires ?? Date.now() + 55 * 60_000 };
      cache.set(referer, value);
      res.end(JSON.stringify(value));
    } catch (e) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: `Kunne ikke hente token fra Geodata Online: ${String(e)}` }));
    }
  }

  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use("/api/gdo-token", (req, res) => void handler(req, res));
  };
  return { name: "gdo-token", configureServer: attach, configurePreviewServer: attach };
}

/**
 * Kopierer ressursene til ArcGIS og Calcite (arbeidere, oversettelser, ikoner) inn i bygget,
 * slik at appen ikke er avhengig av js.arcgis.com og service workeren kan bufre dem for
 * frakoblet bruk. De legges ikke i precache (ca. 90 MB), men bufres ved første bruk.
 */
function localAssetsPlugin(): Plugin {
  const copies: [string, string][] = [
    ["node_modules/@arcgis/core/assets", "arcgis/core"],
    ["node_modules/@arcgis/map-components/dist/cdn/assets", "arcgis/components/assets"],
    ["node_modules/@esri/calcite-components/dist/cdn/assets", "calcite/assets"],
  ];
  let outDir = "dist";
  return {
    name: "local-assets",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    writeBundle() {
      for (const [from, to] of copies) cpSync(from, `${outDir}/${to}`, { recursive: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      gdoTokenPlugin(env),
      localAssetsPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["logo-plassholder.svg", "icons/*.png", "mock-dok/*"],
        manifest: {
          name: "Drift og inspeksjon – Statens vegvesen",
          short_name: "Drift og inspeksjon",
          description: "Se, inspiser og registrer på VA-, elektro- og vegobjekter – på kontoret og i felt.",
          lang: "nb",
          start_url: "./",
          scope: "./",
          display: "standalone",
          theme_color: "#444f55",
          background_color: "#ffffff",
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,json,woff2}"],
          globIgnores: ["arcgis/**", "calcite/**", "mock-dok/**"],
          maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // ArcGIS-/Calcite-ressurser: bufres ved første bruk
              urlPattern: ({ url }) => /\/(arcgis|calcite)\//.test(url.pathname),
              handler: "CacheFirst",
              options: { cacheName: "kartressurser", expiration: { maxEntries: 3000 } },
            },
            {
              // NVDB vegnett og vegreferanseoppslag: nett først, bufret svar når frakoblet
              urlPattern: ({ url }) => url.hostname === "nvdbapiles.atlas.vegvesen.no",
              handler: "NetworkFirst",
              options: { cacheName: "nvdb", networkTimeoutSeconds: 5, expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 3600 } },
            },
          ],
        },
      }),
    ],
    build: {
      target: "es2022",
      chunkSizeWarningLimit: 4000,
    },
    // Skann alle moduler (også lazy-lastede visninger) ved oppstart, slik at Vite ikke
    // må optimalisere avhengigheter på nytt midt i en økt
    optimizeDeps: { entries: ["index.html", "src/**/*.ts"] },
    server: { port: 5180, strictPort: true },
    preview: { port: 4180, strictPort: true },
    test: {
      include: ["tests/unit/**/*.test.ts"],
      environment: "node",
    },
  };
});
