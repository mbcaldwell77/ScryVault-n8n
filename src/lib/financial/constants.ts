export const EXPENSE_CATEGORIES = [
  { value: "supplies", label: "Supplies" },
  { value: "shipping_materials", label: "Shipping Materials" },
  { value: "ebay_fees", label: "eBay Fees" },
  { value: "software", label: "Software" },
  { value: "other", label: "Other" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return EXPENSE_CATEGORIES.some((category) => category.value === value);
}
