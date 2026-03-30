-- ============================================================
-- ScryVault Database Schema (Unified & Relational)
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- Drop existing tables to ensure a clean slate
DROP TABLE IF EXISTS item_images CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS staged_items CASCADE;
DROP TABLE IF EXISTS books_catalog CASCADE;
DROP TABLE IF EXISTS sources CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS prompt_templates CASCADE;
DROP TABLE IF EXISTS ebay_tokens CASCADE;

-- ── Sources (where you acquire books) ───────────────────────
CREATE TABLE sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Goodwill on Main St", "Library Sale 2025"
  type TEXT,                             -- "thrift_store", "estate_sale", "library_sale", "online", "other"
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Books Catalog (shared metadata per ISBN/Title) ──────────
CREATE TABLE books_catalog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  isbn TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  authors TEXT[],                        -- Array of author names
  publisher TEXT,
  published_date TEXT,                   -- "2024" or "2024-03-15"
  page_count INT,
  description TEXT,
  cover_url TEXT,                        -- Google Books cover thumbnail
  categories TEXT[],                     -- ["Fiction", "Science Fiction"]
  language TEXT DEFAULT 'en',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Inventory Items (physical copies of a book) ─────────────
CREATE TABLE inventory_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID REFERENCES books_catalog(id) ON DELETE SET NULL,

  sku TEXT UNIQUE,                       -- eBay requires a SKU (e.g. WEB-HC-1ST-DUNE)

  -- Condition & storage
  condition TEXT NOT NULL DEFAULT 'Good', -- "Brand New", "Like New", "Very Good", "Good", "Acceptable"
  condition_notes TEXT,                  -- Free-text condition details
  storage_location TEXT,                 -- "Shelf A3", "Box 12"

  -- Acquisition details
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  acquired_date DATE DEFAULT CURRENT_DATE,
  cost_basis DECIMAL(10,2),             -- COGS per item

  -- LLM-generated listing content
  listing_title TEXT,                    -- eBay-optimized title (80 char max)
  listing_description TEXT,              -- HTML description for eBay
  listing_condition_notes TEXT,          -- AI-generated condition notes
  listing_price DECIMAL(10,2),           -- Asking price
  quantity INT DEFAULT 1,                -- >1 only for exact same condition/copy

  -- eBay integration
  ebay_listing_id TEXT,                  -- eBay inventory item SKU / Item ID
  ebay_offer_id TEXT,                    -- eBay offer ID
  ebay_listing_url TEXT,                 -- Live eBay listing URL

  -- Status tracking
  status TEXT DEFAULT 'staged',          -- "staged", "inventory", "listed", "sold", "shipped", "archived"
  listed_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,

  -- Sale details (populated when sold)
  sale_price DECIMAL(10,2),
  ebay_fees DECIMAL(10,2),
  shipping_cost DECIMAL(10,2),
  net_profit DECIMAL(10,2),             -- Computed: sale_price - cost_basis - ebay_fees - shipping_cost

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Item Images (Cloudflare R2 URLs) ────────────────────────
CREATE TABLE item_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  public_url TEXT NOT NULL,              -- Cloudflare R2 public URL
  display_order INT DEFAULT 0,           -- For photo ordering
  is_primary BOOLEAN DEFAULT false,      -- Main listing photo
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Expenses (non-item business expenses) ───────────────────
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,                -- "supplies", "shipping_materials", "ebay_fees", "software", "other"
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Prompt Templates (LLM listing generation) ───────────────
CREATE TABLE prompt_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Default Title", "Vintage Book Description"
  type TEXT NOT NULL,                    -- "title", "description", "condition_notes"
  template TEXT NOT NULL,                -- The prompt template with {{placeholders}}
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── eBay Tokens (encrypted OAuth tokens) ────────────────────
CREATE TABLE ebay_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX idx_books_catalog_user ON books_catalog(user_id);
CREATE INDEX idx_books_catalog_isbn ON books_catalog(isbn);
CREATE INDEX idx_inventory_items_user ON inventory_items(user_id);
CREATE INDEX idx_inventory_items_status ON inventory_items(user_id, status);
CREATE INDEX idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX idx_inventory_items_ebay ON inventory_items(ebay_listing_id);
CREATE INDEX idx_item_images_inventory ON item_images(inventory_item_id);
CREATE INDEX idx_expenses_user ON expenses(user_id);
CREATE INDEX idx_sources_user ON sources(user_id);

-- ── Updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON books_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON prompt_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ebay_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security (multi-tenancy from day one)
-- ============================================================
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE books_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebay_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own data
CREATE POLICY "Users manage own sources"
  ON sources FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own books catalog"
  ON books_catalog FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own inventory items"
  ON inventory_items FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own images"
  ON item_images FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own expenses"
  ON expenses FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own prompt templates"
  ON prompt_templates FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own eBay tokens"
  ON ebay_tokens FOR ALL USING (auth.uid() = user_id);
