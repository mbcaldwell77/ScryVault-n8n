import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { isExpenseCategory } from "@/lib/financial/constants";

interface ExpenseRequestBody {
  amount?: number;
  category?: string;
  description?: string;
  expense_date?: string | null;
}

function toPositiveNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export async function GET() {
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

    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("user_id", user.id)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[EXPENSES_GET]", error);
    return NextResponse.json(
      { error: { message: "Failed to fetch expenses", code: "FETCH_FAILED" } },
      { status: 500 },
    );
  }
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

    const body = (await request.json()) as ExpenseRequestBody;
    const description = body.description?.trim() || "";
    const amount = toPositiveNumber(body.amount);

    if (!isExpenseCategory(body.category || "")) {
      return NextResponse.json(
        { error: { message: "Valid expense category is required", code: "MISSING_CATEGORY" } },
        { status: 400 },
      );
    }

    if (!description) {
      return NextResponse.json(
        { error: { message: "Expense description is required", code: "MISSING_DESCRIPTION" } },
        { status: 400 },
      );
    }

    if (amount == null) {
      return NextResponse.json(
        { error: { message: "Expense amount must be greater than zero", code: "INVALID_AMOUNT" } },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("expenses")
      .insert({
        user_id: user.id,
        category: body.category,
        description,
        amount,
        expense_date: body.expense_date || null,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("[EXPENSES_POST]", error);
    return NextResponse.json(
      { error: { message: "Failed to create expense", code: "CREATE_FAILED" } },
      { status: 500 },
    );
  }
}
