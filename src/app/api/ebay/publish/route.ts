import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { callN8nWebhook, N8nWebhookError } from "@/lib/n8n/webhook";

interface PublishRequestBody {
  inventory_item_id?: string;
  category_id?: string;
  sku_options?: {
    web_enabled?: boolean;
    is_first_edition?: boolean;
    format?: "HC" | "TPB" | "MMPB";
  };
}

interface N8nPublishResult {
  data: {
    item: Record<string, unknown>;
    ebay: {
      sku: string;
      offer_id: string;
      listing_id: string;
      listing_url: string | null;
      category_id: string;
    };
  };
}

// POST /api/ebay/publish — publish listing to eBay via n8n workflow
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

    const body = (await request.json()) as PublishRequestBody;
    if (!body.inventory_item_id) {
      return NextResponse.json(
        {
          error: {
            message: "inventory_item_id is required",
            code: "MISSING_ITEM_ID",
          },
        },
        { status: 400 },
      );
    }

    // Fetch the inventory item to validate it exists and belongs to this user
    const { data: item, error: itemError } = await supabase
      .from("inventory_items")
      .select("*, books_catalog(*), item_images(*)")
      .eq("id", body.inventory_item_id)
      .eq("user_id", user.id)
      .single();

    if (itemError || !item) {
      return NextResponse.json(
        { error: { message: "Item not found", code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    const book = item.books_catalog;
    if (!book) {
      return NextResponse.json(
        {
          error: {
            message: "Book metadata is missing for this item",
            code: "MISSING_BOOK_METADATA",
          },
        },
        { status: 400 },
      );
    }

    // Validate listing prerequisites before sending to n8n
    const missingFields: string[] = [];
    if (!item.listing_title) missingFields.push("listing_title");
    if (!item.listing_description) missingFields.push("listing_description");
    if (!item.listing_price) missingFields.push("listing_price");
    if (!item.condition) missingFields.push("condition");

    const images = (item.item_images || [])
      .sort((a: { display_order: number }, b: { display_order: number }) => a.display_order - b.display_order)
      .map((img: { public_url: string }) => img.public_url)
      .filter(Boolean);

    if (images.length === 0) {
      missingFields.push("images");
    }

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: {
            message: `Missing publish prerequisites: ${missingFields.join(", ")}`,
            code: "MISSING_PREREQUISITES",
            details: missingFields,
          },
        },
        { status: 400 },
      );
    }

    // Delegate to n8n workflow: Publish to eBay
    // n8n handles eBay OAuth, inventory item creation, offer creation, and publishing
    const result = await callN8nWebhook<N8nPublishResult>(
      "ebay/publish",
      {
        inventory_item_id: body.inventory_item_id,
        user_id: user.id,
        category_id: body.category_id,
        sku_options: body.sku_options,
        // Send the full item data so n8n doesn't need to re-query Supabase
        item: {
          id: item.id,
          sku: item.sku,
          listing_title: item.listing_title,
          listing_description: item.listing_description,
          listing_price: item.listing_price,
          condition: item.condition,
          quantity: item.quantity || 1,
          images,
          book: {
            isbn: book.isbn,
            title: book.title,
            subtitle: book.subtitle,
            description: book.description,
            authors: book.authors,
            publisher: book.publisher,
            categories: book.categories,
          },
        },
      },
      { timeout: 45_000 }, // eBay API calls can be slow
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[EBAY_PUBLISH_POST]", error);

    if (error instanceof N8nWebhookError) {
      return NextResponse.json(
        { error: { message: `n8n workflow error: ${error.message}`, code: "N8N_ERROR" } },
        { status: error.statusCode >= 500 ? 502 : error.statusCode },
      );
    }

    const message = error instanceof Error ? error.message : "Failed to publish to eBay";

    return NextResponse.json(
      { error: { message, code: "PUBLISH_FAILED" } },
      { status: 500 },
    );
  }
}
