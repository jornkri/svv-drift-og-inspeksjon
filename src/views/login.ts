import { html, nothing } from "lit";
import { signIn } from "../auth/auth.ts";
import { config } from "../config.ts";
import { LightElement } from "../ui/base.ts";

/** Innloggingsside (ArcGIS Enterprise på kart.vegvesen.no, OAuth 2.0 redirect). */
export class SvvLogin extends LightElement {
  static override properties = { reason: { type: String } };
  declare reason: string | undefined;

  protected override render() {
    const vert = (() => {
      try {
        return new URL(config.portalUrl).host;
      } catch {
        return config.portalUrl;
      }
    })();
    const enterprise = vert === "kart.vegvesen.no";
    return html`
      <div class="login">
        <section class="login__innhold">
          <div class="login__merke">
            <img src="${import.meta.env.BASE_URL}svv-merke.svg" alt="" width="69" height="48" />
            <span>Statens vegvesen</span>
          </div>
          <div class="login__midt">
            <div class="login__boks">
              <h1>Drift og inspeksjon</h1>
              <p class="login__ingress">Se, inspiser og registrer på VA-, elektro- og vegobjekter – på kontoret og i felt.</p>
              ${this.reason ? html`<p class="melding melding--feil" role="alert">${this.reason}</p>` : nothing}
              <button class="knapp knapp--primar knapp--stor" ?disabled=${!config.appId} @click=${() => signIn(config)}>Logg inn</button>
              <div class="login__info">
                <strong>Slik fungerer innloggingen</strong>
                <span
                  >${enterprise
                    ? "Du blir sendt til ArcGIS Enterprise på kart.vegvesen.no (OAuth 2.0). Ansatte velger enkel pålogging via etatens identitetstjeneste, entreprenører logger inn med ArcGIS-konto på samme side."
                    : `Du blir sendt til ArcGIS-portalen ${vert} for å logge inn (OAuth 2.0). I produksjon brukes ArcGIS Enterprise på kart.vegvesen.no med etatens enkel pålogging.`}
                  Tilgang til lag og prosjekter styres av grupper i portalen.</span
                >
              </div>
            </div>
          </div>
          <div class="infostripe"><span class="infostripe__kat">${vert.toUpperCase()}</span><span class="infostripe__tekst">versjon 0.1 · pilot E45 Kløfta</span></div>
        </section>
        <section class="login__bilde" aria-hidden="true">
          <div class="login__foto" style="background-image:url(${import.meta.env.BASE_URL}login-foto.jpg)">
            <span class="login__kreditering">E45 Kløfta, september 2026 · dronefoto fra pilotprosjektet</span>
          </div>
          <div class="login__trekant"></div>
        </section>
      </div>
    `;
  }
}

customElements.define("svv-login", SvvLogin);
