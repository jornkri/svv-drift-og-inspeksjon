import { html, nothing, svg, type TemplateResult } from "lit";
import { textColorOn } from "../filters/mmi.ts";

/**
 * Små, tilgjengelige SVG-diagrammer i SVV-profil.
 * - tynne merker, 2 px mellomrom mellom segmenter, nøytrale akser
 * - tooltip ved hover (SVG <title>) og alltid en tabellvisning
 * - farge bærer aldri informasjon alene: etiketter, forklaring og valgfri skravur
 */

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Skravur (for status som må skilles uten farge) */
  hatch?: boolean;
}

export interface BarRow {
  label: string;
  segments: Segment[];
}

let uid = 0;

const fmt = (n: number) => n.toLocaleString("nb-NO");

/** Vannrette, stablede stolper (f.eks. inspeksjonsstatus per fag). */
export function stackedBars(rows: BarRow[], opts: { title: string; width?: number; rowHeight?: number }): TemplateResult {
  const id = `sb${++uid}`;
  const W = opts.width ?? 520;
  const rh = opts.rowHeight ?? 26;
  const labelW = 72;
  const totW = 48;
  const gap = 2;
  const max = Math.max(1, ...rows.map((r) => r.segments.reduce((a, s) => a + s.value, 0)));
  const plotW = W - labelW - totW;
  const H = rows.length * (rh + 14) + 4;
  const keys = rows[0]?.segments ?? [];
  return html`<figure class="diagram">
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label=${opts.title}>
      <defs>
        <pattern id="${id}-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--hatch-bg, #b63434)"></rect>
          <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" stroke-width="2" stroke-opacity="0.55"></line>
        </pattern>
      </defs>
      ${rows.map((r, ri) => {
        const y = ri * (rh + 14) + 2;
        let x = labelW;
        const total = r.segments.reduce((a, s) => a + s.value, 0);
        return svg`<g>
          <text x="0" y=${y + rh / 2 + 5} class="diagram__etikett">${r.label}</text>
          ${r.segments.map((s) => {
            const w = (s.value / max) * plotW;
            if (w <= 0) return nothing;
            const sx = x;
            x += w;
            const inner = Math.max(0, w - gap);
            return svg`<g>
              <rect x=${sx} y=${y} width=${inner} height=${rh} fill=${s.hatch ? `url(#${id}-hatch)` : s.color} style=${s.hatch ? `--hatch-bg:${s.color}` : ""}>
                <title>${r.label} – ${s.label}: ${fmt(s.value)}</title>
              </rect>
              ${inner > 26 ? svg`<text x=${sx + 6} y=${y + rh / 2 + 4} class="diagram__verdi" fill=${s.hatch ? "#ffffff" : textColorOn(s.color)}>${fmt(s.value)}</text>` : nothing}
            </g>`;
          })}
          <text x=${W - 4} y=${y + rh / 2 + 5} text-anchor="end" class="diagram__etikett">${fmt(total)}</text>
        </g>`;
      })}
    </svg>
    <figcaption class="forklaring">
      ${keys.map(
        (k) => html`<span class="forklaring__post"><span class="forklaring__farge ${k.hatch ? "forklaring__farge--skravur" : ""}" style="background:${k.color}"></span>${k.label}</span>`,
      )}
    </figcaption>
    ${dataTable(
      opts.title,
      ["", ...keys.map((k) => k.label), "Sum"],
      rows.map((r) => [r.label, ...r.segments.map((s) => fmt(s.value)), fmt(r.segments.reduce((a, s) => a + s.value, 0))]),
    )}
  </figure>`;
}

/** Loddrette søyler for én serie (f.eks. inspeksjoner per måned). */
export function columns(
  data: { label: string; value: number; color?: string }[],
  opts: { title: string; color: string; height?: number; width?: number; unit?: string },
): TemplateResult {
  const W = opts.width ?? 520;
  const H = opts.height ?? 180;
  const padB = 22;
  const padT = 18;
  const padL = 30;
  const max = Math.max(1, ...data.map((d) => d.value));
  // Antall er heltall: minst 0–2 på aksen, og bare hele tall som merker (ikke «0, 1, 1»)
  const nice = Math.max(2, niceMax(max));
  const plotH = H - padB - padT;
  const slot = (W - padL) / Math.max(1, data.length);
  const bw = Math.max(4, Math.min(40, slot - 6));
  const ticks = [0, nice / 2, nice].filter((t) => Number.isInteger(t));
  const maxIdx = data.reduce((m, d, i) => (d.value > (data[m]?.value ?? -1) ? i : m), 0);
  return html`<figure class="diagram">
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label=${opts.title}>
      ${ticks.map((t) => {
        const y = padT + plotH - (t / nice) * plotH;
        return svg`<g>
          <line x1=${padL} x2=${W} y1=${y} y2=${y} class=${t === 0 ? "diagram__akse" : "diagram__rutenett"}></line>
          <text x=${padL - 6} y=${y + 4} text-anchor="end" class="diagram__tick">${fmt(Math.round(t))}</text>
        </g>`;
      })}
      ${data.map((d, i) => {
        const h = (d.value / nice) * plotH;
        const x = padL + i * slot + (slot - bw) / 2;
        const y = padT + plotH - h;
        const showLabel = d.value > 0 && (i === maxIdx || i === data.length - 1);
        return svg`<g class="diagram__soyle">
          <rect x=${padL + i * slot} y=${padT} width=${slot} height=${plotH} fill="transparent"><title>${d.label}: ${fmt(d.value)}${opts.unit ? ` ${opts.unit}` : ""}</title></rect>
          ${h > 0 ? svg`<path d=${roundedTop(x, y, bw, h, 3)} fill=${d.color ?? opts.color} pointer-events="none"></path>` : nothing}
          ${showLabel ? svg`<text x=${x + bw / 2} y=${y - 5} text-anchor="middle" class="diagram__verdi-mork">${fmt(d.value)}</text>` : nothing}
          <text x=${x + bw / 2} y=${H - 6} text-anchor="middle" class="diagram__tick">${d.label}</text>
        </g>`;
      })}
    </svg>
    ${dataTable(opts.title, ["", opts.unit ?? "Antall"], data.map((d) => [d.label, fmt(d.value)]))}
  </figure>`;
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Tabellvisning bak «Vis som tabell» (tilgjengelig alternativ til diagrammet). */
export function dataTable(caption: string, head: string[], rows: string[][]): TemplateResult {
  return html`<details class="diagram__tabell">
    <summary>Vis som tabell</summary>
    <table class="tabell tabell--kompakt">
      <caption class="visually-hidden">${caption}</caption>
      <thead>
        <tr>
          ${head.map((h) => html`<th scope="col">${h}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => html`<tr>${r.map((c, i) => (i === 0 ? html`<th scope="row">${c}</th>` : html`<td>${c}</td>`))}</tr>`)}
      </tbody>
    </table>
  </details>`;
}
