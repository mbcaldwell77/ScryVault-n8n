import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { deleteBookImage } from "@/lib/storage/book-images";

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
        { status: 401 },
      );
    }

    const body = await request.json();

    if (body?.is_primary !== true) {
      return NextResponse.json(
        { error: { message: "Unsupported image update", code: "INVALID_REQUEST" } },
        { status: 400 },
      );
    }

    const { data: image, error: fetchError } = await supabase
      .from("item_images")
      .select("id, inventory_item_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !image) {
      return NextResponse.json(
        { error: { message: "Image not found", code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    const { error: clearError } = await supabase
      .from("item_images")
      .update({ is_primary: false })
      .eq("inventory_item_id", image.inventory_item_id)
      .eq("user_id", user.id);

    if (clearError) {
      throw clearError;
    }

    const { data: updatedImage, error: updateError } = await supabase
      .from("item_images")
      .update({ is_primary: true })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ data: updatedImage });
  } catch (error) {
    console.error("[IMAGE_UPDATE]", error);
    const message = getErrorMessage(error) || "Failed to update image";
    return NextResponse.json(
      { error: { message, code: "UPDATE_FAILED" } },
      { status: 500 },
    );
  }
}

// DELETE /api/images/[id] — delete an image
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
        { status: 401 },
      );
    }

    // Get image record to find storage path
    const selectImage = (columns: string) =>
      supabase
        .from("item_images")
        .select(columns)
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

    type ImageRecord = {
      id: string;
      inventory_item_id: string;
      is_primary: boolean;
      public_url: string | null;
      storage_path: string | null;
    };

    let image: ImageRecord | null = null;
    let fetchError: unknown = null;

    const imageWithStoragePathResult = await selectImage(
      "id, inventory_item_id, is_primary, storage_path, public_url",
    );

    image = imageWithStoragePathResult.data as ImageRecord | null;
    fetchError = imageWithStoragePathResult.error;

    if (fetchError && isMissingStoragePathColumnError(fetchError)) {
      const fallbackImageResult = await selectImage(
        "id, inventory_item_id, is_primary, public_url",
      );
      const fallbackImage = fallbackImageResult.data as
        | Omit<ImageRecord, "storage_path">
        | null;

      image = fallbackImage
        ? {
          ...fallbackImage,
          storage_path: null,
        }
        : null;
      fetchError = fallbackImageResult.error;
    }

    if (fetchError || !image) {
      return NextResponse.json(
        { error: { message: "Image not found", code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    await deleteBookImage(image);

    // Delete database record
    const { error: deleteError } = await supabase
      .from("item_images")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) throw deleteError;

    let nextPrimaryImageId: string | null = null;

    if (image.is_primary) {
      const { data: replacementImage, error: replacementError } = await supabase
        .from("item_images")
        .select("id")
        .eq("inventory_item_id", image.inventory_item_id)
        .eq("user_id", user.id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!replacementError && replacementImage) {
        const { error: promoteError } = await supabase
          .from("item_images")
          .update({ is_primary: true })
          .eq("id", replacementImage.id)
          .eq("user_id", user.id);

        if (!promoteError) {
          nextPrimaryImageId = replacementImage.id;
        }
      }
    }

    return NextResponse.json({ data: { success: true, next_primary_image_id: nextPrimaryImageId } });
  } catch (error) {
    console.error("[IMAGE_DELETE]", error);
    const message = getErrorMessage(error) || "Failed to delete image";
    return NextResponse.json(
      { error: { message, code: "DELETE_FAILED" } },
      { status: 500 },
    );
  }
}
