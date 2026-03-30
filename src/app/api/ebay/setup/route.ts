import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { getEbaySetupStatus } from "@/lib/ebay/setup";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
        { status: 401 },
      );
    }

    const status = await getEbaySetupStatus(supabase, user.id);

    return NextResponse.json({
      data: status,
    });
  } catch (error) {
    console.error("[EBAY_SETUP_GET]", error);
    const message = error instanceof Error ? error.message : "Failed to fetch eBay setup data";

    return NextResponse.json(
      {
        error: {
          message,
          code: "SETUP_FETCH_FAILED",
        },
      },
      { status: 500 },
    );
  }
}
