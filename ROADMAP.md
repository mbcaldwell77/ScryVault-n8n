# ScryVault — Development Roadmap

## Prerequisites (Before Phase 1)

These need to be done before or during early development:

- [ ] **eBay OAuth setup**: Register app in eBay Developer Portal, configure OAuth redirect URIs, obtain production keyset. The authorization code grant flow requires a consent URL → user approves → callback with auth code → exchange for tokens. Tokens need refreshing (access token: 2hr, refresh token: 18mo).
- [ ] **eBay inventory location**: At least one location must be created via the Inventory API before any offers can be published. This is a one-time API call but is a hard prerequisite.
- [ ] **eBay business policies**: Confirm fulfillment, return, and payment policies are set up (you mentioned these are ready).
- [ ] **Supabase project**: Create project, configure auth.
- [ ] **Cloudflare R2**: Create R2 bucket for zero-egress image storage.
- [ ] **Environment variables**: All API keys into `.env.local`.

---

## Phase 0: Project Scaffold & Design System
**Goal**: Standing app with auth, design system, and basic navigation.

### What gets built
- Next.js 15 + TypeScript + Tailwind project initialization
- Tailwind theme config with all design tokens (vault colors, glass utilities)
- Reusable UI components: GlassPanel, Button, Input, Badge, Modal, Layout shell
- Supabase client setup (server + client)
- Supabase Auth integration (email/password + OAuth option)
- Protected route layout with sidebar navigation
- Dashboard shell page (empty, but authenticated)
- Database schema: `users` table (via Supabase Auth), initial migrations
- Mobile-responsive shell (sidebar collapses to bottom nav on mobile)
- Git repo connected to GitHub, CI basics (lint on push)

### Cost
- **$0/month**. Everything on free tiers (Supabase free, Vercel hobby).

### Decisions needed from you
- **Auth providers**: Email/password only to start, or also Google/GitHub OAuth?
- **GitHub repo**: Public or private? (Vercel hobby plan works with both)

---

## Phase 1: Scan → Stage → Enrich Pipeline
**Goal**: Scan a barcode or enter an ISBN, auto-populate book metadata, add photos and details. The "intake" half of the core workflow.

### What gets built
- **Database tables**: `books_catalog` (shared title/author/ISBN data), `inventory_items` (physical copy details with a `status` enum: staged, inventory, listed, sold, shipped), `item_images`, `sources`
- **ISBN lookup service**: Google Books API integration — enter ISBN, get metadata and store in `books_catalog`.
- **Manual entry form**: For books without ISBNs (older, rare books)
- **Staging area page**: List of all staged items, status indicators
- **Item enrichment form**:
  - Photo upload (up to 12 images per item, drag-and-drop + mobile camera capture)
  - Acquisition details: source, date acquired, cost (COGS)
  - Condition selector (dropdown: Brand New, Like New, Very Good, Good, Acceptable) + free-text condition notes
  - Storage location field
- **Image handling**: Upload directly to Cloudflare R2 via Next.js presigned URLs (preserves zero egress fees), generate public URLs, thumbnails.
- **Barcode scanning**: Web-based scanner for mobile (html5-qrcode) as the primary intake method, with passive support for physical USB/Bluetooth handheld laser scanners (keyboard wedge) if used at a desk.
- **SKU Generation**: SKUs are generated at the *very end* of the physical intake process, after metadata and photos are collected. Format: `[WEB?-][FORMAT]-[1ST_ED?]-[TITLE_SNIPPET]`.
  - Prefix: Optional "WEB-" toggle (for autosyncing to external website).
  - Format: HC (Hardcover), TPB (Trade Paperback), or MMPB (Mass Market Paperback).
  - 1st Edition check: Optional "1ST-" derived from Claude Vision analyzing the copyright page number line.
  - Title: Sliced snippet of the book title.
  - Example: `WEB-HC-1ST-DUNE` or `TPB-HARRYPT`

### Cost estimate
- **Google Books API**: Free (1,000 requests/day — more than enough)
- **Cloudflare R2**: 10 GB free per month, zero egress fees. At ~2 MB per item, that's ~5,000 items on the free tier, and cheap thereafter.
- **Total: $0/month** for initial development and first ~5,000 items.

### Decisions needed from you
- **Image compression**: Resize to max 1600px wide, JPEG quality ~80% before upload? eBay recommends minimum 500px on longest side, prefers 1600px.
- **Barcode library**: html5-qrcode is lighter and better maintained than QuaggaJS. OK to go with that?

---

## Phase 2: LLM Listing Generation
**Goal**: Given a staged item's metadata + photos, Claude generates an eBay-optimized title, HTML description, and condition notes.

### What gets built
- **Prompt template system**: Configurable templates stored in database (`prompt_templates` table). Default templates provided, user can customize in Settings.
- **Listing generation API route**: Takes item ID → assembles context (metadata, condition, photos) → calls Claude API → returns generated listing content
- **Generation UI**: "Generate Listing" button on staged item → shows preview of generated title/description/condition notes → user can edit before accepting
- **Title optimization**: Claude generates eBay Cassini-SEO-optimized titles (80 char max), emphasizing: edition, format, condition keywords, author name
- **Description generation**: HTML-formatted eBay description from metadata + condition notes + photo analysis
- **Photo-based condition assessment**: Send photos to Claude Vision to supplement/validate manual condition notes
- **Cost tracking**: Log token usage per generation, display estimated cost
- **Regenerate/edit flow**: User can tweak prompt inputs and regenerate, or manually edit the output

### Cost estimate
- **Claude API per listing**: ~$0.02 per generation (500 input tokens + 1-3 images at ~$0.005 each + ~800 output tokens). With photo analysis of 3 images: ~$0.03 per listing.
- **At 50 listings/month**: ~$1.50/month
- **At 500 listings/month**: ~$15/month
- **Prompt caching**: If we cache the system prompt/template, input costs drop ~90% on the cached portion.
- **Total: ~$1-2/month** at typical hobby-seller volume (50-100 listings/month).

### Decisions needed from you
- **How many photos to send to Claude for condition analysis?** All uploaded photos, or just the first 3-4? More photos = better assessment but higher cost.
- **Generation model**: Claude Sonnet 4.5 is the sweet spot (fast, capable, vision-enabled, cheaper than Opus). OK with that?

---

## Phase 3: Publish to eBay
**Goal**: One-click publish from ScryVault to live eBay listing. Also: add to inventory without publishing.

### What gets built
- **eBay OAuth flow**: Authorization code grant implementation with **Token Mutex/Locking** in the database to prevent concurrent refresh-token race conditions.
- **eBay Inventory API integration**:
  - `createOrReplaceInventoryItem` — push item data + images
  - `createOffer` — create offer with price, business policies, category
  - `publishOffer` — make it live
- **eBay category mapping**: Book-specific category suggestions (help user pick the right eBay category)
- **Publish flow UI**:
  - Review listing preview (title, description, photos, price, condition)
  - Set price (manual entry, or use suggested price from comps — Phase 6)
  - Select business policies (fulfillment, return, payment)
  - "Publish to eBay" button → calls Inventory API pipeline
  - "Save to Inventory Only" button → moves from staging to inventory without publishing
- **Inventory table update**: On publish, record eBay listing ID, publish date, listing status
- **Error handling**: eBay API errors surfaced clearly (policy violations, missing fields, image issues)
- **Database tables**: `ebay_tokens` (encrypted), `ebay_listings` (maps inventory items to eBay listing IDs)

### Cost estimate
- **eBay API**: Free. Rate limit of 5,000 calls/day is far more than needed.
- **Total: $0** (assuming existing Vercel/Supabase free tiers hold).

### Decisions needed from you
- **eBay category handling**: Default to "Books & Magazines > Books" (category 261186) with option to change? Or build a category search/picker?
- **Pricing**: Manual only in this phase, or basic "suggest a price" input?

### Hard prerequisites
- eBay OAuth tokens working (Phase 3 can't start without this)
- At least one inventory location created
- Business policies confirmed

---

## Phase 4: Inventory Management
**Goal**: Full inventory view, filtering, sorting, status tracking, eBay sync.

### What gets built
- **Inventory dashboard**: Card/table view of all inventory items with key info at a glance
- **Filtering & sorting**: By condition, price range, date acquired, source, listed/unlisted, ISBN, author, storage location, days in inventory
- **Search**: Full-text search across title, author, ISBN, description, notes
- **Item detail page**: Full item view with all metadata, photos, listing content, eBay status, financial data
- **Status tracking**: Unlisted → Listed → Sold → Shipped. Visual status badges.
- **eBay sync**: Pull listing status updates (active, ended, sold). Periodic sync or on-demand.
- **Bulk operations**: Select multiple items → bulk relist, bulk price change, bulk archive
- **Storage location management**: Quick-filter by location, location summary view ("Shelf A3: 12 items")
- **Unique copy handling**: Same ISBN shows as grouped but each copy is an independent item with its own photos/condition/listing

### Cost estimate
- **$0** additional. Database queries and UI work — no new paid services.
- **Watch point**: Supabase free tier is 500 MB database. At ~2 KB per inventory item (excluding images), that's ~250,000 items before database limit. Images in storage will be the bottleneck first.

---

## Phase 5: Financial Tracking
**Goal**: Track P&L per item and overall. Source ROI. Tax summaries.

### What gets built
- **Per-item financials**: COGS (from staging), selling price (from eBay sale), eBay fees, shipping cost → net profit per item
- **eBay Fulfillment API integration**: Pull completed orders, sale prices, fees automatically
- **Expense tracking**: Manual entry for non-item expenses (supplies, shipping materials, subscriptions, etc.)
- **Expense categories**: COGS, supplies, shipping materials, eBay fees, other
- **P&L dashboard**: Revenue, COGS, gross profit, expenses, net profit. Filterable by time period.
- **Source ROI reporting**: Which sourcing locations (estate sales, thrift stores, library sales) yield best margins? Table + chart.
- **Tax summaries**: Annual and quarterly rollups. Exportable to CSV.
- **Inventory aging**: Days in stock per item, average days to sell by category/condition/source
- **Database tables**: `expenses`, `sales` (or extend inventory items with sale data)

### Cost estimate
- **eBay Fulfillment API**: Free. Same rate limits as other eBay APIs.
- **Total: $0** additional.

---

## Phase 6: Smart Features (Future)
**Goal**: Comp pricing, dead inventory alerts, advanced analytics.

### What gets built
- **Comp pricing**: On scan/stage, query eBay Browse API for recent sold listings of same ISBN. Show price range, average, median.
- **Dead inventory alerts**: Dashboard widget showing items listed > X days with no activity. Suggest price reduction.
- **Inventory aging reports**: Charts showing inventory age distribution, slow movers, fast sellers.
- **Restock suggestions**: Based on ROI data, suggest which types of books to source more of.

### Cost estimate
- **eBay Browse API**: Free, 5,000 calls/day.
- **Total: $0** additional.

---

## Phase 7: Multi-Tenancy & SaaS (Future)
**Goal**: Support multiple users, onboarding, billing.

### What gets built
- Row-level security policies in Supabase (already tenant-aware from Phase 0)
- User onboarding flow (connect eBay account, set up preferences)
- Billing integration (Stripe)
- Usage metering (Claude API costs passed through or included in plan)
- Admin dashboard

### Cost estimate
- **Supabase Pro**: $25/month (needed for more storage, better performance)
- **Vercel Pro**: $20/month (commercial use, higher limits)
- **Stripe**: 2.9% + $0.30 per transaction
- **Claude API**: Scales with user count. At 100 users × 50 listings/month × $0.03/listing = ~$150/month

---

## Cost Summary

| Phase | Monthly Cost | Cumulative |
|-------|-------------|------------|
| 0: Scaffold | $0 | $0 |
| 1: Scan/Stage | $0 | $0 |
| 2: LLM Generation | ~$1-2 | ~$1-2 |
| 3: eBay Publish | $0 | ~$1-2 |
| 4: Inventory | $0 | ~$1-2 |
| 5: Financial | $0 | ~$1-2 |
| 6: Smart Features | $0 | ~$1-2 |
| 7: Multi-Tenant | ~$45+ | ~$45+ |

**You won't spend a dime until Phase 2**, and even then it's pocket change. The first real costs come at Phase 7 when you need Supabase Pro + Vercel Pro for commercial SaaS.

## Free Tier Ceilings

| Service | Free Limit | When You'll Hit It |
|---------|-----------|-------------------|
| Supabase DB | 500 MB | ~250K items (not a concern for single user) |
| Cloudflare R2 | 10 GB | ~5,000 items (10 million reqs/mo free) |
| R2 Bandwidth | Unlimited | Zero egress fees |
| Vercel | 150K function invocations/mo | Unlikely to hit as single user |
| Google Books API | 1,000 req/day | Unlikely to hit (that's a LOT of scanning in one day) |
| eBay APIs | 5,000 calls/day | Unlikely to hit |

**First bottleneck**: Database row limits on Supabase free tier, but far off. R2 provides extensive runway for images.

---

## Long Lead-Time Items

1. **eBay OAuth**: The OAuth flow implementation is straightforward, but testing against the eBay sandbox can be finicky. Budget time for debugging token exchange and refresh flows.
2. **eBay Inventory Location**: One-time API call, but must be done before any offers are created. Should be done as part of Phase 3 setup.
3. **Cloudflare Account**: Need to set up standard Cloudflare R2 buckets for public image serving.
