import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";

// GET /api/sources — list all sources for the current user
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
        { status: 401 },
      );
    }

    const { data, error } = await supabase
      .from("sources")
      .select("*")
      .eq("user_id", user.id)
      .order("name");

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[SOURCES_GET]", error);
    return NextResponse.json(
      { error: { message: "Failed to fetch sources", code: "FETCH_FAILED" } },
      { status: 500 },
    );
  }
}

// POST /api/sources — create a new source
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
        { status: 401 },
      );
    }

    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: { message: "Source name is required", code: "MISSING_NAME" } },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("sources")
      .insert({
        user_id: user.id,
        name: body.name,
        type: body.type || null,
        notes: body.notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("[SOURCES_POST]", error);
    return NextResponse.json(
      { error: { message: "Failed to create source", code: "CREATE_FAILED" } },
      { status: 500 },
    );
  }
}
