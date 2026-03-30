import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { getEbayConnectionStatus } from "@/lib/ebay/tokens";
import { getEbayDefaultCategoryId } from "@/lib/ebay/config";

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

    const status = await getEbayConnectionStatus(supabase, user.id);

    return NextResponse.json({
      data: {
        ...status,
        default_category_id: getEbayDefaultCategoryId(),
      },
    });
  } catch (error) {
    console.error("[EBAY_CONNECTION_GET]", error);
    return NextResponse.json(
      {
        error: {
          message: "Failed to fetch eBay connection status",
          code: "FETCH_FAILED",
        },
      },
      { status: 500 },
    );
  }
}
