import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";

const DEFAULT_TEMPLATES = [
  {
    name: "Default Title",
    type: "title",
    template:
      "Generate an eBay-optimized title (max 80 chars) for a {{condition}} copy of \"{{title}}\" by {{authors}}. Include author last name, key title words, and condition keyword. Prioritize Cassini search terms.",
    is_default: true,
  },
  {
    name: "Default Description",
    type: "description",
    template:
      "Write an HTML-formatted eBay book listing description for \"{{title}}\" by {{authors}} ({{publisher}}, {{published_date}}). Condition: {{condition}}. Notes: {{condition_notes}}. Include: brief hook, book details, condition assessment, shipping note. Use <h3>, <p>, <ul>, <strong> tags. 150-250 words.",
    is_default: true,
  },
  {
    name: "Default Condition Notes",
    type: "condition_notes",
    template:
      "Write 1-3 sentences describing the condition of this {{condition}} book. Notes from seller: {{condition_notes}}. Be specific about wear, markings, and overall state. Honest and accurate.",
    is_default: true,
  },
];

// GET /api/prompt-templates — list all templates for the current user
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

    // Check if user has any templates; seed defaults if not
    const { data: existing, error: checkError } = await supabase
      .from("prompt_templates")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (checkError) throw checkError;

    if (!existing || existing.length === 0) {
      const toInsert = DEFAULT_TEMPLATES.map((t) => ({
        ...t,
        user_id: user.id,
      }));
      const { error: seedError } = await supabase
        .from("prompt_templates")
        .insert(toInsert);
      if (seedError) throw seedError;
    }

    const { data, error } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("type")
      .order("is_default", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[PROMPT_TEMPLATES_GET]", error);
    return NextResponse.json(
      {
        error: {
          message: "Failed to fetch prompt templates",
          code: "FETCH_FAILED",
        },
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();

    if (!body.id || !body.template) {
      return NextResponse.json(
        {
          error: {
            message: "id and template are required",
            code: "MISSING_FIELDS",
          },
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("prompt_templates")
      .update({
        template: body.template,
      })
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[PROMPT_TEMPLATES_PATCH]", error);
    return NextResponse.json(
      {
        error: {
          message: "Failed to update prompt template",
          code: "UPDATE_FAILED",
        },
      },
      { status: 500 },
    );
  }
}

// POST /api/prompt-templates — create a new template
export async function POST(request: NextRequest) {
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

    const body = await request.json();

    if (!body.name || !body.type || !body.template) {
      return NextResponse.json(
        {
          error: {
            message: "name, type, and template are required",
            code: "MISSING_FIELDS",
          },
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("prompt_templates")
      .insert({
        user_id: user.id,
        name: body.name,
        type: body.type,
        template: body.template,
        is_default: false,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("[PROMPT_TEMPLATES_POST]", error);
    return NextResponse.json(
      {
        error: {
          message: "Failed to create prompt template",
          code: "CREATE_FAILED",
        },
      },
      { status: 500 },
    );
  }
}
