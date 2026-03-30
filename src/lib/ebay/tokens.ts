import { refreshAccessToken } from "./client";
import {
  getEbayConfigurationStatus,
  getEbayEnvironment,
  getEbayScopes,
} from "./config";
import { getEbayTokenRow, upsertEbayTokenRow } from "./token-store";
import type { EbayConnectionStatus } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

const REFRESH_WINDOW_MS = 2 * 60 * 1000;
const refreshLocks = new Map<string, Promise<string>>();

function isExpiringSoon(isoDate: string): boolean {
  return new Date(isoDate).getTime() - Date.now() <= REFRESH_WINDOW_MS;
}

async function refreshTokenForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const current = await getEbayTokenRow(supabase, userId);

  if (!current) {
    throw new Error("eBay account is not connected");
  }

  if (!isExpiringSoon(current.access_token_expires_at)) {
    return current.access_token;
  }

  if (new Date(current.refresh_token_expires_at).getTime() <= Date.now()) {
    throw new Error("eBay refresh token has expired. Reconnect your eBay account.");
  }

  const nextToken = await refreshAccessToken(
    current.refresh_token,
    current.scopes?.length ? current.scopes : getEbayScopes(),
  );

  const updated = await upsertEbayTokenRow(supabase, userId, nextToken);
  return updated.access_token;
}

export async function getValidEbayAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const existing = await getEbayTokenRow(supabase, userId);

  if (!existing) {
    throw new Error("eBay account is not connected");
  }

  if (!isExpiringSoon(existing.access_token_expires_at)) {
    return existing.access_token;
  }

  const currentLock = refreshLocks.get(userId);
  if (currentLock) {
    return currentLock;
  }

  const lockPromise = refreshTokenForUser(supabase, userId).finally(() => {
    refreshLocks.delete(userId);
  });

  refreshLocks.set(userId, lockPromise);
  return lockPromise;
}

export async function getEbayConnectionStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<EbayConnectionStatus> {
  const environment = getEbayEnvironment();
  const scopes = getEbayScopes();
  const configuration = getEbayConfigurationStatus();
  const token = await getEbayTokenRow(supabase, userId);

  if (!token) {
    return {
      connected: false,
      environment,
      expires_at: null,
      scopes,
      configuration,
    };
  }

  return {
    connected: true,
    environment,
    expires_at: token.access_token_expires_at,
    scopes: token.scopes || scopes,
    configuration,
  };
}
