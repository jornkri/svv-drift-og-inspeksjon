/**
 * Lager PWA-ikoner (PNG) fra en enkel SVG-plassholder med Playwright (Chromium).
 * Byttes med SVVs offisielle app-ikon når det foreligger.
 *
 *   node scripts/generate-icons.ts
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public/icons");
mkdirSync(out, { recursive: true });

// Plassholder: mørk grå flate, oransje trekant (R902-diagonalen) og «DI»
const svg = (size: number, pad: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#444f55"/>
  <g transform="translate(${pad} ${pad}) scale(${(100 - 2 * pad) / 100})">
    <path d="M30 100 L100 30 L100 100 Z" fill="#ff9600"/>
    <text x="12" y="52" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#ffffff">DI</text>
  </g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, pad] of [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["icon-maskable-512.png", 512, 12],
] as const) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg(size, pad)}</body></html>`);
  await page.screenshot({ path: join(out, name), clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`Laget ${name}`);
}
await browser.close();
