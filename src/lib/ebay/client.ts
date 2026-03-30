import { getEbayConfig } from "./config";
import type { EbayOAuthTokenResponse, EbayTokenPayload } from "./types";

function buildBasicAuthHeader(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

function toTokenPayload(
  response: EbayOAuthTokenResponse,
  previousRefreshToken?: string,
): EbayTokenPayload {
  const now = Date.now();
  const accessExpiryMs = now + response.expires_in * 1000;
  const refreshExpiryMs = now + (response.refresh_token_expires_in || 60 * 60 * 24 * 30 * 18) * 1000;

  const scopes = response.scope
    ? response.scope.split(" ").map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    access_token: response.access_token,
    refresh_token: response.refresh_token || previousRefreshToken || "",
    access_token_expires_at: new Date(accessExpiryMs).toISOString(),
    refresh_token_expires_at: new Date(refreshExpiryMs).toISOString(),
    scopes,
  };
}

async function requestOAuthToken(body: URLSearchParams): Promise<EbayOAuthTokenResponse> {
  const config = getEbayConfig();
  const response = await fetch(`${config.apiBaseUrl}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthHeader(config.clientId, config.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const json = await response.json();

  if (!response.ok) {
    const message = json.error_description || json.error || "Failed to request eBay token";
    throw new Error(message);
  }

  return json as EbayOAuthTokenResponse;
}

export async function exchangeCodeForToken(code: string): Promise<EbayTokenPayload> {
  const config = getEbayConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });

  const tokenResponse = await requestOAuthToken(body);
  return toTokenPayload(tokenResponse);
}

export async function refreshAccessToken(
  refreshToken: string,
  scopes: string[],
): Promise<EbayTokenPayload> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  });

  const tokenResponse = await requestOAuthToken(body);
  return toTokenPayload(tokenResponse, refreshToken);
}
