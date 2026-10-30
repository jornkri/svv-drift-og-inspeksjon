/**
 * Autoutfylling av inspeksjonsskjemaet fra objektet (og forrige inspeksjon).
 * Ren logikk uten ArcGIS-avhengighet.
 */
import type { Fotovedlegg } from "../data/DataService.ts";
import type { Inspeksjon, Objekt, Tilstandsgrad } from "../data/schema.ts";
import { driftskrav } from "../handbok/r610.ts";

export interface Posisjon {
  x: number;
  y: number;
  noyaktighet: number | null;
}

export interface ForrigeInspeksjon {
  tidspunkt: string;
  tilstandsgrad: Tilstandsgrad;
  tekst: string;
}

export interface InspeksjonUtkast {
  /** Lokal id (også nøkkel i IndexedDB) */
  id: string;
  objekt: Objekt;
  oppgaveId: string | null;
  /** Autoutfylte felt er låst til brukeren velger «Feil objekt? Velg annet» */
  laast: boolean;
  forrige: ForrigeInspeksjon | null;
  avstand_m: number | null;
  tilstandsgrad: Tilstandsgrad | null;
  avvikstype: string;
  tiltak_behov: "ja" | "nei" | null;
  kommentar: string;
  inspektor: string;
  tidspunkt: string;
  posisjon: Posisjon | null;
  bilder: Fotovedlegg[];
  endret: string;
  /** Konsekvensgrad etter R610:2025 (valgfri; eldre utkast mangler feltet) */
  konsekvensgrad?: 0 | 1 | 2 | 3 | null;
  /** Sjekkpunkt (indeks i håndbokens liste) → resultat */
  sjekkliste?: Record<number, "ok" | "avvik">;
}

const MND = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

export function tgResultat(tg: number): string {
  return tg === 0 ? "OK" : tg === 1 ? "Mindre avvik" : tg === 2 ? "Avvik" : "Alvorlig avvik";
}

/** «OK · mars 2026» */
export function forrigeTekst(i: Pick<Inspeksjon, "tidspunkt" | "tilstandsgrad">): string {
  const d = new Date(i.tidspunkt);
  return `${tgResultat(i.tilstandsgrad)} · ${MND[d.getMonth()]} ${d.getFullYear()}`;
}

/** Siste inspeksjon (nyeste tidspunkt) eller null. */
export function latest(inspeksjoner: Inspeksjon[]): Inspeksjon | null {
  return inspeksjoner.reduce<Inspeksjon | null>((a, b) => (!a || b.tidspunkt > a.tidspunkt ? b : a), null);
}

export interface PrefillContext {
  id: string;
  inspektor: string;
  now: Date;
  posisjon?: Posisjon | null;
  oppgaveId?: string | null;
  avstand_m?: number | null;
}

/** Lager et nytt utkast med feltene fylt ut fra objektet. */
export function prefill(objekt: Objekt, tidligere: Inspeksjon[], ctx: PrefillContext): InspeksjonUtkast {
  const f = latest(tidligere);
  return {
    id: ctx.id,
    objekt: { ...objekt },
    oppgaveId: ctx.oppgaveId ?? null,
    laast: true,
    forrige: f ? { tidspunkt: f.tidspunkt, tilstandsgrad: f.tilstandsgrad, tekst: forrigeTekst(f) } : null,
    avstand_m: ctx.avstand_m ?? null,
    tilstandsgrad: null,
    avvikstype: "",
    tiltak_behov: null,
    kommentar: "",
    inspektor: ctx.inspektor,
    tidspunkt: ctx.now.toISOString(),
    posisjon: ctx.posisjon ?? null,
    bilder: [],
    endret: ctx.now.toISOString(),
    konsekvensgrad: null,
    sjekkliste: {},
  };
}

const num = (n: number | null, d = 2) =>
  n == null ? "–" : n.toLocaleString("nb-NO", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Feltene i den blå boksen («Autoutfylt fra nærmeste objekt»). */
export function autoFields(u: InspeksjonUtkast): { k: string; v: string }[] {
  const o = u.objekt;
  return [
    { k: "Objekt", v: `${o.objekt_id} · ${o.navn}` },
    { k: "Fag / modell", v: `${o.fag} · ${o.fagmodell ?? "–"}` },
    { k: "Vegreferanse", v: o.vegreferanse ?? "–" },
    { k: "Lengde", v: o.lengde_m != null ? `${num(o.lengde_m)} m` : "–" },
    { k: "Kote", v: o.kote_min != null || o.kote_max != null ? `${num(o.kote_min)} – ${num(o.kote_max)}` : "–" },
    { k: "Forrige inspeksjon", v: u.forrige?.tekst ?? "Ingen" },
  ];
}

/** Nøkkelen et utkast lagres under (ett utkast per objekt). */
export const draftId = (globalid: string) => `utkast-${globalid}`;

/** «Feil objekt? Velg annet» låser opp de autoutfylte feltene. */
export function unlock(u: InspeksjonUtkast): InspeksjonUtkast {
  return { ...u, laast: false };
}

/** Bytter objekt: fyller ut på nytt, beholder brukerens registreringer og låser igjen. */
export function changeObject(
  u: InspeksjonUtkast,
  objekt: Objekt,
  tidligere: Inspeksjon[],
  opts: { oppgaveId?: string | null; avstand_m?: number | null; now: Date },
): InspeksjonUtkast {
  const ny = prefill(objekt, tidligere, {
    id: draftId(objekt.globalid),
    inspektor: u.inspektor,
    now: opts.now,
    posisjon: u.posisjon,
    oppgaveId: opts.oppgaveId ?? null,
    avstand_m: opts.avstand_m ?? null,
  });
  return {
    ...ny,
    tilstandsgrad: u.tilstandsgrad,
    avvikstype: u.avvikstype,
    tiltak_behov: u.tiltak_behov,
    konsekvensgrad: u.konsekvensgrad,
    kommentar: u.kommentar,
    bilder: u.bilder,
  };
}

/** Valideringsfeil (tom liste = klar til innsending). */
export function validate(u: InspeksjonUtkast): string[] {
  const e: string[] = [];
  if (u.tilstandsgrad == null) e.push("Velg tilstandsgrad.");
  if (!u.avvikstype) e.push("Velg avvikstype.");
  if (u.tilstandsgrad != null && u.tilstandsgrad >= 1 && u.avvikstype === "Ingen avvik") e.push("Avvikstype må angis når tilstandsgraden er 1 eller høyere.");
  if (u.tilstandsgrad === 0 && u.avvikstype && u.avvikstype !== "Ingen avvik") e.push("Tilstandsgrad 0 betyr ingen avvik – velg «Ingen avvik» eller en høyere tilstandsgrad.");
  if (u.tiltak_behov == null) e.push("Angi om det er behov for tiltak.");
  if (u.tilstandsgrad != null && u.tilstandsgrad >= 2 && !u.kommentar.trim()) e.push("Beskriv avviket i kommentarfeltet (TG 2–3).");
  if (!u.laast) e.push("Bekreft objektet før innsending.");
  if (u.tilstandsgrad === 0 && Object.values(u.sjekkliste ?? {}).includes("avvik")) e.push("Et sjekkpunkt er markert med avvik – velg tilstandsgrad 1 eller høyere.");
  return e;
}

/** Inspeksjonsposten som lagres i tabellen (med autoutfylte kopier av objektfeltene). */
export function toInspeksjon(u: InspeksjonUtkast, now: Date): Inspeksjon {
  if (u.tilstandsgrad == null || u.tiltak_behov == null) throw new Error("Utkastet er ikke komplett");
  const o = u.objekt;
  return {
    objekt_globalid: o.globalid,
    tilstandsgrad: u.tilstandsgrad,
    avvikstype: u.avvikstype,
    tiltak_behov: u.tiltak_behov,
    kommentar: u.kommentar.trim(),
    inspektor: u.inspektor,
    tidspunkt: now.toISOString(),
    pos_noyaktighet_m: u.posisjon?.noyaktighet ?? null,
    pos_x: u.posisjon?.x ?? null,
    pos_y: u.posisjon?.y ?? null,
    oppgave_id: u.oppgaveId,
    obj_objekt_id: o.objekt_id,
    obj_navn: o.navn,
    obj_fag: o.fag,
    obj_fagmodell: o.fagmodell,
    obj_vegreferanse: o.vegreferanse,
    obj_lengde_m: o.lengde_m,
    obj_kote_min: o.kote_min,
    obj_kote_max: o.kote_max,
    // Konsekvensgrad gjelder bare avvik (TG 1–3)
    konsekvensgrad: u.tilstandsgrad >= 1 ? (u.konsekvensgrad ?? null) : null,
    sjekkliste: sjekklisteTekst(u),
  };
}

/** Sjekklisten som tekst (én linje per kontrollert punkt), eller null hvis ingen er kontrollert. */
export function sjekklisteTekst(u: Pick<InspeksjonUtkast, "objekt" | "sjekkliste">): string | null {
  const punkter = driftskrav(u.objekt)?.sjekkpunkter ?? [];
  const linjer = Object.entries(u.sjekkliste ?? {})
    .map(([i, v]) => ({ p: punkter[Number(i)], v }))
    .filter((x) => x.p)
    .map((x) => `${x.v === "ok" ? "OK" : "AVVIK"}: ${x.p!.tekst}`);
  return linjer.length ? linjer.join("\n") : null;
}
