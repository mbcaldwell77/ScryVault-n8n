import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { BookCoverImage } from "@/components/ui/book-cover-image";
import { GlassPanel } from "@/components/ui/glass-panel";
import { createClient } from "@/lib/db/supabase-server";
import { calculateInventoryItemNetProfit } from "@/lib/financial/queries";
import {
  filterInventoryItems,
  getPrimaryImageUrl,
  listOperationalInventoryItems,
  summarizeInventoryItems,
} from "@/lib/inventory/queries";
import { formatDateValue } from "@/lib/utils/date";
import type { InventoryItem } from "@/types/books";
import {
  Box,
  ExternalLink,
  Package,
  PackageCheck,
  Search,
  ShoppingCart,
} from "lucide-react";

const STATUS_FILTERS = ["all", "inventory", "listed", "sold", "shipped", "archived"] as const;

type InventoryStatusFilter = (typeof STATUS_FILTERS)[number];

function getValue(
  value: string | string[] | undefined,
): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function isInventoryStatusFilter(value: string): value is InventoryStatusFilter {
  return STATUS_FILTERS.includes(value as InventoryStatusFilter);
}

function formatCurrency(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatDate(value: string | null): string {
  return formatDateValue(value);
}

function statusBadgeVariant(status: InventoryItem["status"]) {
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

function conditionBadgeVariant(condition: InventoryItem["condition"]) {
  switch (condition) {
    case "Brand New":
    case "Like New":
      return "success" as const;
    case "Very Good":
    case "Good":
      return "accent" as const;
    default:
      return "warning" as const;
  }
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string | string[];
    status?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const query = getValue(params.query);
  const rawStatus = getValue(params.status);
  const status = isInventoryStatusFilter(rawStatus) ? rawStatus : "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const items = await listOperationalInventoryItems(supabase, user.id);
  const summary = summarizeInventoryItems(items);
  const filteredItems = filterInventoryItems(items, { query, status });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Inventory</h1>
          <p className="text-text-muted">
            Manage your complete book inventory and eBay listings.
          </p>
        </div>
        <Link
          href="/staging"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-text-primary transition-all duration-200 hover:border-white/20 hover:bg-white/10"
        >
          Open Staging
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassPanel hover className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Operational Items</span>
            <Package className="h-5 w-5 text-accent/60" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{summary.total}</p>
        </GlassPanel>
        <GlassPanel hover className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Ready to List</span>
            <PackageCheck className="h-5 w-5 text-accent/60" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{summary.ready_to_list}</p>
        </GlassPanel>
        <GlassPanel hover className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Active Listings</span>
            <ShoppingCart className="h-5 w-5 text-accent/60" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{summary.active_listings}</p>
        </GlassPanel>
        <GlassPanel hover className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Sold / Fulfillment</span>
            <Box className="h-5 w-5 text-accent/60" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{summary.sold_or_shipped}</p>
          <p className="text-xs text-text-muted">Archived: {summary.archived}</p>
        </GlassPanel>
      </div>

      <GlassPanel>
        <form className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="inventory-query" className="block text-sm font-medium text-text-muted">
              Search inventory
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted/60" />
              <input
                id="inventory-query"
                name="query"
                defaultValue={query}
                placeholder="Title, ISBN, SKU, author, source, or storage location"
                className="h-10 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/50 transition-colors duration-200 hover:border-white/20 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
          </div>
          <div className="space-y-1.5 lg:w-56">
            <label htmlFor="inventory-status" className="block text-sm font-medium text-text-muted">
              Status
            </label>
            <select
              id="inventory-status"
              name="status"
              defaultValue={status}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary transition-colors duration-200 hover:border-white/20 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            >
              <option value="all">All statuses</option>
              <option value="inventory">Inventory</option>
              <option value="listed">Listed</option>
              <option value="sold">Sold</option>
              <option value="shipped">Shipped</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-vault-base transition-all duration-200 hover:bg-accent-dark"
            >
              Apply Filters
            </button>
            <Link
              href="/inventory"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-text-primary transition-all duration-200 hover:border-white/20 hover:bg-white/10"
            >
              Reset
            </Link>
          </div>
        </form>
      </GlassPanel>

      {items.length === 0 ? (
        <GlassPanel>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-accent/10 p-4">
              <Package className="h-10 w-10 text-accent" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-text-primary">
              Your inventory is empty
            </h3>
            <p className="mt-2 max-w-sm text-sm text-text-muted">
              Move a staged book into inventory or publish one to eBay to start building your operational catalog.
            </p>
            <Link
              href="/staging"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-vault-base transition-all duration-200 hover:bg-accent-dark"
            >
              Go to Staging
            </Link>
          </div>
        </GlassPanel>
      ) : filteredItems.length === 0 ? (
        <GlassPanel>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-white/5 p-4">
              <Search className="h-10 w-10 text-text-muted/50" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-text-primary">
              No inventory items match those filters
            </h3>
            <p className="mt-2 max-w-sm text-sm text-text-muted">
              Try a broader search or reset your filters to see the rest of your inventory.
            </p>
          </div>
        </GlassPanel>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Showing {filteredItems.length} of {items.length} operational items.
          </p>
          {filteredItems.map((item) => {
            const book = item.books_catalog;
            const imageUrl = getPrimaryImageUrl(item);

            return (
              <GlassPanel key={item.id} hover className="space-y-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <BookCoverImage
                      src={imageUrl}
                      alt={book?.title || "Book cover"}
                      className="hidden h-32 w-24 shrink-0 md:block"
                      sizes="96px"
                    />

                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-text-primary">
                          {book?.title || "Untitled book"}
                        </h2>
                        <Badge variant={statusBadgeVariant(item.status)}>
                          {item.status}
                        </Badge>
                        <Badge variant={conditionBadgeVariant(item.condition)}>
                          {item.condition}
                        </Badge>
                      </div>

                      {book?.authors && book.authors.length > 0 && (
                        <p className="text-sm text-text-muted">
                          {book.authors.join(", ")}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-text-muted">
                        {book?.isbn && <span>ISBN {book.isbn}</span>}
                        {item.sku && <span>SKU {item.sku}</span>}
                        {item.storage_location && <span>Storage {item.storage_location}</span>}
                        {item.sources?.name && <span>Source {item.sources.name}</span>}
                        <span>Acquired {formatDate(item.acquired_date)}</span>
                        <span>Updated {formatDate(item.updated_at)}</span>
                      </div>

                      {item.listing_title && item.listing_title !== book?.title && (
                        <p className="text-sm text-text-muted">
                          Listing title: <span className="text-text-primary">{item.listing_title}</span>
                        </p>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          <p className="text-xs uppercase tracking-wider text-text-muted">List Price</p>
                          <p className="mt-1 text-sm font-semibold text-text-primary">
                            {formatCurrency(item.listing_price)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          <p className="text-xs uppercase tracking-wider text-text-muted">Cost Basis</p>
                          <p className="mt-1 text-sm font-semibold text-text-primary">
                            {formatCurrency(item.cost_basis)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          <p className="text-xs uppercase tracking-wider text-text-muted">Sale Price</p>
                          <p className="mt-1 text-sm font-semibold text-text-primary">
                            {formatCurrency(item.sale_price)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          <p className="text-xs uppercase tracking-wider text-text-muted">Net Profit</p>
                          <p className="mt-1 text-sm font-semibold text-text-primary">
                            {formatCurrency(calculateInventoryItemNetProfit(item))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <Link
                      href={`/staging/${item.id}`}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-text-primary transition-all duration-200 hover:border-white/20 hover:bg-white/10"
                    >
                      View Item
                    </Link>
                    {item.ebay_listing_url && (
                      <a
                        href={item.ebay_listing_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-vault-base transition-all duration-200 hover:bg-accent-dark"
                      >
                        View eBay Listing
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
