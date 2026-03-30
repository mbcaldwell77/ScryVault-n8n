import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { getEbayConfig } from "@/lib/ebay/config";
import { getBlockingSetupMessages, getEbaySetupStatus } from "@/lib/ebay/setup";
import { getValidEbayAccessToken } from "@/lib/ebay/tokens";
import {
  createOffer,
  createOrReplaceInventoryItem,
  publishOffer,
} from "@/lib/ebay/api";
import { buildRoadmapSku } from "@/lib/ebay/sku";

interface PublishRequestBody {
  inventory_item_id?: string;
  category_id?: string;
  sku_options?: {
    web_enabled?: boolean;
    is_first_edition?: boolean;
    format?: "HC" | "TPB" | "MMPB";
  };
}

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

    const setupStatus = await getEbaySetupStatus(supabase, user.id);
    if (!setupStatus.ready) {
      return NextResponse.json(
        {
          error: {
            message: "eBay setup is incomplete. Review the blocking setup checks in Settings before publishing.",
            code: "SETUP_INCOMPLETE",
            details: getBlockingSetupMessages(setupStatus),
          },
        },
        { status: 400 },
      );
    }

    const config = getEbayConfig();

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

    const accessToken = await getValidEbayAccessToken(supabase, user.id);
    const sku =
      item.sku ||
      buildRoadmapSku({
        title: book.title,
        subtitle: book.subtitle,
        description: book.description,
        format: body.sku_options?.format,
        webEnabled: Boolean(body.sku_options?.web_enabled),
        isFirstEdition: Boolean(body.sku_options?.is_first_edition),
        uniqueSuffix: item.id,
      });

    const categoryId = body.category_id || config.defaultCategoryId;

    await createOrReplaceInventoryItem(accessToken, sku, {
      title: item.listing_title,
      description: item.listing_description,
      condition: item.condition,
      imageUrls: images,
      quantity: item.quantity || 1,
      isbn: book.isbn,
      authors: book.authors,
      publisher: book.publisher,
      categories: book.categories,
    });

    const offer = await createOffer(accessToken, {
      sku,
      categoryId,
      listingDescription: item.listing_description,
      availableQuantity: item.quantity || 1,
      price: Number(item.listing_price),
    });

    const publishResult = await publishOffer(accessToken, offer.offerId);

    const listingId = publishResult.listingId || item.ebay_listing_id;
    const listingUrl =
      publishResult.listingUrl ||
      (listingId
        ? `https://www.ebay.com/itm/${listingId}`
        : null);

    const { data: updated, error: updateError } = await supabase
      .from("inventory_items")
      .update({
        sku,
        status: "listed",
        listed_at: new Date().toISOString(),
        ebay_listing_id: listingId,
        ebay_offer_id: offer.offerId,
        ebay_listing_url: listingUrl,
      })
      .eq("id", item.id)
      .eq("user_id", user.id)
      .select("*, books_catalog(*), item_images(*)")
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      data: {
        item: updated,
        ebay: {
          sku,
          offer_id: offer.offerId,
          listing_id: listingId,
          listing_url: listingUrl,
          category_id: categoryId,
        },
      },
    });
  } catch (error) {
    console.error("[EBAY_PUBLISH_POST]", error);
    const message = error instanceof Error ? error.message : "Failed to publish to eBay";

    return NextResponse.json(
      { error: { message, code: "PUBLISH_FAILED" } },
      { status: 500 },
    );
  }
}
