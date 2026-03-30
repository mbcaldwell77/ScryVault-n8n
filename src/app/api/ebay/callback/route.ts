import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { exchangeCodeForToken } from "@/lib/ebay/client";
import { parseOAuthState } from "@/lib/ebay/oauth";
import { upsertEbayTokenRow } from "@/lib/ebay/token-store";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${origin}/login?error=auth_required`);
    }

    if (!code) {
      return NextResponse.redirect(`${origin}/settings?ebay_error=missing_code`);
    }

    const parsedState = parseOAuthState(state);
    if (!parsedState || parsedState.userId !== user.id) {
      return NextResponse.redirect(`${origin}/settings?ebay_error=invalid_state`);
    }

    const token = await exchangeCodeForToken(code);
    await upsertEbayTokenRow(supabase, user.id, token);

    return NextResponse.redirect(`${origin}/settings?ebay=connected`);
  } catch (error) {
    console.error("[EBAY_CALLBACK_GET]", error);
    return NextResponse.redirect(`${origin}/settings?ebay_error=callback_failed`);
  }
}
