import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryItem } from "@/types/books";
import { isFutureDateValue } from "@/lib/utils/date";

type InventoryStatus = InventoryItem["status"];

type FinancialValueLike = Pick<
  InventoryItem,
  "sale_price" | "cost_basis" | "ebay_fees" | "shipping_cost" | "net_profit"
>;

type SaleDateLike = Pick<InventoryItem, "status" | "sold_at" | "shipped_at"> & {
  updated_at?: string | null;
};

type InventoryFinancialBase = Pick<
  InventoryItem,
  | "status"
  | "sold_at"
  | "shipped_at"
  | "sale_price"
  | "cost_basis"
  | "ebay_fees"
  | "shipping_cost"
  | "net_profit"
>;

interface InventoryFinancialPatchInput extends Record<string, unknown> {
  status?: InventoryStatus;
  sold_at?: string | null;
  shipped_at?: string | null;
  sale_price?: number | null;
  cost_basis?: number | null;
  ebay_fees?: number | null;
  shipping_cost?: number | null;
  net_profit?: number | null;
}

interface JoinedSource {
  name: string | null;
  type: string | null;
}

interface JoinedBook {
  title: string | null;
  authors: string[] | null;
}

interface FinancialInventoryRow {
  id: string;
  status: InventoryStatus;
  updated_at: string;
  sold_at: string | null;
  shipped_at: string | null;
  sale_price: number | null;
  cost_basis: number | null;
  ebay_fees: number | null;
  shipping_cost: number | null;
  net_profit: number | null;
  sources: JoinedSource | JoinedSource[] | null;
  books_catalog: JoinedBook | JoinedBook[] | null;
}

interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  amount: number | null;
  expense_date: string | null;
  created_at: string;
}

export interface FinancialSnapshot {
  completed_sales: number;
  sold_this_month: number;
  total_revenue: number;
  total_profit: number;
  total_expenses: number;
  monthly_revenue: number;
  monthly_profit: number;
  monthly_expenses: number;
  total_cost_basis: number;
  total_ebay_fees: number;
  total_shipping_cost: number;
  average_sale_price: number;
  average_profit_per_sale: number;
  missing_profit_data: number;
  net_after_expenses: number;
  monthly_net_after_expenses: number;
}

export interface FinancialSourcePerformance {
  name: string;
  type: string | null;
  items_sold: number;
  revenue: number;
  profit: number;
  invested: number;
  average_sale_price: number;
  roi: number | null;
}

export interface FinancialSaleItem {
  id: string;
  title: string;
  authors: string[];
  status: InventoryStatus;
  completed_at: string | null;
  source_name: string | null;
  sale_price: number | null;
  cost_basis: number | null;
  ebay_fees: number | null;
  shipping_cost: number | null;
  net_profit: number | null;
  href: string;
}

export interface FinancialExpenseCategory {
  category: string;
  total: number;
  count: number;
}

export interface FinancialExpenseItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string | null;
}

export interface FinancialOverview {
  snapshot: FinancialSnapshot;
  sourcePerformance: FinancialSourcePerformance[];
  recentSales: FinancialSaleItem[];
  expenseCategories: FinancialExpenseCategory[];
  recentExpenses: FinancialExpenseItem[];
}

const FINANCIAL_INVENTORY_SELECT = `
  id,
  status,
  updated_at,
  sold_at,
  shipped_at,
  sale_price,
  cost_basis,
  ebay_fees,
  shipping_cost,
  net_profit,
  sources(name, type),
  books_catalog(title, authors)
`;

const EXPENSE_SELECT = `
  id,
  category,
  description,
  amount,
  expense_date,
  created_at
`;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function hasOwn(target: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getSingleJoin<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value;
}

function normalizeInventoryRows(rows: unknown[]): FinancialInventoryRow[] {
  return rows as unknown as FinancialInventoryRow[];
}

function normalizeExpenseRows(rows: unknown[]): ExpenseRow[] {
  return rows as unknown as ExpenseRow[];
}

function getExpenseDate(expense: ExpenseRow): string | null {
  return expense.expense_date || expense.created_at || null;
}

function isFutureExpense(expense: ExpenseRow): boolean {
  return isFutureDateValue(getExpenseDate(expense));
}

export function isRealizedSale(item: Pick<SaleDateLike, "status" | "sold_at" | "shipped_at">): boolean {
  return item.status === "sold" || item.status === "shipped";
}

export function getRealizedSaleDate(item: SaleDateLike): string | null {
  if (!isRealizedSale(item)) {
    return null;
  }

  return item.sold_at || item.shipped_at || item.updated_at || null;
}

export function calculateInventoryItemNetProfit(item: FinancialValueLike): number | null {
  const storedNetProfit = toNumber(item.net_profit);

  if (storedNetProfit != null) {
    return roundCurrency(storedNetProfit);
  }

  const salePrice = toNumber(item.sale_price);
  const costBasis = toNumber(item.cost_basis);

  if (salePrice == null || costBasis == null) {
    return null;
  }

  const ebayFees = toNumber(item.ebay_fees) ?? 0;
  const shippingCost = toNumber(item.shipping_cost) ?? 0;

  return roundCurrency(salePrice - costBasis - ebayFees - shippingCost);
}

export function normalizeInventoryFinancialPatch(
  existing: InventoryFinancialBase,
  patch: InventoryFinancialPatchInput,
): InventoryFinancialPatchInput {
  const normalizedPatch: InventoryFinancialPatchInput = { ...patch };
  const nextStatus =
    typeof normalizedPatch.status === "string"
      ? (normalizedPatch.status as InventoryStatus)
      : existing.status;

  const salePrice = hasOwn(normalizedPatch, "sale_price")
    ? toNumber(normalizedPatch.sale_price)
    : toNumber(existing.sale_price);
  const costBasis = hasOwn(normalizedPatch, "cost_basis")
    ? toNumber(normalizedPatch.cost_basis)
    : toNumber(existing.cost_basis);
  const ebayFees = hasOwn(normalizedPatch, "ebay_fees")
    ? toNumber(normalizedPatch.ebay_fees)
    : toNumber(existing.ebay_fees);
  const shippingCost = hasOwn(normalizedPatch, "shipping_cost")
    ? toNumber(normalizedPatch.shipping_cost)
    : toNumber(existing.shipping_cost);

  normalizedPatch.net_profit = calculateInventoryItemNetProfit({
    sale_price: salePrice,
    cost_basis: costBasis,
    ebay_fees: ebayFees,
    shipping_cost: shippingCost,
    net_profit: null,
  });

  const nowIso = new Date().toISOString();

  if ((nextStatus === "sold" || nextStatus === "shipped") && !hasOwn(normalizedPatch, "sold_at") && !existing.sold_at) {
    normalizedPatch.sold_at = nowIso;
  }

  if (nextStatus === "shipped" && !hasOwn(normalizedPatch, "shipped_at") && !existing.shipped_at) {
    normalizedPatch.shipped_at = nowIso;
  }

  return normalizedPatch;
}

function buildFinancialSnapshot(
  sales: FinancialInventoryRow[],
  expenses: ExpenseRow[],
): FinancialSnapshot {
  const monthStart = getMonthStart();
  let completedSales = 0;
  let soldThisMonth = 0;
  let totalRevenue = 0;
  let totalProfit = 0;
  let totalExpenses = 0;
  let monthlyRevenue = 0;
  let monthlyProfit = 0;
  let monthlyExpenses = 0;
  let totalCostBasis = 0;
  let totalEbayFees = 0;
  let totalShippingCost = 0;
  let salesWithPrice = 0;
  let salesWithProfit = 0;
  let missingProfitData = 0;

  for (const sale of sales) {
    if (!isRealizedSale(sale)) {
      continue;
    }

    completedSales += 1;

    const completedAt = getRealizedSaleDate(sale);
    const salePrice = toNumber(sale.sale_price);
    const costBasis = toNumber(sale.cost_basis);
    const ebayFees = toNumber(sale.ebay_fees) ?? 0;
    const shippingCost = toNumber(sale.shipping_cost) ?? 0;
    const netProfit = calculateInventoryItemNetProfit(sale);

    if (salePrice != null) {
      totalRevenue += salePrice;
      salesWithPrice += 1;
    }

    if (costBasis != null) {
      totalCostBasis += costBasis;
    }

    totalEbayFees += ebayFees;
    totalShippingCost += shippingCost;

    if (netProfit != null) {
      totalProfit += netProfit;
      salesWithProfit += 1;
    } else {
      missingProfitData += 1;
    }

    if (completedAt && new Date(completedAt) >= monthStart) {
      soldThisMonth += 1;
      monthlyRevenue += salePrice ?? 0;
      monthlyProfit += netProfit ?? 0;
    }
  }

  for (const expense of expenses) {
    if (isFutureExpense(expense)) {
      continue;
    }

    const amount = toNumber(expense.amount) ?? 0;
    const expenseDate = getExpenseDate(expense);

    totalExpenses += amount;

    if (expenseDate && new Date(expenseDate) >= monthStart) {
      monthlyExpenses += amount;
    }
  }

  return {
    completed_sales: completedSales,
    sold_this_month: soldThisMonth,
    total_revenue: roundCurrency(totalRevenue),
    total_profit: roundCurrency(totalProfit),
    total_expenses: roundCurrency(totalExpenses),
    monthly_revenue: roundCurrency(monthlyRevenue),
    monthly_profit: roundCurrency(monthlyProfit),
    monthly_expenses: roundCurrency(monthlyExpenses),
    total_cost_basis: roundCurrency(totalCostBasis),
    total_ebay_fees: roundCurrency(totalEbayFees),
    total_shipping_cost: roundCurrency(totalShippingCost),
    average_sale_price: roundCurrency(salesWithPrice > 0 ? totalRevenue / salesWithPrice : 0),
    average_profit_per_sale: roundCurrency(salesWithProfit > 0 ? totalProfit / salesWithProfit : 0),
    missing_profit_data: missingProfitData,
    net_after_expenses: roundCurrency(totalProfit - totalExpenses),
    monthly_net_after_expenses: roundCurrency(monthlyProfit - monthlyExpenses),
  };
}

function buildSourcePerformance(sales: FinancialInventoryRow[]): FinancialSourcePerformance[] {
  const groups = new Map<
    string,
    {
      name: string;
      type: string | null;
      items_sold: number;
      revenue: number;
      profit: number;
      invested: number;
      sales_with_price: number;
    }
  >();

  for (const sale of sales) {
    if (!isRealizedSale(sale)) {
      continue;
    }

    const source = getSingleJoin(sale.sources);
    const name = source?.name || "Unknown source";
    const key = `${source?.name || "unknown"}:${source?.type || "unknown"}`;
    const existing = groups.get(key) || {
      name,
      type: source?.type || null,
      items_sold: 0,
      revenue: 0,
      profit: 0,
      invested: 0,
      sales_with_price: 0,
    };

    const salePrice = toNumber(sale.sale_price);
    const costBasis = toNumber(sale.cost_basis);
    const netProfit = calculateInventoryItemNetProfit(sale);

    existing.items_sold += 1;

    if (salePrice != null) {
      existing.revenue += salePrice;
      existing.sales_with_price += 1;
    }

    if (costBasis != null) {
      existing.invested += costBasis;
    }

    if (netProfit != null) {
      existing.profit += netProfit;
    }

    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map((group) => ({
      name: group.name,
      type: group.type,
      items_sold: group.items_sold,
      revenue: roundCurrency(group.revenue),
      profit: roundCurrency(group.profit),
      invested: roundCurrency(group.invested),
      average_sale_price: roundCurrency(
        group.sales_with_price > 0 ? group.revenue / group.sales_with_price : 0,
      ),
      roi:
        group.invested > 0
          ? roundCurrency((group.profit / group.invested) * 100)
          : null,
    }))
    .sort((a, b) => b.profit - a.profit || b.revenue - a.revenue || a.name.localeCompare(b.name));
}

function buildRecentSales(sales: FinancialInventoryRow[]): FinancialSaleItem[] {
  return sales
    .filter((sale) => isRealizedSale(sale))
    .sort((a, b) => {
      const aTime = new Date(getRealizedSaleDate(a) || a.updated_at).getTime();
      const bTime = new Date(getRealizedSaleDate(b) || b.updated_at).getTime();
      return bTime - aTime;
    })
    .slice(0, 8)
    .map((sale) => {
      const source = getSingleJoin(sale.sources);
      const book = getSingleJoin(sale.books_catalog);

      return {
        id: sale.id,
        title: book?.title || "Untitled book",
        authors: book?.authors || [],
        status: sale.status,
        completed_at: getRealizedSaleDate(sale),
        source_name: source?.name || null,
        sale_price: toNumber(sale.sale_price),
        cost_basis: toNumber(sale.cost_basis),
        ebay_fees: toNumber(sale.ebay_fees),
        shipping_cost: toNumber(sale.shipping_cost),
        net_profit: calculateInventoryItemNetProfit(sale),
        href: `/staging/${sale.id}`,
      };
    });
}

function buildExpenseCategories(expenses: ExpenseRow[]): FinancialExpenseCategory[] {
  const groups = new Map<string, FinancialExpenseCategory>();

  for (const expense of expenses) {
    if (isFutureExpense(expense)) {
      continue;
    }

    const existing = groups.get(expense.category) || {
      category: expense.category,
      total: 0,
      count: 0,
    };

    existing.total += toNumber(expense.amount) ?? 0;
    existing.count += 1;
    groups.set(expense.category, existing);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      total: roundCurrency(group.total),
    }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
}

function buildRecentExpenses(expenses: ExpenseRow[]): FinancialExpenseItem[] {
  return expenses.slice(0, 8).map((expense) => ({
    id: expense.id,
    category: expense.category,
    description: expense.description,
    amount: roundCurrency(toNumber(expense.amount) ?? 0),
    expense_date: getExpenseDate(expense),
  }));
}

export async function getFinancialOverview(
  supabase: SupabaseClient,
  userId: string,
): Promise<FinancialOverview> {
  const [salesResult, expensesResult] = await Promise.all([
    supabase
      .from("inventory_items")
      .select(FINANCIAL_INVENTORY_SELECT)
      .eq("user_id", userId)
      .in("status", ["sold", "shipped"])
      .order("updated_at", { ascending: false }),
    supabase
      .from("expenses")
      .select(EXPENSE_SELECT)
      .eq("user_id", userId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (salesResult.error) {
    throw salesResult.error;
  }

  if (expensesResult.error) {
    throw expensesResult.error;
  }

  const sales = normalizeInventoryRows(salesResult.data || []);
  const expenses = normalizeExpenseRows(expensesResult.data || []);

  return {
    snapshot: buildFinancialSnapshot(sales, expenses),
    sourcePerformance: buildSourcePerformance(sales),
    recentSales: buildRecentSales(sales),
    expenseCategories: buildExpenseCategories(expenses),
    recentExpenses: buildRecentExpenses(expenses),
  };
}
