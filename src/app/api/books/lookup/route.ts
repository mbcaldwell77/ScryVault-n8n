import { NextRequest, NextResponse } from "next/server";
import { callN8nWebhook, N8nWebhookError } from "@/lib/n8n/webhook";
import type { BookMetadata } from "@/lib/books/google-books";

// GET /api/books/lookup?isbn=... — ISBN lookup via n8n workflow
export async function GET(request: NextRequest) {
  try {
    const isbn = request.nextUrl.searchParams.get("isbn");

    if (!isbn) {
      return NextResponse.json(
        { error: { message: "ISBN parameter is required", code: "MISSING_ISBN" } },
        { status: 400 },
      );
    }

    const cleanISBN = isbn.replace(/[-\s]/g, "");
    if (!/^\d{10}(\d{3})?$/.test(cleanISBN)) {
      return NextResponse.json(
        { error: { message: "Invalid ISBN format. Must be 10 or 13 digits.", code: "INVALID_ISBN" } },
        { status: 400 },
      );
    }

    // Delegate to n8n workflow: ISBN Lookup
    const result = await callN8nWebhook<{ data: BookMetadata | null }>(
      "books/lookup",
      { isbn: cleanISBN },
    );

    if (!result.data) {
      return NextResponse.json(
        { error: { message: "No book found for this ISBN", code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("[BOOKS_LOOKUP]", error);

    if (error instanceof N8nWebhookError) {
      return NextResponse.json(
        { error: { message: `n8n workflow error: ${error.message}`, code: "N8N_ERROR" } },
        { status: error.statusCode >= 500 ? 502 : error.statusCode },
      );
    }

    return NextResponse.json(
      { error: { message: "Failed to look up book", code: "LOOKUP_FAILED" } },
      { status: 500 },
    );
  }
}
