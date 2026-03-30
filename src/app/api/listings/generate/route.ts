import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { generateListing } from "@/lib/claude/generate-listing";
import type { ListingGenerationInput } from "@/lib/claude/types";

// POST /api/listings/generate — generate listing content for a staged item
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

    // Build input for generation
    const images = (item.item_images || [])
      .sort((a: { display_order: number }, b: { display_order: number }) => a.display_order - b.display_order)
      .map((img: { public_url: string }) => img.public_url);

    const input: ListingGenerationInput = {
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

    // Generate listing via Claude
    const result = await generateListing(input);

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[LISTINGS_GENERATE]", error);

    const message =
      error instanceof Error ? error.message : "Failed to generate listing";

    return NextResponse.json(
      { error: { message, code: "GENERATION_FAILED" } },
      { status: 500 },
    );
  }
}
