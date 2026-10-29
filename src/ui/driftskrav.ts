import { html, nothing } from "lit";
import type { Inspeksjon, Objekt } from "../data/schema.ts";
import { driftskrav, intervallKort, nesteInspeksjon, type FristStatus, type Kildepunkt } from "../handbok/r610.ts";
import { LightElement, fmtDate } from "./base.ts";

export const FRIST_TEKST: Record<FristStatus, string> = {
  forfalt: "Forfalt",
  snart: "Forfaller snart",
  ok: "I rute",
  aldri: "Aldri inspisert",
  ukjent: "Intervall ikke fastsatt",
};
export const FRIST_KLASSE: Record<FristStatus, string> = {
  forfalt: "pille--rod",
  snart: "pille--oransje",
  ok: "pille--gronn",
  aldri: "pille--rod",
  ukjent: "pille--gra",
};

const punktliste = (l: Kildepunkt[]) =>
  html`<ul class="kravliste">
    ${l.map((p) => html`<li>${p.tekst} <span class="kravliste__kilde">${p.kilde}${p.punkt ? ` ${p.punkt}` : ""}</span></li>`)}
  </ul>`;

/** Driftskrav fra håndbøkene for objektet: inspeksjonsintervall, frist, sjekkpunkter og tiltak. */
export class SvvDriftskrav extends LightElement {
  static override properties = { objekt: { attribute: false }, insp: { attribute: false } };
  declare objekt: Objekt | null;
  declare insp: Inspeksjon[];

  protected override render() {
    const o = this.objekt;
    if (!o) return nothing;
    const k = driftskrav(o);
    if (!k) return nothing;
    const siste = [...(this.insp ?? [])].sort((a, b) => b.tidspunkt.localeCompare(a.tidspunkt))[0] ?? null;
    const n = nesteInspeksjon(siste?.tidspunkt ?? null, k.intervallMnd, new Date());
    return html`<section class="egenskaper driftskrav" aria-labelledby="driftskrav-tittel">
      <h3 class="kategori" id="driftskrav-tittel">DRIFTSKRAV · ${k.type.toUpperCase()}</h3>
      <dl>
        <div class="egenskaper__rad"><dt>Inspeksjonsintervall</dt><dd>${intervallKort(k.intervallMnd)}</dd></div>
        <div class="egenskaper__rad"><dt>Sist inspisert</dt><dd>${siste ? fmtDate(siste.tidspunkt) : "Aldri"}</dd></div>
        <div class="egenskaper__rad">
          <dt>Neste frist</dt>
          <dd>
            ${n.frist ? `${fmtDate(n.frist.toISOString())} ` : ""}<span class="pille ${FRIST_KLASSE[n.status]}">${FRIST_TEKST[n.status]}</span>
          </dd>
        </div>
      </dl>
      <p class="kravliste__kilde">${k.intervallTekst} (${k.intervallKilde})</p>
      ${k.sjekkpunkter.length
        ? html`<details class="kravdetaljer">
            <summary>Sjekkpunkter ved inspeksjon (${k.sjekkpunkter.length})</summary>
            ${punktliste(k.sjekkpunkter)}
          </details>`
        : nothing}
      ${k.typiskeAvvik.length
        ? html`<details class="kravdetaljer">
            <summary>Typiske avvik (${k.typiskeAvvik.length})</summary>
            ${punktliste(k.typiskeAvvik)}
          </details>`
        : nothing}
      ${k.tiltak.length
        ? html`<details class="kravdetaljer">
            <summary>Tiltak og tiltakstid (${k.tiltak.length})</summary>
            ${punktliste(k.tiltak)}
          </details>`
        : nothing}
    </section>`;
  }
}

customElements.define("svv-driftskrav", SvvDriftskrav);
