import Link from "next/link";
import { redirect } from "next/navigation";
import { ExpenseManager } from "@/components/features/expense-manager";
import { Badge } from "@/components/ui/badge";
import { GlassPanel } from "@/components/ui/glass-panel";
import { createClient } from "@/lib/db/supabase-server";
import { getFinancialOverview } from "@/lib/financial/queries";
import { formatDateValue } from "@/lib/utils/date";
import {
  DollarSign,
  PackageCheck,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null): string {
  return formatDateValue(value);
}

function formatPercent(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return `${value.toFixed(1)}%`;
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "sold":
    case "shipped":
      return "success" as const;
    default:
      return "default" as const;
  }
}

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <GlassPanel hover className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">{label}</span>
        <Icon className="h-5 w-5 text-accent/60" />
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        <p className="text-xs text-text-muted">{subtext}</p>
      </div>
    </GlassPanel>
  );
}

export default async function FinancialsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const financialOverview = await getFinancialOverview(supabase, user.id);
  const { snapshot, sourcePerformance, recentSales, expenseCategories, recentExpenses } =
    financialOverview;
  const hasFinancialData = snapshot.completed_sales > 0 || snapshot.total_expenses > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Financials</h1>
          <p className="text-text-muted">
            Track realized revenue, profitability, source ROI, and operating expenses.
          </p>
        </div>
        <Link
          href="/inventory"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-text-primary transition-all duration-200 hover:border-white/20 hover:bg-white/10"
        >
          Open Inventory
        </Link>
      </div>

      {!hasFinancialData && (
        <GlassPanel>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-accent/10 p-4">
              <DollarSign className="h-10 w-10 text-accent" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-text-primary">
              No realized sales or expenses yet
            </h2>
            <p className="mt-2 max-w-xl text-sm text-text-muted">
              This page is ready now, but it will become most valuable once you start marking completed sales and logging business expenses.
            </p>
          </div>
        </GlassPanel>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Completed Sales"
          value={String(snapshot.completed_sales)}
          subtext={
            snapshot.sold_this_month > 0
              ? `${snapshot.sold_this_month} completed this month`
              : "No completed sales yet this month"
          }
          icon={PackageCheck}
        />
        <MetricCard
          label="Gross Revenue"
          value={formatCurrency(snapshot.total_revenue)}
          subtext={`This month ${formatCurrency(snapshot.monthly_revenue)}`}
          icon={DollarSign}
        />
        <MetricCard
          label="Realized Profit"
          value={formatCurrency(snapshot.total_profit)}
          subtext={`After expenses ${formatCurrency(snapshot.net_after_expenses)}`}
          icon={TrendingUp}
        />
        <MetricCard
          label="Operating Expenses"
          value={formatCurrency(snapshot.total_expenses)}
          subtext={`This month ${formatCurrency(snapshot.monthly_expenses)}`}
          icon={Receipt}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Profit This Month"
          value={formatCurrency(snapshot.monthly_profit)}
          subtext={`Net after expenses ${formatCurrency(snapshot.monthly_net_after_expenses)}`}
          icon={Wallet}
        />
        <MetricCard
          label="Average Sale Price"
          value={formatCurrency(snapshot.average_sale_price)}
          subtext={
            snapshot.completed_sales > 0
              ? "Across completed sales"
              : "Awaiting your first completed sale"
          }
          icon={DollarSign}
        />
        <MetricCard
          label="Average Profit per Sale"
          value={formatCurrency(snapshot.average_profit_per_sale)}
          subtext="Only sales with complete profit data"
          icon={TrendingUp}
        />
        <MetricCard
          label="eBay Fees + Shipping"
          value={formatCurrency(snapshot.total_ebay_fees + snapshot.total_shipping_cost)}
          subtext={`COGS tracked ${formatCurrency(snapshot.total_cost_basis)}`}
          icon={Receipt}
        />
      </div>

      {snapshot.missing_profit_data > 0 && (
        <GlassPanel>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Profitability needs more data</p>
              <p className="text-sm text-text-muted">
                {snapshot.missing_profit_data} completed sale{snapshot.missing_profit_data === 1 ? " is" : "s are"} missing cost basis or sale details, so profit totals are conservative.
              </p>
            </div>
            <Badge variant="warning">Data quality</Badge>
          </div>
        </GlassPanel>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <GlassPanel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Source Performance</h2>
              <p className="text-sm text-text-muted">
                Revenue and profitability grouped by acquisition source.
              </p>
            </div>
          </div>

          {sourcePerformance.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-text-muted">
              No sold or shipped items yet, so source ROI is still empty.
            </div>
          ) : (
            <div className="space-y-3">
              {sourcePerformance.map((source) => (
                <div
                  key={`${source.name}-${source.type || "unknown"}`}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-text-primary">{source.name}</h3>
                        {source.type && <Badge variant="default">{source.type}</Badge>}
                      </div>
                      <p className="text-sm text-text-muted">
                        {source.items_sold} completed sale{source.items_sold === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[22rem]">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-text-muted">Revenue</p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {formatCurrency(source.revenue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-text-muted">Profit</p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {formatCurrency(source.profit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-text-muted">Avg Sale</p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {formatCurrency(source.average_sale_price)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-text-muted">ROI</p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {formatPercent(source.roi)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Expense Categories</h2>
            <p className="text-sm text-text-muted">
              Business expenses grouped by category.
            </p>
          </div>

          {expenseCategories.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-text-muted">
              No operating expenses have been logged yet.
            </div>
          ) : (
            <div className="space-y-3">
              {expenseCategories.map((expense) => (
                <div
                  key={expense.category}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div>
                    <p className="font-medium capitalize text-text-primary">
                      {expense.category.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm text-text-muted">
                      {expense.count} expense{expense.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-text-primary">
                    {formatCurrency(expense.total)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <GlassPanel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Recent Sales</h2>
              <p className="text-sm text-text-muted">
                Your latest completed book sales and realized profit.
              </p>
            </div>
          </div>

          {recentSales.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-text-muted">
              No completed sales yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={sale.href}
                          className="font-medium text-text-primary transition-colors hover:text-accent"
                        >
                          {sale.title}
                        </Link>
                        <Badge variant={statusBadgeVariant(sale.status)}>{sale.status}</Badge>
                      </div>
                      {sale.authors.length > 0 && (
                        <p className="text-sm text-text-muted">{sale.authors.join(", ")}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                        <span>Completed {formatDate(sale.completed_at)}</span>
                        {sale.source_name && <span>Source {sale.source_name}</span>}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[22rem]">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-text-muted">Sale</p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {sale.sale_price == null ? "—" : formatCurrency(sale.sale_price)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-text-muted">Net Profit</p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {sale.net_profit == null ? "—" : formatCurrency(sale.net_profit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-text-muted">Fees</p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {sale.ebay_fees == null ? "—" : formatCurrency(sale.ebay_fees)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-text-muted">Shipping</p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {sale.shipping_cost == null ? "—" : formatCurrency(sale.shipping_cost)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        <ExpenseManager initialExpenses={recentExpenses} />
      </div>
    </div>
  );
}
