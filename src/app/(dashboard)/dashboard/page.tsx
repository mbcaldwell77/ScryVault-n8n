import Link from "next/link";
import { redirect } from "next/navigation";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/db/supabase-server";
import { getFinancialOverview } from "@/lib/financial/queries";
import { getDashboardData } from "@/lib/inventory/queries";
import {
  Package,
  ScanBarcode,
  DollarSign,
  TrendingUp,
  Clock,
  ShoppingCart,
} from "lucide-react";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "inventory":
      return "accent" as const;
    case "listed":
      return "success" as const;
    case "sold":
    case "shipped":
      return "warning" as const;
    case "archived":
      return "default" as const;
    default:
      return "default" as const;
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: string;
}) {
  return (
    <GlassPanel hover className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">{label}</span>
        <Icon className="h-5 w-5 text-accent/60" />
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-text-primary">{value}</span>
        {trend && (
          <Badge variant="success" className="mb-1">
            {trend}
          </Badge>
        )}
      </div>
    </GlassPanel>
  );
}

function SnapshotMetric({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{subtext}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ metrics, recentActivity }, financialOverview] = await Promise.all([
    getDashboardData(supabase, user.id),
    getFinancialOverview(supabase, user.id),
  ]);

  const financialSnapshot = financialOverview.snapshot;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-text-muted">
          Welcome back. Here&apos;s your inventory overview.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Inventory"
          value={String(metrics.total_inventory)}
          icon={Package}
          trend={metrics.ready_to_list > 0 ? `${metrics.ready_to_list} ready` : undefined}
        />
        <StatCard
          label="Items Staged"
          value={String(metrics.staged_items)}
          icon={ScanBarcode}
        />
        <StatCard
          label="Active Listings"
          value={String(metrics.active_listings)}
          icon={ShoppingCart}
        />
        <StatCard
          label="Revenue This Month"
          value={formatCurrency(metrics.monthly_revenue)}
          icon={DollarSign}
          trend={metrics.sold_this_month > 0 ? `${metrics.sold_this_month} sold` : undefined}
        />
      </div>

      <GlassPanel>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Financial Snapshot</h2>
            <p className="text-sm text-text-muted">
              Realized sales, profit, and operating expenses from the shared financial layer.
            </p>
          </div>
          <Link
            href="/financials"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-text-primary transition-all duration-200 hover:border-white/20 hover:bg-white/10"
          >
            Open Financials
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SnapshotMetric
            label="Revenue This Month"
            value={formatCurrency(financialSnapshot.monthly_revenue)}
            subtext={
              financialSnapshot.sold_this_month > 0
                ? `${financialSnapshot.sold_this_month} completed sales`
                : "No completed sales yet"
            }
          />
          <SnapshotMetric
            label="Profit This Month"
            value={formatCurrency(financialSnapshot.monthly_profit)}
            subtext={`Expenses ${formatCurrency(financialSnapshot.monthly_expenses)}`}
          />
          <SnapshotMetric
            label="Realized Profit"
            value={formatCurrency(financialSnapshot.total_profit)}
            subtext={`After expenses ${formatCurrency(financialSnapshot.net_after_expenses)}`}
          />
          <SnapshotMetric
            label="Average Sale Price"
            value={formatCurrency(financialSnapshot.average_sale_price)}
            subtext={
              financialSnapshot.completed_sales > 0
                ? `${financialSnapshot.completed_sales} completed sales`
                : "Awaiting your first sale"
            }
          />
        </div>

        {financialSnapshot.missing_profit_data > 0 && (
          <p className="mt-4 text-xs text-warning">
            Profit totals are conservative because {financialSnapshot.missing_profit_data} completed sale{financialSnapshot.missing_profit_data === 1 ? " is" : "s are"} still missing cost basis or sale details.
          </p>
        )}
      </GlassPanel>

      {/* Quick Actions + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassPanel>
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            Quick Actions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/staging" className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:border-accent/30 hover:bg-accent/5">
              <div className="rounded-lg bg-accent/10 p-2">
                <ScanBarcode className="h-5 w-5 text-accent" />
              </div>
              <div>
                <span className="text-sm font-medium text-text-primary">
                  Scan Book
                </span>
                <p className="text-xs text-text-muted">
                  Add a new book to staging
                </p>
              </div>
            </Link>
            <Link href="/inventory" className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:border-accent/30 hover:bg-accent/5">
              <div className="rounded-lg bg-accent/10 p-2">
                <Package className="h-5 w-5 text-accent" />
              </div>
              <div>
                <span className="text-sm font-medium text-text-primary">
                  View Inventory
                </span>
                <p className="text-xs text-text-muted">
                  Browse all your books
                </p>
              </div>
            </Link>
            <Link href="/financials" className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:border-accent/30 hover:bg-accent/5">
              <div className="rounded-lg bg-accent/10 p-2">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <div>
                <span className="text-sm font-medium text-text-primary">
                  Financials
                </span>
                <p className="text-xs text-text-muted">
                  View profit & loss
                </p>
              </div>
            </Link>
            <Link href="/settings" className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:border-accent/30 hover:bg-accent/5">
              <div className="rounded-lg bg-accent/10 p-2">
                <Clock className="h-5 w-5 text-accent" />
              </div>
              <div>
                <span className="text-sm font-medium text-text-primary">
                  Seller Settings
                </span>
                <p className="text-xs text-text-muted">
                  Review setup and publishing readiness
                </p>
              </div>
            </Link>
          </div>
        </GlassPanel>

        <GlassPanel>
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            Recent Activity
          </h2>
          {recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-white/5 p-4">
                <Clock className="h-8 w-8 text-text-muted/50" />
              </div>
              <p className="mt-4 text-sm text-text-muted">
                No activity yet. Scan your first book to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={activity.href}
                          className="font-medium text-text-primary transition-colors hover:text-accent"
                        >
                          {activity.title}
                        </Link>
                        <Badge variant={statusBadgeVariant(activity.status)}>
                          {activity.status}
                        </Badge>
                      </div>
                      {activity.authors.length > 0 && (
                        <p className="text-sm text-text-muted">
                          {activity.authors.join(", ")}
                        </p>
                      )}
                      <p className="text-sm text-text-muted">{activity.summary}</p>
                    </div>
                    <div className="flex flex-col items-start gap-2 text-xs text-text-muted sm:items-end">
                      <span>{formatDateTime(activity.timestamp)}</span>
                      {activity.ebay_listing_url && (
                        <a
                          href={activity.ebay_listing_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-accent transition-colors hover:text-accent-dark"
                        >
                          View eBay
                          <TrendingUp className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
