-- ============================================================
-- Automation Suite Phase 1 Migration
-- Adds tables and columns required by Products #1-4 and shared SUBs
-- Run: npm run db:migrate (or paste in Supabase SQL Editor)
-- ============================================================

-- ── eBay Token Mutex (prevents concurrent refresh collisions) ─
ALTER TABLE ebay_tokens ADD COLUMN IF NOT EXISTS refresh_lock BOOLEAN DEFAULT false;
ALTER TABLE ebay_tokens ADD COLUMN IF NOT EXISTS lock_acquired_at TIMESTAMPTZ;

-- ── Automation Config (n8n reads at runtime, ScryVault writes) ─
-- Stores per-user, per-product configuration (thresholds, dry_run, etc.)
CREATE TABLE IF NOT EXISTS automation_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  product TEXT NOT NULL,          -- 'stale_reviver', 'health_monitor', etc.
  config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product)
);

-- ── Automation Activity Log (n8n writes, ScryVault reads) ────
-- Central log of all automation actions across all products
CREATE TABLE IF NOT EXISTS automation_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  product TEXT NOT NULL,          -- 'stale_reviver', 'health_monitor', etc.
  action TEXT NOT NULL,           -- 'listing_revised', 'listing_relisted', etc.
  summary TEXT,                   -- Human-readable one-liner
  details JSONB,                  -- Full payload (SKU, prices, issues, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Product #4: Stale Listing Reviver columns ────────────────
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS last_revised_at TIMESTAMPTZ;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS revision_count INT DEFAULT 0;

-- ── Product #2: Listing Health Monitor columns ───────────────
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS health_status TEXT;       -- 'red', 'yellow', 'green'
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS health_issues JSONB DEFAULT '[]';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS last_watch_count INT DEFAULT 0;

-- ── Product #3: Sales & Profit Dashboard columns ─────────────
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS ebay_order_id TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS final_value_fee DECIMAL(10,2);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS payment_processing_fee DECIMAL(10,2);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS promoted_listing_fee DECIMAL(10,2);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_automation_config_user_product
  ON automation_config(user_id, product);

CREATE INDEX IF NOT EXISTS idx_automation_activity_user_product
  ON automation_activity(user_id, product);

CREATE INDEX IF NOT EXISTS idx_automation_activity_created
  ON automation_activity(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_health_status
  ON inventory_items(user_id, health_status);

CREATE INDEX IF NOT EXISTS idx_inventory_ebay_order
  ON inventory_items(ebay_order_id);

-- ── RLS on new tables ─────────────────────────────────────────
ALTER TABLE automation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own automation config"
  ON automation_config FOR ALL USING (auth.uid() = user_id);

-- n8n uses service role key (bypasses RLS) to write activity logs.
-- ScryVault reads activity using auth'd user.
CREATE POLICY "Users read own automation activity"
  ON automation_activity FOR SELECT USING (auth.uid() = user_id);

-- Service role policy for n8n writes (requires service_role key, which bypasses RLS already)
-- No explicit policy needed for service_role -- it bypasses RLS by design.
-- This comment is here to document that intentionally.

-- ── Updated_at triggers for new tables ───────────────────────
CREATE TRIGGER set_updated_at BEFORE UPDATE ON automation_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
