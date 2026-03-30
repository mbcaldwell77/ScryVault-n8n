import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";

// GET /api/inventory — list all staged items for the current user
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
                { status: 401 },
            );
        }

        // Since items are now split, we fetch inventory_items and join the catalog and sources.
        // We only want items in the "staged" status for this view.
        const { data, error } = await supabase
            .from("inventory_items")
            .select(`
        *,
        books_catalog(*),
        sources(name, type)
      `)
            .eq("user_id", user.id)
            .eq("status", "staged")
            .order("created_at", { ascending: false });

        if (error) throw error;

        return NextResponse.json({ data });
    } catch (error) {
        console.error("[INVENTORY_GET]", error);
        return NextResponse.json(
            { error: { message: "Failed to fetch staged items", code: "FETCH_FAILED" } },
            { status: 500 },
        );
    }
}

// POST /api/inventory — create a new staged inventory item
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

        const body = await request.json();

        if (!body.title) {
            return NextResponse.json(
                { error: { message: "Title is required", code: "MISSING_TITLE" } },
                { status: 400 },
            );
        }

        // Step 1: Handle the Book Catalog entry
        let catalogId = null;

        // Check if we already have this book in the catalog (by ISBN or exact title)
        if (body.isbn) {
            const { data: existingBook } = await supabase
                .from("books_catalog")
                .select("id")
                .eq("user_id", user.id)
                .eq("isbn", body.isbn)
                .maybeSingle();

            if (existingBook) {
                catalogId = existingBook.id;
            }
        }

        // If not found in catalog, create a new catalog entry
        if (!catalogId) {
            const { data: newBook, error: catalogError } = await supabase
                .from("books_catalog")
                .insert({
                    user_id: user.id,
                    isbn: body.isbn || null,
                    title: body.title,
                    subtitle: body.subtitle || null,
                    authors: body.authors || null,
                    publisher: body.publisher || null,
                    published_date: body.publishedDate || body.published_date || null,
                    page_count: body.pageCount || body.page_count || null,
                    description: body.description || null,
                    cover_url: body.coverUrl || body.cover_url || null,
                    categories: body.categories || null,
                    language: body.language || "en",
                })
                .select("id")
                .single();

            if (catalogError) throw catalogError;
            catalogId = newBook.id;
        }

        // Step 2: Create the Inventory Item (physical copy)
        const { data: inventoryItem, error: inventoryError } = await supabase
            .from("inventory_items")
            .insert({
                user_id: user.id,
                book_id: catalogId,
                condition: body.condition || "Good",
                condition_notes: body.condition_notes || null,
                storage_location: body.storage_location || null,
                source_id: body.source_id || null,
                acquired_date: body.acquired_date || new Date().toISOString().split("T")[0],
                cost_basis: body.cost_basis || null,
                status: "staged"
            })
            .select(`
        *,
        books_catalog(*),
        sources(name, type)
      `)
            .single();

        if (inventoryError) throw inventoryError;

        return NextResponse.json({ data: inventoryItem }, { status: 201 });
    } catch (error) {
        console.error("[INVENTORY_POST]", error);
        return NextResponse.json(
            { error: { message: "Failed to create staged item", code: "CREATE_FAILED" } },
            { status: 500 },
        );
    }
}
