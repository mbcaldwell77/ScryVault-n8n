-- ============================================================
-- Blog Posts (Ældern Tomes public blog on elderntomes.com)
-- Run: paste in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- Why this lives in ScryVault's Supabase:
--   ScryVault is becoming the source of truth for the bookstore
--   (inventory today, blog content now). elderntomes.com reads
--   published posts via the anon key; ScryVault's admin UI
--   writes posts as the authenticated author (MBC).
--
-- RLS shape:
--   - anon SELECT allowed ONLY where published = true  (public reads)
--   - authenticated CRUD allowed ONLY on posts the user owns
-- ============================================================

-- ── Blog Posts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- URL + identity
  slug TEXT NOT NULL UNIQUE,              -- URL path segment: /blog/how-to-identify-first-edition-zahn
  title TEXT NOT NULL,                    -- H1 + <title>
  excerpt TEXT,                           -- Listing card + fallback meta description

  -- Body
  content TEXT NOT NULL,                  -- Markdown source (rendered via react-markdown on the site)
  cover_image_url TEXT,                   -- Hero image; also default OG image
  cover_image_alt TEXT,                   -- Alt text for accessibility + image SEO

  -- Authorship + taxonomy
  author TEXT NOT NULL DEFAULT 'Ældern Tomes',
  tags TEXT[] DEFAULT '{}',               -- ['first-editions', 'zahn', 'star-wars']

  -- Publication state
  published BOOLEAN NOT NULL DEFAULT false, -- Draft flag. Public reads require this AND published_at.
  published_at TIMESTAMPTZ,                 -- When the post went live. NULL while drafting.

  -- SEO overrides (optional; fall back to excerpt / cover_image_url when NULL)
  meta_description TEXT,                  -- <meta name="description">
  og_image_url TEXT,                      -- Override cover_image_url for social cards
  canonical_url TEXT,                     -- For cross-posting (e.g. Medium syndication)

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
-- Public blog listing query: WHERE published=true ORDER BY published_at DESC
CREATE INDEX IF NOT EXISTS idx_blog_posts_published
  ON blog_posts(published, published_at DESC);

-- Admin UI: list this user's posts newest first
CREATE INDEX IF NOT EXISTS idx_blog_posts_user_updated
  ON blog_posts(user_id, updated_at DESC);

-- Tag filtering (GIN for array containment)
CREATE INDEX IF NOT EXISTS idx_blog_posts_tags
  ON blog_posts USING GIN (tags);

-- ── Updated_at trigger ───────────────────────────────────────
CREATE TRIGGER set_updated_at BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Public can read ONLY published posts. This is what elderntomes.com
-- hits via the NEXT_PUBLIC_SUPABASE_ANON_KEY.
CREATE POLICY "Public reads published posts"
  ON blog_posts FOR SELECT
  USING (published = true);

-- Authors manage their own posts (drafts included). ScryVault admin
-- UI uses an authenticated Supabase session keyed to MBC's user_id.
CREATE POLICY "Authors manage own posts"
  ON blog_posts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (n8n, server-side tools) bypasses RLS by design.
