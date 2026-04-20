import { NextRequest, NextResponse } from "next/server";
import { callN8nWebhook, N8nWebhookError } from "@/lib/n8n/webhook";
import type { BookMetadata } from "@/lib/books/google-books";

// POST /api/books/photo-lookup — copyright page photo lookup via n8n workflow
// Accepts multipart/form-data with an `image` file field,
// or JSON with { image: base64string, mimeType: string }
export async function POST(request: NextRequest) {
  try {
    let imageBase64: string;
    let mimeType: string;

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("image");

      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { error: { message: "Image file is required", code: "MISSING_IMAGE" } },
          { status: 400 },
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      imageBase64 = Buffer.from(arrayBuffer).toString("base64");
      mimeType = file.type || "image/jpeg";
    } else {
      const body = await request.json();

      if (!body.image || typeof body.image !== "string") {
        return NextResponse.json(
          { error: { message: "image (base64) is required", code: "MISSING_IMAGE" } },
          { status: 400 },
        );
      }

      imageBase64 = body.image;
      mimeType = body.mimeType || "image/jpeg";
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json(
        { error: { message: "Unsupported image type. Use JPEG, PNG, or WebP.", code: "INVALID_IMAGE_TYPE" } },
        { status: 400 },
      );
    }

    const result = await callN8nWebhook<{ data: Record<string, unknown> | null }>(
      "books/photo-lookup",
      { image: imageBase64, mimeType },
      { timeout: 60_000 },
    );

    if (!result.data) {
      return NextResponse.json(
        { error: { message: "Could not extract book information from this image", code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    const raw = result.data;
    const title = (raw.title as string) || "";
    if (!title) {
      return NextResponse.json(
        { error: { message: "Could not read book title from this image. Try a clearer photo.", code: "NO_TITLE" } },
        { status: 422 },
      );
    }

    const authorsRaw = raw.authors;
    const authors: string[] = Array.isArray(authorsRaw)
      ? authorsRaw
      : typeof authorsRaw === "string" && authorsRaw
        ? authorsRaw.split(/,\s*/)
        : [];

    const mapped: BookMetadata = {
      title,
      authors,
      isbn: (raw.isbn13 as string) || (raw.isbn as string) || "",
      publisher: (raw.publisher as string) || "",
      publishedDate: (raw.publishedDate as string) || "",
      pageCount: raw.pages ? Number(raw.pages) : undefined,
      description: (raw.edition as string) || "",
      categories: [],
      language: "",
      coverUrl: "",
      subtitle: raw.printingNumber ? `Printing #${raw.printingNumber}` : "",
    };

    return NextResponse.json({ data: mapped });
  } catch (error) {
    console.error("[BOOKS_PHOTO_LOOKUP]", error);

    if (error instanceof N8nWebhookError) {
      return NextResponse.json(
        { error: { message: `n8n workflow error: ${error.message}`, code: "N8N_ERROR" } },
        { status: error.statusCode >= 500 ? 502 : error.statusCode },
      );
    }

    return NextResponse.json(
      { error: { message: "Failed to process image", code: "LOOKUP_FAILED" } },
      { status: 500 },
    );
  }
}
