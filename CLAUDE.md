# ScryVault n8n Edition

The n8n edition of ScryVault. This app is the **UI + database layer** only. All business logic lives in n8n workflows.

## Architecture

```
ScryVault n8n (this repo)          n8n Workflows
=============================      =============================
Next.js frontend (UI)        --->  ISBN Lookup workflow
Supabase database (storage)  <---  Listing Generation workflow
Supabase Auth (auth)          -->  eBay Publish workflow
API routes (thin proxies)     -->  Monitoring & Analytics workflows
```

- **This app** handles: user auth, UI rendering, Supabase reads/writes, input validation, image uploads
- **n8n** handles: Google Books API, Claude AI listing generation, eBay Inventory API, error monitoring, analytics

## n8n Workflow Map

| Feature | n8n Webhook Path | What It Does |
|---------|-----------------|--------------|
| ISBN Lookup | `POST /webhook/books/lookup` | Receives `{ isbn }`, calls Google Books API, returns `BookMetadata` |
| Listing Generation | `POST /webhook/listings/generate` | Receives book + condition data, calls Claude API with vision, returns generated listing |
| eBay Publish | `POST /webhook/ebay/publish` | Receives item data, handles eBay OAuth tokens, creates inventory item + offer, publishes, updates Supabase |

Each workflow writes results back to the same Supabase tables that the UI reads from.

## Tech Stack

- **Framework**: Next.js 16 (App Router) -- `next@16.1.6`
- **Language**: TypeScript (strict mode)
- **Database**: Supabase (PostgreSQL + Auth)
- **Storage**: Supabase Storage (`book-images` bucket via `lib/storage/book-images.ts`)
- **Hosting**: Vercel
- **Business Logic**: n8n workflows (via webhook integration)
- **Styling**: Tailwind CSS v4
- **Package Manager**: npm

## Project Structure

```
src/
  app/              # Next.js App Router pages & API routes
    (auth)/         # Auth pages (login, register)
    (dashboard)/    # Authenticated app pages (dashboard, staging, inventory, financials, settings)
    api/            # API route handlers -- thin proxies to n8n webhooks
  components/
    ui/             # Reusable design system components
    features/       # Feature-specific components
  lib/
    n8n/            # n8n webhook client (callN8nWebhook helper)
    db/             # Supabase clients (browser, server, middleware, admin)
    ebay/           # eBay OAuth flow only (tokens stored in Supabase for n8n to use)
    claude/         # Types only (GeneratedListing, GenerationResult) -- no API calls
    books/          # Types only (BookMetadata) -- no API calls
    storage/        # Image upload (Supabase Storage) + client-side compression
    financial/      # Financial constants & queries
    inventory/      # Inventory queries
    utils/          # Shared utilities (cn, date)
  types/            # Global TypeScript types
```

## Key Differences from ScryVault (non-n8n)

| Concern | ScryVault | ScryVault n8n Edition |
|---------|-----------|----------------------|
| ISBN Lookup | Direct Google Books API call | n8n webhook |
| Listing Generation | Direct Anthropic Claude API call | n8n webhook |
| eBay Publishing | Direct eBay Inventory API calls | n8n webhook |
| ANTHROPIC_API_KEY | Required in .env.local | Not needed (n8n has it) |
| GOOGLE_BOOKS_API_KEY | Required in .env.local | Not needed (n8n has it) |
| Error monitoring | Console.error only | n8n error handling branches + notifications |
| `@anthropic-ai/sdk` | In package.json | Removed |

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
| `N8N_WEBHOOK_BASE_URL` | Base URL for n8n webhooks (default: `http://localhost:5678/webhook`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (server-side only) |
| `EBAY_CLIENT_ID` | eBay app client ID (for OAuth callback) |
| `EBAY_CLIENT_SECRET` | eBay app client secret (for OAuth callback) |
| `EBAY_REDIRECT_URI` | eBay OAuth redirect URI |

## Design System

Dark glassmorphism theme. All colors/tokens defined in Tailwind config. Identical to the non-n8n ScryVault.

### Tokens

| Token             | Value                        | Usage                     |
|-------------------|------------------------------|---------------------------|
| `bg-vault-base`   | `#111513`                    | Page background           |
| `bg-vault-surface`| `#1a221d`                    | Card/panel background     |
| `bg-vault-panel`  | `#222b26`                    | Elevated panel background |
| `accent`          | `#43D5B0`                    | Primary actions, links    |
| `accent-dark`     | `#32ba98`                    | Hover state for accent    |
| `text-primary`    | `#ffffff`                    | Primary text              |
| `text-muted`      | `#8b9a92`                    | Secondary/label text      |

## Coding Conventions

- Named exports, no default exports (except pages)
- Colocate types with their module; shared types go in `src/types/`
- Server Components by default; add `"use client"` only when needed
- All API routes return typed JSON responses with consistent error shape
- API routes are thin proxies: validate input, call n8n, return response
- Environment variables: prefixed `NEXT_PUBLIC_` only for client-safe values
- No hardcoded secrets -- everything via `.env.local`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`

## Portfolio Context

This is the n8n edition, built as a portfolio piece for Automatonic. It demonstrates the separation of concerns pattern: pretty frontend + robust n8n backend. The non-n8n ScryVault is the production app for Aeldern Tomes.
