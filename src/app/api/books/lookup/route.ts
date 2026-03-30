import { NextRequest, NextResponse } from "next/server";
import { lookupByISBN } from "@/lib/books/google-books";

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

    const book = await lookupByISBN(cleanISBN);

    if (!book) {
      return NextResponse.json(
        { error: { message: "No book found for this ISBN", code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: book });
  } catch (error) {
    console.error("[BOOKS_LOOKUP]", error);
    return NextResponse.json(
      { error: { message: "Failed to look up book", code: "LOOKUP_FAILED" } },
      { status: 500 },
    );
  }
}
