import { html, nothing } from "lit";
import { signIn } from "../auth/auth.ts";
import { config } from "../config.ts";
import { LightElement } from "../ui/base.ts";

/** Innloggingsside (ArcGIS Enterprise på kart.vegvesen.no, OAuth 2.0 redirect). */
export class SvvLogin extends LightElement {
  static override properties = { reason: { type: String } };
  declare reason: string | undefined;

  protected override render() {
    return html`
      <div class="login">
        <section class="login__innhold">
          <div class="login__merke">
            <img src="/logo-plassholder.svg" alt="Statens vegvesen" width="48" height="48" />
            <span>Statens vegvesen</span>
          </div>
          <div class="login__midt">
            <div class="login__boks">
              <h1>Drift og inspeksjon</h1>
              <p class="login__ingress">Se, inspiser og registrer på VA-, elektro- og vegobjekter – på kontoret og i felt.</p>
              ${this.reason ? html`<p class="melding melding--feil" role="alert">${this.reason}</p>` : nothing}
              <button class="knapp knapp--primar knapp--stor" ?disabled=${!config.appId} @click=${() => signIn(config)}>
                Logg inn med Vegvesen-konto
              </button>
              <button class="knapp knapp--sekundar knapp--stor" ?disabled=${!config.appId} @click=${() => signIn(config)}>
                Logg inn som entreprenør (ArcGIS-konto)
              </button>
              <div class="login__info">
                <strong>Slik fungerer innloggingen</strong>
                <span
                  >Du blir sendt til ArcGIS Enterprise på kart.vegvesen.no (OAuth 2.0). Ansatte bruker enkel pålogging via etatens
                  identitetstjeneste. Tilgang til lag og prosjekter styres av grupper i portalen.</span
                >
              </div>
            </div>
          </div>
          <div class="infostripe"><span class="infostripe__kat">KART.VEGVESEN.NO</span><span class="infostripe__tekst">versjon 0.1 · pilot E45 Kløfta</span></div>
        </section>
        <section class="login__bilde" aria-hidden="true">
          <div class="login__foto">[Foto: driftsoperatør i felt ved stikkrenne – fra SVVs bildebank, med fotokreditering]</div>
          <div class="login__trekant"></div>
        </section>
      </div>
    `;
  }
}

customElements.define("svv-login", SvvLogin);
