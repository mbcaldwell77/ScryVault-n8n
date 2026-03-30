import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { deleteEbayTokenRow } from "@/lib/ebay/token-store";

export async function POST() {
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

    await deleteEbayTokenRow(supabase, user.id);

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("[EBAY_DISCONNECT_POST]", error);
    return NextResponse.json(
      { error: { message: "Failed to disconnect eBay", code: "DISCONNECT_FAILED" } },
      { status: 500 },
    );
  }
}
