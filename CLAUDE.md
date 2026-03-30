# ScryVault

Collectible book inventory & eBay listing SaaS for booksellers.

## Tech Stack

- **Framework**: Next.js 16 (App Router) — `next@16.1.6`
- **Language**: TypeScript (strict mode)
- **Database**: Supabase (PostgreSQL + Auth)
- **Storage**: Supabase Storage (`book-images` bucket via `lib/storage/book-images.ts`)
- **Hosting**: Vercel
- **LLM**: Anthropic Claude API (`claude-sonnet-4-20250514` — listing generation + vision)
- **Styling**: Tailwind CSS v4
- **Package Manager**: npm

## Project Structure

```
src/
  app/              # Next.js App Router pages & API routes
    (auth)/         # Auth pages (login, register)
    (dashboard)/    # Authenticated app pages (dashboard, staging, inventory, financials, settings)
    api/            # API route handlers (books, sources, inventory, listings, ebay, prompt-templates, expenses, images)
  components/
    ui/             # Reusable design system components (glass-panel, button, input, badge, modal, logo, toast-provider, book-cover-image)
    features/       # Feature-specific components (sidebar, staged-item-card, add-book-modal, image-uploader, listing-preview, expense-manager)
  lib/
    db/             # Supabase clients (browser, server, middleware, admin)
    ebay/           # eBay API integration (OAuth, tokens, inventory API, SKU generation, setup)
    claude/         # Anthropic API integration (client, prompts, generate-listing, types)
    books/          # ISBN lookup via Google Books API
    storage/        # Image upload (Supabase Storage) + client-side compression
    financial/      # Financial constants & queries
    inventory/      # Inventory queries
    utils/          # Shared utilities (cn, date)
  types/            # Global TypeScript types (index, books)
```

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npm run db:migrate   # Run database migrations (supabase db push --linked)
```

## Environment Variables (`.env.local`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (server-side only) |
| `ANTHROPIC_API_KEY` | Claude API for listing generation + vision |
| `EBAY_CLIENT_ID` | eBay app client ID |
| `EBAY_CLIENT_SECRET` | eBay app client secret |
| `EBAY_REDIRECT_URI` | eBay OAuth redirect URI |

## Design System

Dark glassmorphism theme. All colors/tokens defined in Tailwind config.

### Tokens

| Token             | Value                        | Usage                     |
|-------------------|------------------------------|---------------------------|
| `bg-vault-base`   | `#111513`                    | Page background           |
| `bg-vault-surface`| `#1a221d`                    | Card/panel background     |
| `bg-vault-panel`  | `#222b26`                    | Elevated panel background |
| `accent`          | `#43D5B0`                    | Primary actions, links    |
| `accent-dark`     | `#32ba98`                    | Hover state for accent    |
| `accent-glow`     | `rgba(67, 213, 176, 0.2)`   | Glow/shadow effect        |
| `text-primary`    | `#ffffff`                    | Primary text              |
| `text-muted`      | `#8b9a92`                    | Secondary/label text      |
| `border-glass`    | `rgba(255, 255, 255, 0.08)`  | Glass panel borders       |
| `glass-blur`      | `backdrop-blur-xl`           | Frosted glass effect      |

### Glass Panel Pattern

```tsx
<div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-lg">
  {children}
</div>
```

## Coding Conventions

- Named exports, no default exports (except pages)
- Colocate types with their module; shared types go in `src/types/`
- Server Components by default; add `"use client"` only when needed
- All API routes return typed JSON responses with consistent error shape
- Environment variables: prefixed `NEXT_PUBLIC_` only for client-safe values
- No hardcoded secrets — everything via `.env.local`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- All database tables include `user_id` column for future multi-tenancy

## eBay API Notes

- Inventory API is the primary integration (not Trading API)
- Listings created via Inventory API can ONLY be managed via API
- No "draft" support in eBay — ScryVault IS the draft system
- OAuth authorization code grant flow required for seller actions
- Required scopes: `sell.inventory`, `sell.fulfillment`, `sell.account`
- Must create at least one inventory location before publishing

## Key Decisions

- Supabase chosen for DB + Auth + Storage (book-images bucket). Images uploaded via Supabase Storage client, served to eBay via public URLs.
- Barcode scanning prioritizes mobile web (PWA camera) but supports physical USB scanners.
- SKUs are strictly formatted as `[WEB?-][FORMAT]-[1ST_ED?]-[TITLE_SNIPPET]` and generated at the end of the intake flow. Claude Vision can be used to scan copyright pages for number lines to toggle the 1st Edition flag.
- Database uses a relational catalog (`books_catalog`) and physical entity (`inventory_items` with a `status` enum) pattern rather than moving items between tables.
- eBay access tokens implement a mutex/lock to prevent concurrent refresh-token invalidation.
- Single-user build first, tenant-aware data model from day one

## Project Status

Phase 5 (Financial Tracking) is roughly 80% complete. Phases 0-4 are code-complete. The core workflow (scan -> stage -> enrich -> generate listing -> publish to eBay -> track financials) is fully implemented.

### Known gaps
- No tests, no CI/CD
- Barcode scanner: `html5-qrcode` installed but no scanner component built
- No eBay Fulfillment API sync (pull listing statuses / completed orders)
- No bulk operations on inventory
- No tax summaries, CSV export, or inventory aging reports
- Phase 6 (Smart Features) and Phase 7 (Multi-Tenancy SaaS) not started
