import { randomUUID } from "node:crypto";
import { getEbayConfig } from "./config";

export function buildEbayConsentUrl(state: string): string {
  const config = getEbayConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  });

  return `${config.authBaseUrl}/oauth2/authorize?${params.toString()}`;
}

export function buildOAuthState(userId: string): string {
  return `${userId}:${randomUUID()}`;
}

export function parseOAuthState(state: string | null): { userId: string } | null {
  if (!state) return null;
  const [userId] = state.split(":");
  if (!userId) return null;
  return { userId };
}
