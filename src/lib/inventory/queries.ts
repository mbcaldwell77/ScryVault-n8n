import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryItem } from "@/types/books";

type InventoryStatus = InventoryItem["status"];
type InventoryFilterStatus = InventoryStatus | "all";

const INVENTORY_ITEM_SELECT = `
  *,
  books_catalog(*),
  sources(name, type),
  item_images(*)
`;

export interface InventoryFilters {
  query?: string;
  status?: InventoryFilterStatus;
}

export interface InventorySummary {
  total: number;
  ready_to_list: number;
  active_listings: number;
  sold_or_shipped: number;
  archived: number;
}

export interface DashboardMetrics {
  total_inventory: number;
  staged_items: number;
  active_listings: number;
  monthly_revenue: number;
  ready_to_list: number;
  sold_this_month: number;
}

export interface DashboardActivityItem {
  id: string;
  title: string;
  authors: string[];
  status: InventoryStatus;
  summary: string;
  timestamp: string;
  href: string;
  ebay_listing_url: string | null;
}

interface DashboardMetricRow {
  status: InventoryStatus;
  sale_price: number | null;
  sold_at: string | null;
}

interface DashboardActivityRow {
  id: string;
  status: InventoryStatus;
  created_at: string;
  updated_at: string;
  listed_at: string | null;
  sold_at: string | null;
  shipped_at: string | null;
  ebay_listing_url: string | null;
  books_catalog:
  | {
    title: string | null;
    authors: string[] | null;
  }
  | {
    title: string | null;
    authors: string[] | null;
  }[]
  | null;
}

function normalizeQuery(query: string | undefined): string {
  return query?.trim().toLowerCase() || "";
}

function includesQuery(value: string | number | null | undefined, query: string): boolean {
  if (value == null) {
    return false;
  }

  return String(value).toLowerCase().includes(query);
}

function matchesInventoryQuery(item: InventoryItem, query: string): boolean {
  const book = item.books_catalog;

  return [
    book?.title,
    book?.subtitle,
    book?.isbn,
    book?.publisher,
    item.sku,
    item.storage_location,
    item.ebay_listing_id,
    item.ebay_offer_id,
    item.sources?.name,
    ...(book?.authors || []),
    ...(book?.categories || []),
  ].some((value) => includesQuery(value, query));
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function listOperationalInventoryItems(
  supabase: SupabaseClient,
  userId: string,
): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select(INVENTORY_ITEM_SELECT)
    .eq("user_id", userId)
    .neq("status", "staged")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as InventoryItem[];
}

export function filterInventoryItems(
  items: InventoryItem[],
  filters: InventoryFilters,
): InventoryItem[] {
  const status = filters.status || "all";
  const query = normalizeQuery(filters.query);

  return items.filter((item) => {
    const statusMatches = status === "all" ? true : item.status === status;
    const queryMatches = query ? matchesInventoryQuery(item, query) : true;
    return statusMatches && queryMatches;
  });
}

export function summarizeInventoryItems(items: InventoryItem[]): InventorySummary {
  return items.reduce<InventorySummary>(
    (summary, item) => {
      summary.total += 1;

      if (item.status === "inventory") {
        summary.ready_to_list += 1;
      }

      if (item.status === "listed") {
        summary.active_listings += 1;
      }

      if (item.status === "sold" || item.status === "shipped") {
        summary.sold_or_shipped += 1;
      }

      if (item.status === "archived") {
        summary.archived += 1;
      }

      return summary;
    },
    {
      total: 0,
      ready_to_list: 0,
      active_listings: 0,
      sold_or_shipped: 0,
      archived: 0,
    },
  );
}

export function getPrimaryImageUrl(item: InventoryItem): string | null {
  const images = item.item_images || [];
  const primary = images.find((image) => image.is_primary) || images[0];
  return primary?.public_url || item.books_catalog?.cover_url || null;
}

export async function getDashboardData(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ metrics: DashboardMetrics; recentActivity: DashboardActivityItem[] }> {
  const [metricsResult, activityResult] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("status, sale_price, sold_at")
      .eq("user_id", userId),
    supabase
      .from("inventory_items")
      .select(`
        id,
        status,
        created_at,
        updated_at,
        listed_at,
        sold_at,
        shipped_at,
        ebay_listing_url,
        books_catalog(title, authors)
      `)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(8),
  ]);

  if (metricsResult.error) {
    throw metricsResult.error;
  }

  if (activityResult.error) {
    throw activityResult.error;
  }

  const monthStart = getMonthStart();
  const metricRows = normalizeDashboardMetricRows(metricsResult.data || []);
  const activityRows = normalizeDashboardActivityRows(activityResult.data || []);

  const metrics = metricRows.reduce<DashboardMetrics>(
    (summary, item) => {
      if (item.status !== "staged" && item.status !== "archived") {
        summary.total_inventory += 1;
      }

      if (item.status === "staged") {
        summary.staged_items += 1;
      }

      if (item.status === "inventory") {
        summary.ready_to_list += 1;
      }

      if (item.status === "listed") {
        summary.active_listings += 1;
      }

      if (item.sold_at && new Date(item.sold_at) >= monthStart) {
        summary.sold_this_month += 1;
        summary.monthly_revenue += Number(item.sale_price || 0);
      }

      return summary;
    },
    {
      total_inventory: 0,
      staged_items: 0,
      active_listings: 0,
      monthly_revenue: 0,
      ready_to_list: 0,
      sold_this_month: 0,
    },
  );

  const recentActivity = activityRows.map((item) => {
    const book = getDashboardActivityBook(item);

    return {
      id: item.id,
      title: book?.title || "Untitled book",
      authors: book?.authors || [],
      status: item.status,
      summary: buildActivitySummary(item),
      timestamp: item.updated_at,
      href: `/staging/${item.id}`,
      ebay_listing_url: item.ebay_listing_url,
    };
  });

  return {
    metrics,
    recentActivity,
  };
}

function getDashboardActivityBook(
  item: DashboardActivityRow,
): {
  title: string | null;
  authors: string[] | null;
} | null {
  if (Array.isArray(item.books_catalog)) {
    return item.books_catalog[0] || null;
  }

  return item.books_catalog;
}

function normalizeDashboardActivityRows(
  rows: unknown[],
): DashboardActivityRow[] {
  return rows as unknown as DashboardActivityRow[];
}

function normalizeDashboardMetricRows(
  rows: unknown[],
): DashboardMetricRow[] {
  return rows as unknown as DashboardMetricRow[];
}

function buildActivitySummary(item: DashboardActivityRow): string {
  if (item.status === "shipped" && item.shipped_at) {
    return "Marked shipped";
  }

  if (item.status === "sold" && item.sold_at) {
    return "Marked sold";
  }

  if (item.status === "listed" && item.listed_at) {
    return "Published to eBay";
  }

  if (item.status === "inventory") {
    return "Moved to inventory";
  }

  if (item.status === "archived") {
    return "Archived item";
  }

  return "Added to staging";
}
