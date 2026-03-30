"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/financial/constants";
import { formatDateValue, isFutureDateValue } from "@/lib/utils/date";
import type { FinancialExpenseItem } from "@/lib/financial/queries";
import { Plus, Trash2 } from "lucide-react";

interface ExpenseManagerProps {
  initialExpenses: FinancialExpenseItem[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function ExpenseManager({ initialExpenses }: ExpenseManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [category, setCategory] = useState<ExpenseCategory>(EXPENSE_CATEGORIES[0].value);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const futureDateSelected = isFutureDateValue(expenseDate);

  async function handleCreateExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const numericAmount = Number(amount);

    if (!description.trim()) {
      setError("Expense description is required.");
      toast({
        title: "Expense is missing a description",
        description: "Add a short description before saving the expense.",
        variant: "error",
      });
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Expense amount must be greater than zero.");
      toast({
        title: "Expense amount is invalid",
        description: "Enter an amount greater than zero.",
        variant: "error",
      });
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          description: description.trim(),
          amount: numericAmount,
          expense_date: expenseDate || null,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to create expense");
      }

      setDescription("");
      setAmount("");
      setExpenseDate("");
      setSuccess("Expense added.");
      toast({
        title: futureDateSelected ? "Scheduled expense added" : "Expense added",
        description: futureDateSelected
          ? "Future-dated expenses stay visible, but they will not affect realized totals until that date arrives."
          : "The expense was saved and added to your financial history.",
        variant: futureDateSelected ? "warning" : "success",
      });
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create expense";
      setError(message);
      toast({
        title: "Expense save failed",
        description: message,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteExpense(expenseId: string) {
    setError("");
    setSuccess("");
    setDeletingId(expenseId);

    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to delete expense");
      }

      setSuccess("Expense removed.");
      toast({
        title: "Expense removed",
        description: "The expense was deleted.",
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete expense";
      setError(message);
      toast({
        title: "Expense delete failed",
        description: message,
        variant: "error",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <GlassPanel>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary">Expense Manager</h2>
        <p className="text-sm text-text-muted">
          Log operating costs here so the financial reporting stays accurate.
        </p>
      </div>

      <form onSubmit={handleCreateExpense} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="expense-category" className="block text-sm font-medium text-text-muted">
              Category
            </label>
            <select
              id="expense-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary transition-colors duration-200 hover:border-white/20 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            >
              {EXPENSE_CATEGORIES.map((expenseCategory) => (
                <option key={expenseCategory.value} value={expenseCategory.value}>
                  {expenseCategory.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Expense Date"
            type="date"
            value={expenseDate}
            onChange={(event) => setExpenseDate(event.target.value)}
          />
        </div>

        {futureDateSelected && (
          <div className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
            This is a future-dated expense. It will stay visible here, but it will not count toward realized totals until that date arrives.
          </div>
        )}

        <Input
          label="Description"
          placeholder="e.g., Shipping labels, bubble mailers, subscription"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <Input
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />

        {error && <p className="text-sm text-danger">{error}</p>}
        {success && <p className="text-sm text-accent">{success}</p>}

        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={Boolean(deletingId)}>
            <Plus className="h-4 w-4" />
            Add Expense
          </Button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Recent Expenses
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Latest operating expenses recorded for the business.
          </p>
        </div>

        {initialExpenses.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-text-muted">
            No expenses logged yet.
          </div>
        ) : (
          <div className="space-y-3">
            {initialExpenses.map((expense) => (
              <div
                key={expense.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-text-primary">{expense.description}</p>
                    <Badge variant="default" className="capitalize">
                      {expense.category.replace(/_/g, " ")}
                    </Badge>
                    {isFutureDateValue(expense.expense_date || "") && (
                      <Badge variant="warning">Scheduled</Badge>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">{formatDateValue(expense.expense_date)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-text-primary">
                    {formatCurrency(expense.amount)}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteExpense(expense.id)}
                    disabled={saving || deletingId === expense.id}
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
