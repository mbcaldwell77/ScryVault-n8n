import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { deleteBookImage, uploadBookImage } from "@/lib/storage/book-images";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "";
}

function isMissingStoragePathColumnError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("storage_path") &&
    (message.includes("column") ||
      message.includes("schema cache") ||
      message.includes("does not exist"))
  );
}

// POST /api/images/upload — upload an image for an inventory item
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const inventoryItemId = formData.get("inventory_item_id") as string | null;
    const displayOrder = parseInt(formData.get("display_order") as string || "0", 10);
    const isPrimary = formData.get("is_primary") === "true";

    if (!file) {
      return NextResponse.json(
        { error: { message: "No file provided", code: "MISSING_FILE" } },
        { status: 400 },
      );
    }

    if (!inventoryItemId) {
      return NextResponse.json(
        { error: { message: "inventory_item_id is required", code: "MISSING_ITEM_ID" } },
        { status: 400 },
      );
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: { message: "File must be JPEG, PNG, or WebP", code: "INVALID_FILE_TYPE" } },
        { status: 400 },
      );
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: { message: "File must be under 5MB", code: "FILE_TOO_LARGE" } },
        { status: 400 },
      );
    }

    const { data: inventoryItem, error: inventoryError } = await supabase
      .from("inventory_items")
      .select("id")
      .eq("id", inventoryItemId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (inventoryError) {
      throw inventoryError;
    }

    if (!inventoryItem) {
      return NextResponse.json(
        { error: { message: "Inventory item not found", code: "ITEM_NOT_FOUND" } },
        { status: 404 },
      );
    }

    const uploadedImage = await uploadBookImage({
      userId: user.id,
      inventoryItemId,
      file,
    });

    // If this is the primary image, unset any existing primary
    if (isPrimary) {
      await supabase
        .from("item_images")
        .update({ is_primary: false })
        .eq("inventory_item_id", inventoryItemId)
        .eq("user_id", user.id);
    }

    // Create image record in database
    const imageRecord = {
      user_id: user.id,
      inventory_item_id: inventoryItemId,
      public_url: uploadedImage.publicUrl,
      display_order: displayOrder,
      is_primary: isPrimary,
    };

    const insertImage = (record: Record<string, unknown>) =>
      supabase.from("item_images").insert(record).select().single();

    let insertResult = await insertImage({
      ...imageRecord,
      storage_path: uploadedImage.storagePath,
    });

    if (insertResult.error && isMissingStoragePathColumnError(insertResult.error)) {
      insertResult = await insertImage(imageRecord);
    }

    if (insertResult.error) {
      await deleteBookImage({ storage_path: uploadedImage.storagePath }).catch(
        () => undefined,
      );
      throw insertResult.error;
    }

    return NextResponse.json({ data: insertResult.data }, { status: 201 });
  } catch (error) {
    console.error("[IMAGE_UPLOAD]", error);
    const message = getErrorMessage(error) || "Failed to upload image";
    return NextResponse.json(
      { error: { message, code: "UPLOAD_FAILED" } },
      { status: 500 },
    );
  }
}
