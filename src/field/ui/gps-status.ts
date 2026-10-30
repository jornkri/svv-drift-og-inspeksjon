import { html } from "lit";
import { services } from "../../services.ts";
import { StoreElement } from "../../ui/base.ts";

/** «GPS ±3 m · Tilkoblet · 0 i kø» */
export class SvvGpsStatus extends StoreElement {
  protected override render() {
    const { gps, online, koAntall } = this.store.state;
    const max = services().cfg.geofence.maxAccuracyM;
    const ok = gps.aktiv && gps.noyaktighet != null && gps.noyaktighet <= max;
    const tilstand = !gps.aktiv && gps.feil ? "feil" : ok ? "ok" : "svak";
    const kilde = gps.simulert ? "Simulert GPS" : "GPS";
    const presisjon = tilstand === "feil" ? gps.feil : gps.noyaktighet != null ? `±${Math.round(gps.noyaktighet)} m` : (gps.feil ?? "søker …");
    // Skjermlesere får bare tilstandsskifter, ikke hver ny meterverdi
    const kunngjoring = `${kilde} ${tilstand === "ok" ? "klar" : tilstand === "feil" ? gps.feil : "unøyaktig eller søker"}, ${online ? "tilkoblet" : "frakoblet"}, ${koAntall} i kø`;
    return html`<div class="gpsstatus">
      <span class="gpsstatus__lampe gpsstatus__lampe--${tilstand}" aria-hidden="true"></span>
      <span aria-hidden="true"
        ><b>${kilde} ${presisjon}</b>${tilstand === "svak" && gps.noyaktighet != null ? " (for unøyaktig)" : ""} ·
        ${online ? "Tilkoblet" : "Frakoblet"} · ${koAntall} i kø</span
      >
      <span class="visually-hidden" role="status">${kunngjoring}</span>
    </div>`;
  }
}

customElements.define("svv-gps-status", SvvGpsStatus);
