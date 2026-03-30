import type { EbayTokenPayload, EbayTokenRow } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getEbayTokenRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<EbayTokenRow | null> {
  const { data, error } = await supabase
    .from("ebay_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as EbayTokenRow | null) || null;
}

export async function upsertEbayTokenRow(
  supabase: SupabaseClient,
  userId: string,
  token: EbayTokenPayload,
): Promise<EbayTokenRow> {
  const { data, error } = await supabase
    .from("ebay_tokens")
    .upsert(
      {
        user_id: userId,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        access_token_expires_at: token.access_token_expires_at,
        refresh_token_expires_at: token.refresh_token_expires_at,
        scopes: token.scopes,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as EbayTokenRow;
}

export async function deleteEbayTokenRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("ebay_tokens").delete().eq("user_id", userId);
  if (error) {
    throw error;
  }
}
