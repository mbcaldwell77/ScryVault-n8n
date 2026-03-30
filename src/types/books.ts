export interface BookCatalog {
  id: string;
  user_id: string;
  isbn: string | null;
  title: string;
  subtitle: string | null;
  authors: string[] | null;
  publisher: string | null;
  published_date: string | null;
  page_count: number | null;
  description: string | null;
  cover_url: string | null;
  categories: string[] | null;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  user_id: string;
  book_id: string | null;
  sku: string | null;
  condition: string;
  condition_notes: string | null;
  storage_location: string | null;
  source_id: string | null;
  acquired_date: string | null;
  cost_basis: number | null;
  listing_title: string | null;
  listing_description: string | null;
  listing_condition_notes: string | null;
  listing_price: number | null;
  quantity: number;
  ebay_listing_id: string | null;
  ebay_offer_id: string | null;
  ebay_listing_url: string | null;
  status: "staged" | "inventory" | "listed" | "sold" | "shipped" | "archived";
  listed_at: string | null;
  sold_at: string | null;
  shipped_at: string | null;
  sale_price: number | null;
  ebay_fees: number | null;
  shipping_cost: number | null;
  net_profit: number | null;
  created_at: string;
  updated_at: string;

  // Joined Fields
  books_catalog?: BookCatalog | null;
  item_images?: ItemImage[] | null;
  sources?: Source | null;
}

export interface ItemImage {
  id: string;
  user_id: string;
  inventory_item_id: string;
  storage_path: string | null;
  public_url: string;
  display_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface Source {
  id: string;
  user_id: string;
  name: string;
  type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type BookCondition = "Brand New" | "Like New" | "Very Good" | "Good" | "Acceptable";

export const BOOK_CONDITIONS: BookCondition[] = [
  "Brand New",
  "Like New",
  "Very Good",
  "Good",
  "Acceptable",
];

export type SourceType = "thrift_store" | "estate_sale" | "library_sale" | "online" | "auction" | "personal" | "other";

export const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "thrift_store", label: "Thrift Store" },
  { value: "estate_sale", label: "Estate Sale" },
  { value: "library_sale", label: "Library Sale" },
  { value: "online", label: "Online" },
  { value: "auction", label: "Auction" },
  { value: "personal", label: "Personal Collection" },
  { value: "other", label: "Other" },
];
