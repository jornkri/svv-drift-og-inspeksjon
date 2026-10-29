import { svg, type SVGTemplateResult } from "lit";

/** Enkle strekikoner (24×24, stroke = currentColor). Alltid aria-hidden. */
const wrap = (body: SVGTemplateResult, size = 20) =>
  svg`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  search: (s?: number) => wrap(svg`<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>`, s),
  layers: (s?: number) => wrap(svg`<path d="M12 3l9 5-9 5-9-5 9-5z"></path><path d="M3 13l9 5 9-5"></path>`, s),
  chevronDown: (s = 14) => wrap(svg`<path d="M6 9l6 6 6-6"></path>`, s),
  chevronRight: (s = 16) => wrap(svg`<path d="M9 6l6 6-6 6"></path>`, s),
  chevronLeft: (s = 16) => wrap(svg`<path d="M15 6l-6 6 6 6"></path>`, s),
  close: (s = 18) => wrap(svg`<path d="M6 6l12 12M18 6L6 18"></path>`, s),
  bell: (s?: number) => wrap(svg`<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"></path><path d="M10 21h4"></path>`, s),
  plus: (s?: number) => wrap(svg`<path d="M12 5v14M5 12h14"></path>`, s),
  minus: (s?: number) => wrap(svg`<path d="M5 12h14"></path>`, s),
  locate: (s?: number) => wrap(svg`<circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>`, s),
  measure: (s?: number) => wrap(svg`<path d="M3 17L17 3l4 4L7 21z"></path><path d="M7 13l2 2M10 10l2 2M13 7l2 2"></path>`, s),
  print: (s?: number) => wrap(svg`<path d="M6 9V3h12v6"></path><rect x="3" y="9" width="18" height="8"></rect><path d="M7 14h10v7H7z"></path>`, s),
  map: (s?: number) => wrap(svg`<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"></path><path d="M9 4v14M15 6v14"></path>`, s),
  tasks: (s?: number) => wrap(svg`<path d="M9 6h11M9 12h11M9 18h11"></path><path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"></path>`, s),
  user: (s?: number) => wrap(svg`<circle cx="12" cy="8" r="4"></circle><path d="M4 21c1-4 4-6 8-6s7 2 8 6"></path>`, s),
  camera: (s?: number) => wrap(svg`<path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle>`, s),
  link: (s?: number) => wrap(svg`<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"></path>`, s),
  doc: (s?: number) => wrap(svg`<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4M9 12h6M9 16h6"></path>`, s),
  external: (s = 14) => wrap(svg`<path d="M14 4h6v6M20 4l-9 9"></path><path d="M18 14v6H4V6h6"></path>`, s),
  back: (s = 22) => wrap(svg`<path d="M15 5l-7 7 7 7"></path>`, s),
  cube: (s?: number) => wrap(svg`<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"></path><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"></path>`, s),
  slice: (s?: number) => wrap(svg`<path d="M4 20L20 4"></path><path d="M4 4h7v7H4zM13 13h7v7h-7z"></path>`, s),
  profile: (s?: number) => wrap(svg`<path d="M3 18l5-7 4 4 4-8 5 11"></path><path d="M3 21h18"></path>`, s),
  eye: (s?: number) => wrap(svg`<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>`, s),
  wifiOff: (s?: number) => wrap(svg`<path d="M3 3l18 18"></path><path d="M8.5 16.5a5 5 0 017 0M5 13a10 10 0 015-2.6M12 20h.01M19 13a10 10 0 00-3.3-2.1M2 9a15 15 0 015.5-3.3M22 9a15 15 0 00-9.2-4"></path>`, s),
  check: (s = 14) => wrap(svg`<path d="M5 12l5 5 9-10"></path>`, s),
  filter: (s?: number) => wrap(svg`<path d="M4 5h16l-6 8v6l-4-2v-4z"></path>`, s),
  logout: (s?: number) => wrap(svg`<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"></path>`, s),
};
