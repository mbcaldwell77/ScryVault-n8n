import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { buildEbayConsentUrl, buildOAuthState } from "@/lib/ebay/oauth";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", origin));
    }

    const state = buildOAuthState(user.id);
    const consentUrl = buildEbayConsentUrl(state);

    return NextResponse.redirect(consentUrl);
  } catch (error) {
    console.error("[EBAY_CONNECT_GET]", error);
    return NextResponse.redirect(new URL("/settings?ebay_error=connect_failed", origin));
  }
}
