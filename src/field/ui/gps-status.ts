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
    const presisjon = gps.noyaktighet != null ? `±${Math.round(gps.noyaktighet)} m` : gps.feil ?? "søker …";
    return html`<div class="gpsstatus" role="status" aria-live="polite">
      <span class="gpsstatus__lampe gpsstatus__lampe--${tilstand}" aria-hidden="true"></span>
      <span
        ><b>${kilde} ${presisjon}</b>${tilstand === "svak" && gps.noyaktighet != null ? " (for unøyaktig)" : ""} ·
        ${online ? "Tilkoblet" : "Frakoblet"} · ${koAntall} i kø</span
      >
    </div>`;
  }
}

customElements.define("svv-gps-status", SvvGpsStatus);
