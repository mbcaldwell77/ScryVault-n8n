# ScryVault Project Audit

**Audit date:** 2026-03-25
**Audited by:** Claude Code

---

## State of the Project -- Summary

ScryVault is significantly further along than a typical "Phase 0" scaffold. The project has working implementations covering Phase 0 through Phase 5 of the roadmap, with real backend logic, database schema, API routes, and polished UI pages. However, several items described in the CLAUDE.md and roadmap have not been verified as functional end-to-end (no build was run, no tests exist). The codebase is substantial and appears well-structured.

**Bottom line:** The project is realistically at **late Phase 3 / early Phase 5** in terms of code written. All phases through Phase 5 have at least partial implementations. Whether it all works end-to-end depends on whether Supabase, eBay OAuth, and the Anthropic API are configured and tested -- which could not be verified without running the app.

---

## CLAUDE.md Claims vs Reality

### Tech Stack -- ACCURATE

| Claim | Verified |
|-------|----------|
| Next.js 15 (App Router) | **YES** -- package.json shows `next@16.1.6` (actually Next.js 16, newer than claimed) |
| TypeScript (strict mode) | **YES** -- tsconfig.json has `"strict": true` |
| Supabase (PostgreSQL + Auth) | **YES** -- `@supabase/supabase-js` and `@supabase/ssr` installed, client setup exists |
| Cloudflare R2 (storage) | **PARTIAL** -- R2 env vars documented but storage implementation uses Supabase Storage (book-images bucket), not R2 directly. See note below. |
| Hosting: Vercel | **PLAUSIBLE** -- no Vercel config found, but Next.js project would deploy there naturally |
| LLM: Anthropic Claude API | **YES** -- `@anthropic-ai/sdk` installed, `generate-listing.ts` calls `claude-sonnet-4-20250514` |
| Styling: Tailwind CSS v4 | **YES** -- `tailwindcss@^4` in devDependencies, `@tailwindcss/postcss@^4` present |
| Package Manager: npm | **YES** -- no yarn.lock or pnpm-lock found |

**Key discrepancy -- Image Storage:** The CLAUDE.md says images go to Cloudflare R2, but `src/lib/storage/book-images.ts` uploads to a Supabase Storage bucket called "book-images" using `supabase.storage`. The R2 env vars are documented but there is no R2 integration code. Images currently go through Supabase Storage, not R2.

**Next.js version:** CLAUDE.md says Next.js 15, but package.json shows `next@16.1.6`. Should be updated.

### Project Structure -- MOSTLY ACCURATE

| Claimed directory | Exists | Contents |
|-------------------|--------|----------|
| `src/app/(auth)/` | YES | `login/page.tsx`, `register/page.tsx`, `layout.tsx` |
| `src/app/(dashboard)/` | YES | `dashboard/`, `staging/`, `staging/[id]/`, `inventory/`, `financials/`, `settings/` |
| `src/app/api/` | YES | `books/lookup/`, `sources/`, `inventory/`, `inventory/[id]/`, `listings/generate/`, `ebay/connect/`, `ebay/callback/`, `ebay/connection/`, `ebay/disconnect/`, `ebay/setup/`, `ebay/publish/`, `prompt-templates/`, `expenses/`, `expenses/[id]/`, `images/upload/`, `images/[id]/` |
| `src/components/ui/` | YES | `button.tsx`, `badge.tsx`, `modal.tsx`, `logo.tsx`, `glass-panel.tsx`, `input.tsx`, `book-cover-image.tsx`, `toast-provider.tsx` |
| `src/components/features/` | YES | `sidebar.tsx`, `staged-item-card.tsx`, `add-book-modal.tsx`, `image-uploader.tsx`, `listing-preview.tsx`, `expense-manager.tsx` |
| `src/lib/db/` | YES | `supabase-browser.ts`, `supabase-server.ts`, `supabase-middleware.ts`, `supabase-admin.ts` |
| `src/lib/ebay/` | YES | `oauth.ts`, `client.ts`, `token-store.ts`, `sku.ts`, `api.ts`, `types.ts`, `config.ts`, `setup.ts`, `tokens.ts` |
| `src/lib/claude/` | YES | `client.ts`, `generate-listing.ts`, `prompts.ts`, `types.ts` |
| `src/lib/books/` | YES | `google-books.ts` |
| `src/lib/storage/` | YES | `compress-image.ts`, `book-images.ts` |
| `src/lib/utils/` | YES | `cn.ts`, `date.ts` |
| `src/types/` | YES | `index.ts`, `books.ts` |

The structure matches the CLAUDE.md claims well. More directories exist than documented (e.g., `lib/financial/`, `lib/inventory/`).

### Commands -- PARTIALLY ACCURATE

| Command | In package.json | Notes |
|---------|----------------|-------|
| `npm run dev` | YES | |
| `npm run build` | YES | |
| `npm run lint` | YES | |
| `npm run test` | **NO** | No test script, no test files, no test framework installed |
| `npm run db:migrate` | YES | Runs `supabase db push --linked` |
| `npm run db:seed` | **NO** | No seed script exists |

### Environment Variables -- ACCURATE (with caveat)

`.env.local` exists. `.env.local.example` also exists. All documented env vars align with what the code references. However, the R2 env vars may be unused since storage actually goes through Supabase Storage.

### Design System -- ACCURATE

The design tokens in `globals.css` match the CLAUDE.md documentation. Colors are slightly different from what's documented (e.g., CLAUDE.md says `bg-vault-base: #0a0a0a` but CSS has `--color-vault-base: #111513`; CLAUDE.md says `accent: #2dd4bf` but CSS has `--color-accent: #43D5B0`). The glassmorphism pattern is implemented as described.

### Coding Conventions -- FOLLOWED

- Named exports used consistently (default exports only for pages)
- Server Components by default, `"use client"` only where needed
- API routes return typed JSON with consistent error shape `{ error: { message, code } }`
- `user_id` on all tables for multi-tenancy
- No hardcoded secrets found

---

## Roadmap Phase Assessment

### Phase 0: Project Scaffold & Design System -- COMPLETE

| Item | Status |
|------|--------|
| Next.js + TypeScript + Tailwind project | Done |
| Tailwind theme config with design tokens | Done |
| Reusable UI components (GlassPanel, Button, Input, Badge, Modal) | Done |
| Supabase client setup (server + client + middleware + admin) | Done |
| Supabase Auth integration | Done (login, register, callback route, middleware) |
| Protected route layout with sidebar | Done |
| Dashboard shell page | Done (and fully functional, not empty) |
| Database schema with initial migrations | Done (comprehensive schema) |
| Mobile-responsive shell | Done (sidebar collapses to bottom nav) |
| Git repo | Done |
| CI basics (lint on push) | **NOT DONE** -- no `.github/` directory, no CI config |

### Phase 1: Scan -> Stage -> Enrich Pipeline -- COMPLETE

| Item | Status |
|------|--------|
| Database tables (books_catalog, inventory_items, item_images, sources) | Done |
| ISBN lookup (Google Books API) | Done (`lib/books/google-books.ts`, `api/books/lookup/`) |
| Manual entry form | Done (via AddBookModal component) |
| Staging area page | Done (lists staged items, add book button) |
| Item enrichment form (condition, notes, storage location, COGS) | Done (`staging/[id]/page.tsx` -- large, feature-rich detail page) |
| Photo upload | Done (Supabase Storage, not R2) |
| Image compression | Done (client-side, 1600px max, 80% JPEG quality) |
| Barcode scanning | **PARTIAL** -- `html5-qrcode` is in dependencies but no barcode scanner component was found in src/ |
| SKU generation | Done (`lib/ebay/sku.ts`) |
| Sources management | Done (`api/sources/route.ts`) |

### Phase 2: LLM Listing Generation -- COMPLETE

| Item | Status |
|------|--------|
| Prompt template system (DB-stored) | Done (prompt_templates table, API route, Settings UI) |
| Listing generation API route | Done (`api/listings/generate/route.ts`) |
| Generation UI with preview | Done (`listing-preview.tsx` component) |
| Title optimization (80-char enforcement) | Done |
| Description generation (HTML) | Done |
| Photo-based condition assessment (Claude Vision) | Done (sends up to 4 images as base64) |
| Cost tracking (token usage) | Done (calculates estimated cost per generation) |
| Regenerate/edit flow | Done (via the staging item detail page) |

### Phase 3: Publish to eBay -- COMPLETE (code exists)

| Item | Status |
|------|--------|
| eBay OAuth flow | Done (`lib/ebay/oauth.ts`, `api/ebay/connect/`, `api/ebay/callback/`) |
| Token management with mutex | Done (`lib/ebay/tokens.ts`, `lib/ebay/token-store.ts`) |
| eBay Inventory API (createOrReplace, createOffer, publishOffer) | Done (`lib/ebay/api.ts`) |
| Publish flow API route | Done (`api/ebay/publish/route.ts`) |
| Setup validation (locations, policies) | Done (`lib/ebay/setup.ts`, `api/ebay/setup/route.ts`) |
| Settings page with eBay connection UI | Done (connect, disconnect, setup checks, policy display) |
| Error handling for eBay API errors | Done |
| eBay category mapping | Partial (defaults to 261186, configurable via publish request) |
| "Save to Inventory Only" button | Done (status change to "inventory" via PATCH) |

### Phase 4: Inventory Management -- COMPLETE

| Item | Status |
|------|--------|
| Inventory dashboard with card/table view | Done (`inventory/page.tsx`) |
| Filtering & sorting (condition, status, search) | Done (text search + status filter) |
| Full-text search | Done (searches title, author, ISBN, SKU, source, storage location) |
| Item detail page | Done (reuses `staging/[id]/page.tsx`) |
| Status tracking with badges | Done (staged -> inventory -> listed -> sold -> shipped -> archived) |
| eBay sync (pull status updates) | **NOT DONE** -- no eBay Fulfillment API sync |
| Bulk operations | **NOT DONE** |
| Storage location management | Partial (field exists, searchable, but no dedicated location view) |

### Phase 5: Financial Tracking -- LARGELY COMPLETE

| Item | Status |
|------|--------|
| Per-item financials (COGS, sale price, fees, net profit) | Done |
| P&L dashboard | Done (`financials/page.tsx` -- comprehensive) |
| Source ROI reporting | Done (grouped by source, shows revenue/profit/ROI) |
| Expense tracking (manual entry) | Done (`api/expenses/`, ExpenseManager component) |
| Expense categories | Done |
| Revenue/profit snapshots (monthly, all-time) | Done |
| Average sale price, average profit per sale | Done |
| Missing data quality warnings | Done |
| eBay Fulfillment API integration | **NOT DONE** |
| Tax summaries / CSV export | **NOT DONE** |
| Inventory aging | **NOT DONE** |

### Phase 6: Smart Features -- NOT STARTED
### Phase 7: Multi-Tenancy & SaaS -- NOT STARTED (but data model is tenant-ready)

---

## What Does NOT Exist

1. **Tests** -- zero test files, no test framework installed, `npm run test` script missing
2. **CI/CD** -- no `.github/` directory, no GitHub Actions, no lint-on-push
3. **Barcode scanner UI** -- html5-qrcode is installed but no scanner component was found
4. **Cloudflare R2 integration** -- despite being documented, images use Supabase Storage
5. **eBay sync** -- no pull of listing statuses or completed orders from eBay
6. **Bulk operations** -- no multi-select or batch actions on inventory
7. **Tax summaries / CSV export** -- not implemented
8. **Inventory aging reports** -- not implemented
9. **db:seed script** -- documented but doesn't exist

---

## Does the CLAUDE.md Need Updating?

**Yes.** The following updates are needed:

1. **Next.js version**: Says 15, actually 16.1.6
2. **Storage**: Says Cloudflare R2, but implementation uses Supabase Storage. Either update the docs to reflect reality, or migrate storage to R2.
3. **Design tokens**: Color values in CLAUDE.md don't match `globals.css` (e.g., vault-base, accent color). Update to match actual values.
4. **Commands**: Remove `npm run test` and `npm run db:seed` (they don't exist) or create them.
5. **Missing lib directories**: `lib/financial/` and `lib/inventory/` exist but aren't in the documented structure.
6. **Model reference**: Settings page says "claude-sonnet-4", code uses `claude-sonnet-4-20250514`. Minor but worth noting.

---

## Build Status

Could not run `npm run build` due to shell restrictions. Manual verification recommended. The code reads cleanly and follows Next.js conventions, but compilation status is unknown.

---

## Actual Phase Assessment

| Phase | Roadmap Status | Reality |
|-------|---------------|---------|
| Phase 0 | Should be done | **DONE** (minus CI) |
| Phase 1 | Should be done | **DONE** (minus barcode scanner UI) |
| Phase 2 | Should be done | **DONE** |
| Phase 3 | Should be done | **DONE** (code complete, untested against live eBay) |
| Phase 4 | Should be done | **MOSTLY DONE** (no bulk ops, no eBay sync) |
| Phase 5 | Should be done | **MOSTLY DONE** (no eBay Fulfillment API, no tax/CSV, no aging) |
| Phase 6 | Future | Not started |
| Phase 7 | Future | Not started (data model ready) |

**The project is at: Phase 5, approximately 80% complete.** The core workflow (scan -> stage -> enrich -> generate listing -> publish to eBay -> track financials) is fully implemented in code. The gaps are secondary features (bulk ops, eBay sync, tax export, barcode scanner UI) and operational infrastructure (tests, CI).
