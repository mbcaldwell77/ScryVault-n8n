import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { normalizeInventoryFinancialPatch } from "@/lib/financial/queries";
import type { InventoryItem } from "@/types/books";

// GET /api/inventory/[id] — get a single inventory item
export async function GET(
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

        const { data, error } = await supabase
            .from("inventory_items")
            .select(`
        *,
        books_catalog(*),
        sources(name, type),
        item_images(*)
      `)
            .eq("id", id)
            .eq("user_id", user.id)
            .single();

        if (error) {
            if (error.code === "PGRST116") {
                return NextResponse.json(
                    { error: { message: "Item not found", code: "NOT_FOUND" } },
                    { status: 404 },
                );
            }
            throw error;
        }

        return NextResponse.json({ data });
    } catch (error) {
        console.error("[INVENTORY_ITEM_GET]", error);
        return NextResponse.json(
            { error: { message: "Failed to fetch item", code: "FETCH_FAILED" } },
            { status: 500 },
        );
    }
}

// PATCH /api/inventory/[id] — update an inventory item
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

        const body = (await request.json()) as Record<string, unknown>;

        const { data: existingItem, error: existingItemError } = await supabase
            .from("inventory_items")
            .select("status, sold_at, shipped_at, sale_price, cost_basis, ebay_fees, shipping_cost, net_profit")
            .eq("id", id)
            .eq("user_id", user.id)
            .single();

        if (existingItemError) {
            if (existingItemError.code === "PGRST116") {
                return NextResponse.json(
                    { error: { message: "Item not found", code: "NOT_FOUND" } },
                    { status: 404 },
                );
            }

            throw existingItemError;
        }

        const normalizedBody = normalizeInventoryFinancialPatch(
            existingItem as Pick<
                InventoryItem,
                "status" | "sold_at" | "shipped_at" | "sale_price" | "cost_basis" | "ebay_fees" | "shipping_cost" | "net_profit"
            >,
            body,
        );

        const { data, error } = await supabase
            .from("inventory_items")
            .update(normalizedBody)
            .eq("id", id)
            .eq("user_id", user.id)
            .select(`
        *,
        books_catalog(*),
        sources(name, type)
      `)
            .single();

        if (error) {
            if (error.code === "PGRST116") {
                return NextResponse.json(
                    { error: { message: "Item not found", code: "NOT_FOUND" } },
                    { status: 404 },
                );
            }
            throw error;
        }

        return NextResponse.json({ data });
    } catch (error) {
        console.error("[INVENTORY_ITEM_PATCH]", error);
        return NextResponse.json(
            { error: { message: "Failed to update item", code: "UPDATE_FAILED" } },
            { status: 500 },
        );
    }
}

// DELETE /api/inventory/[id] — delete an inventory item
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

        const { error } = await supabase
            .from("inventory_items")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id);

        if (error) throw error;

        return NextResponse.json({ data: { success: true } });
    } catch (error) {
        console.error("[INVENTORY_ITEM_DELETE]", error);
        return NextResponse.json(
            { error: { message: "Failed to delete item", code: "DELETE_FAILED" } },
            { status: 500 },
        );
    }
}
