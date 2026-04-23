import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { callN8nWebhook, N8nWebhookError } from "@/lib/n8n/webhook";
import type { GenerationResult, ListingGenerationInput } from "@/lib/claude/types";
import { runListingAgent, shouldUseAgent } from "@/lib/agents";

// POST /api/listings/generate — generate listing content
//
// Routing:
//   AGENT_MODE=true  + ANTHROPIC_API_KEY set → Anthropic Agent SDK loop (in-process)
//   otherwise                                → Gemini via n8n webhook
//
// Both paths return the same shape: { data: GenerationResult }
// Agent path adds an extra `data.agent` field for trace/debug.
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

    const { inventory_item_id } = await request.json();

    if (!inventory_item_id) {
      return NextResponse.json(
        { error: { message: "inventory_item_id is required", code: "MISSING_ID" } },
        { status: 400 },
      );
    }

    // Fetch the inventory item with books_catalog and images
    const { data: item, error: itemError } = await supabase
      .from("inventory_items")
      .select("*, books_catalog(*), item_images(*)")
      .eq("id", inventory_item_id)
      .eq("user_id", user.id)
      .single();

    if (itemError) {
      if (itemError.code === "PGRST116") {
        return NextResponse.json(
          { error: { message: "Item not found", code: "NOT_FOUND" } },
          { status: 404 },
        );
      }
      throw itemError;
    }

    const book = item.books_catalog;

    // Build input shared by both paths
    const images = (item.item_images || [])
      .sort((a: { display_order: number }, b: { display_order: number }) => a.display_order - b.display_order)
      .map((img: { public_url: string }) => img.public_url);

    const generationInput: ListingGenerationInput = {
      title: book.title,
      subtitle: book.subtitle,
      authors: book.authors,
      publisher: book.publisher,
      published_date: book.published_date,
      isbn: book.isbn,
      page_count: book.page_count,
      condition: item.condition,
      condition_notes: item.condition_notes,
      categories: book.categories,
      language: book.language,
      image_urls: images,
    };

    // ── Path A: Agent SDK (AGENT_MODE=true) ──
    if (shouldUseAgent()) {
      const agentResult = await runListingAgent(generationInput);
      return NextResponse.json({ data: agentResult });
    }

    // ── Path B: Gemini via n8n (default) ──
    const result = await callN8nWebhook<{ data: GenerationResult }>(
      "listings/generate",
      { inventory_item_id, ...generationInput },
      { timeout: 60_000 }, // Listing generation can take a while
    );

    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("[LISTINGS_GENERATE]", error);

    if (error instanceof N8nWebhookError) {
      return NextResponse.json(
        { error: { message: `n8n workflow error: ${error.message}`, code: "N8N_ERROR" } },
        { status: error.statusCode >= 500 ? 502 : error.statusCode },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to generate listing";

    return NextResponse.json(
      { error: { message, code: "GENERATION_FAILED" } },
      { status: 500 },
    );
  }
}
