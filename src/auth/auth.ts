import IdentityManager from "@arcgis/core/identity/IdentityManager.js";
import OAuthInfo from "@arcgis/core/identity/OAuthInfo.js";
import Portal from "@arcgis/core/portal/Portal.js";
import type { AppConfig } from "../config.ts";

export type AuthState =
  | { status: "mock" }
  | { status: "signed-in"; portal: Portal }
  | { status: "anonym"; portal: Portal }
  | { status: "signed-out"; reason?: string };

/** Om brukeren kan logge ut (ikke i mock og ikke i offentlig pilot uten innlogging). */
export const kanLoggeUt = (cfg: AppConfig) => !cfg.useMock && !cfg.anonym;

const sharingUrl = (cfg: AppConfig) => `${cfg.portalUrl}/sharing`;

function registerOAuth(cfg: AppConfig) {
  const info = new OAuthInfo({
    appId: cfg.appId,
    portalUrl: cfg.portalUrl,
    // Redirect-flyt (ikke popup) med PKCE. Ansatte får SAML-pålogging i portalen,
    // entreprenører logger inn med egen ArcGIS-konto på samme side.
    popup: false,
    flowType: "authorization-code",
    preserveUrlHash: true,
  });
  IdentityManager.registerOAuthInfos([info]);
}

/**
 * Initierer innlogging. I mock-modus hoppes portalen over helt.
 * Etter redirect tilbake fra portalen fullfører IdentityManager flyten automatisk.
 */
export async function initAuth(cfg: AppConfig): Promise<AuthState> {
  if (cfg.useMock) return { status: "mock" };
  if (cfg.anonym) {
    // Offentlig delte webkart, webscener og lag – ingen innlogging
    const portal = new Portal({ url: cfg.portalUrl, authMode: "anonymous" });
    await portal.load();
    return { status: "anonym", portal };
  }
  if (!cfg.appId) return { status: "signed-out", reason: "VITE_APP_ID er ikke satt. Registrer appen i portalen (se README)." };
  registerOAuth(cfg);
  try {
    await IdentityManager.checkSignInStatus(sharingUrl(cfg));
    const portal = new Portal({ url: cfg.portalUrl, authMode: "immediate" });
    await portal.load();
    return { status: "signed-in", portal };
  } catch {
    return { status: "signed-out" };
  }
}

/** Starter redirect til portalens påloggingsside. */
export function signIn(cfg: AppConfig): void {
  registerOAuth(cfg);
  void IdentityManager.getCredential(sharingUrl(cfg), { oAuthPopupConfirmation: false });
}

export function signOut(cfg: AppConfig): void {
  if (!cfg.useMock) IdentityManager.destroyCredentials();
  location.assign(location.pathname);
}
