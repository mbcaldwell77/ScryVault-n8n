# eBay Weekly Reporting System — Design Spec

**Date:** 2026-04-27
**Status:** Draft 2 (post-research)
**Research findings:** [`2026-04-27-ebay-weekly-reporting-research.md`](./2026-04-27-ebay-weekly-reporting-research.md)
**Owner:** MBC
**Stack:** n8n + Gemini + ScryVault Supabase
**Build classification:** Internal tooling for Ældern Tomes (per CLAUDE.md build-stance: n8n + Gemini default)

---

## 1. Problem statement

MBC has been running Ældern Tomes on eBay without a structured way to look at performance over time. eBay's seller dashboard shows ad-hoc numbers (last 7 / 31 / 90 days) but doesn't accumulate history he can query, compare year-over-year, or analyze across multiple dimensions. Today's process is "log into Seller Hub and eyeball it" — and at this point, it's not happening at all.

**What success looks like:**

- Every Monday morning, a clean weekly summary email lands in MBC's inbox showing the prior week's numbers + WoW deltas.
- Underlying data accumulates in ScryVault Supabase indefinitely. After a few months, MBC (or Claude on his behalf) can answer questions like "compare this March to last March," "what's my best month ever," "are promoted-listing fees worth it" — directly from SQL, no eBay UI needed.
- Initial backfill loads as much history as eBay's APIs expose so analysis isn't gated on accumulating new data from week-zero.

**Out of scope (deferred):**

- A web UI / dashboard tab in the ScryVault Next.js app
- Cross-population of `inventory_items` per-listing sale fields (`final_value_fee`, `promoted_listing_fee`, etc.) — those columns exist but no workflow currently writes them; deferred to a future "Sales & Profit Dashboard" build
- Anomaly detection / threshold alerts
- Multi-marketplace (Mercari, Amazon, etc.)
- Promoted Listings ROI analysis tools

---

## 2. Requirements

### Functional

| # | Requirement |
|---|---|
| F1 | Weekly recurring n8n workflow runs Monday 07:00 ET, pulls prior week's data, writes Supabase, sends summary email |
| F2 | One-time backfill workflow pulls maximum available history from eBay APIs into Supabase (idempotent — safe to re-run) |
| F3 | Two new Supabase tables: `ebay_weekly_snapshots` (one row per week) and `ebay_transactions` (one row per finance event) |
| F4 | Summary email is HTML-formatted, contains KPI tiles, week-over-week deltas, top 5 items by revenue, and a one-paragraph Gemini-generated narrative |
| F5 | Reuses existing `SUB_Token_Refresher` for OAuth (do not rebuild auth) |
| F6 | Errors route to existing `SUB_Error_Handler` (per n8n-workflows non-negotiable rule #5) |
| F7 | Outbound email goes through a SUB workflow (per n8n-workflows non-negotiable rule #2 — no inline Gmail in MAIN) |

### Non-functional

| # | Requirement |
|---|---|
| N1 | Idempotent: re-running the weekly workflow for the same week MUST NOT duplicate transactions or create a second snapshot row |
| N2 | All AI calls use Gemini 2.5 Flash via existing n8n credential (no Anthropic — MBC has Gemini credits) |
| N3 | Backfill must respect eBay API rate limits (defer to research pass for exact limits) |
| N4 | Token cost: weekly run should be cheap — 1 Gemini call max per execution |
| N5 | Failure mode: on workflow error, email notification fires (via SUB_Error_Handler) and the next Monday's run still works (no state corruption) |

---

## 3. Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   MAIN_eBay_Weekly_Report   (Schedule: Mon 07:00 ET)        │
│   UTIL_eBay_History_Backfill (Manual trigger, paginated)    │
│                                                             │
│            ↓ both call ↓                                    │
│                                                             │
│   ┌────────────────────────┐  ┌────────────────────────┐    │
│   │ SUB_eBay_Finances_     │  │ SUB_eBay_Analytics_    │    │
│   │ Fetch                  │  │ Fetch                  │    │
│   │ in:  date range        │  │ in:  date range        │    │
│   │ out: transactions[]    │  │ out: traffic metrics   │    │
│   └────────────────────────┘  └────────────────────────┘    │
│           ↓                            ↓                    │
│       both call                                             │
│           ↓                                                 │
│   ┌────────────────────────┐                                │
│   │ SUB_Token_Refresher    │   ← EXISTS, working            │
│   └────────────────────────┘                                │
│                                                             │
│   MAIN only:                                                │
│   → write to ebay_weekly_snapshots + ebay_transactions      │
│   → Gemini generates narrative paragraph                    │
│   → SUB_HTML_Email_Sender delivers email                    │
│                                                             │
│   On error:                                                 │
│   → SUB_Error_Handler (EXISTS)                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### New workflows

| Name | Type | Trigger | Purpose |
|---|---|---|---|
| `MAIN_eBay_Weekly_Report` | MAIN | Schedule (cron, Mon 07:00 ET) | Weekly pull + write + email |
| `UTIL_eBay_History_Backfill` | UTIL | Manual | One-time historical load |
| `SUB_eBay_Finances_Fetch` | SUB | Execute Workflow | Reusable Finances API caller |
| `SUB_eBay_Analytics_Fetch` | SUB | Execute Workflow | Reusable Analytics API caller |
| `SUB_HTML_Email_Sender` | SUB | Execute Workflow | Outbound HTML email (replaces/extends stub `SUB_Email_Responder`) |

### Reused workflows

| Name | Status | Role |
|---|---|---|
| `SUB_Token_Refresher` | Existing, working (fixed 2026-04-27) | Provides fresh access token on every fetch call |
| `SUB_Error_Handler` | Existing | Receives error trigger output, alerts MBC |

### Data flow (weekly run)

1. Schedule trigger fires Monday 07:00 ET
2. Set Config: compute date range = prior Monday 00:00 ET → Sunday 23:59 ET, converted to UTC for API calls
3. Call `SUB_eBay_Finances_Fetch` with date range → returns transactions array
4. Call `SUB_eBay_Analytics_Fetch` with date range → returns traffic metrics
5. Code node: aggregate transactions into snapshot row (gross revenue, fees, net, etc.) + compute top-5 items by revenue
6. HTTP: UPSERT `ebay_weekly_snapshots` (key: user_id + week_starting)
7. HTTP: bulk INSERT `ebay_transactions` with ON CONFLICT (user_id, transaction_id) DO UPDATE
8. HTTP: SELECT prior snapshot row to compute WoW deltas
9. Gemini Code node: generate 2-3 sentence narrative ("what stood out this week")
10. Code node: build HTML email body (template literal)
11. `SUB_HTML_Email_Sender` → mbcaldwell77@gmail.com
12. Done

---

## 4. Data model

### 4.1 `ebay_weekly_snapshots`

One row per (user_id, week). Aggregates everything needed for an email + WoW comparison without joining to transactions.

```sql
CREATE TABLE ebay_weekly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Week boundary (ET)
  week_starting DATE NOT NULL,        -- Monday in America/New_York
  week_ending DATE NOT NULL,          -- Sunday in America/New_York

  -- Money (all USD, sourced from Finances API)
  gross_revenue DECIMAL(12,2) DEFAULT 0,    -- sum of SALE transaction amounts
  refunds_amount DECIMAL(12,2) DEFAULT 0,   -- sum of |REFUND| amounts
  ebay_fees DECIMAL(12,2) DEFAULT 0,        -- final_value_fee + insertion + promoted listing
  shipping_costs DECIMAL(12,2) DEFAULT 0,   -- shipping label charges
  taxes_government_fees DECIMAL(12,2) DEFAULT 0,
  net_payout DECIMAL(12,2) DEFAULT 0,       -- gross - fees - refunds - shipping - taxes

  -- Volume
  units_sold INT DEFAULT 0,
  refund_count INT DEFAULT 0,

  -- Traffic (sourced from Analytics API)
  impressions INT DEFAULT 0,
  page_views INT DEFAULT 0,
  click_through_rate DECIMAL(7,5),          -- 0.00200 = 0.2%
  conversion_rate DECIMAL(7,5),

  -- Top items (denormalized for email speed)
  top_items JSONB,                          -- [{title, sku, revenue, units}, ...] up to 5

  -- Audit
  pulled_at TIMESTAMPTZ DEFAULT NOW(),
  source_meta JSONB,                        -- {finances_pages, analytics_period, etc.}

  UNIQUE(user_id, week_starting)
);

CREATE INDEX idx_ebay_snapshots_user_week ON ebay_weekly_snapshots(user_id, week_starting DESC);
```

### 4.2 `ebay_transactions`

One row per finance event from eBay's Finances API. Granular ledger.

```sql
CREATE TABLE ebay_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- eBay identifiers
  transaction_id TEXT NOT NULL,             -- eBay's transactionId (idempotency key)
  transaction_type TEXT NOT NULL,           -- SALE, REFUND, NON_SALE_CHARGE, CREDIT, SHIPPING_LABEL,
                                            -- DISPUTE, TRANSFER, ADJUSTMENT (per Finances API enum)
  order_id TEXT,                            -- eBay orderId (sales/refunds)

  -- Money (signed: positive = credit, negative = debit)
  amount DECIMAL(12,2) NOT NULL,            -- gross amount of this event
  fees DECIMAL(12,2) DEFAULT 0,             -- platform fees on this event (if separately reported)
  net DECIMAL(12,2) NOT NULL,               -- net effect on payout balance
  currency TEXT DEFAULT 'USD',

  -- Item context (when applicable)
  item_id TEXT,                             -- eBay item id (legacyItemId)
  item_title TEXT,
  sku TEXT,                                 -- internal SKU (matchable to inventory_items)
  buyer_username TEXT,

  -- Timing
  transaction_date TIMESTAMPTZ NOT NULL,
  payout_id TEXT,                           -- which payout bundled this event

  -- Audit
  raw JSONB,                                -- full original transaction object from eBay
  pulled_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, transaction_id)
);

CREATE INDEX idx_ebay_tx_user_date ON ebay_transactions(user_id, transaction_date DESC);
CREATE INDEX idx_ebay_tx_order ON ebay_transactions(order_id);
CREATE INDEX idx_ebay_tx_type ON ebay_transactions(user_id, transaction_type);
CREATE INDEX idx_ebay_tx_sku ON ebay_transactions(sku);
```

### 4.3 RLS

Standard ScryVault pattern: row-level security with `auth.uid() = user_id`. n8n writes via service-role key (bypasses RLS).

```sql
ALTER TABLE ebay_weekly_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebay_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own snapshots"
  ON ebay_weekly_snapshots FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users read own transactions"
  ON ebay_transactions FOR SELECT USING (auth.uid() = user_id);
```

Migration filename: `005_ebay_reporting.sql`.

---

## 5. Workflow specifications

### 5.1 `MAIN_eBay_Weekly_Report`

**Trigger:** Schedule node — `0 7 * * 1` (Mondays 07:00 in n8n's TZ; n8n VPS is UTC, so cron expression must convert ET→UTC: 07:00 ET = 11:00 UTC during DST, 12:00 UTC otherwise. Use `0 11 * * 1` and accept ±1hr drift across DST transitions, OR set TZ on Schedule node to `America/New_York`.)

**Resolution:** set Schedule node timezone to `America/New_York`, cron `0 7 * * 1` — n8n handles DST.

**Flow:**

```
Schedule Trigger (Mon 07:00 ET)
    ↓
Set Config (compute prior-week date range in UTC)
    ↓
Execute Workflow → SUB_eBay_Finances_Fetch  (in: dateRange)
    ↓
Execute Workflow → SUB_eBay_Analytics_Fetch (in: dateRange)
    ↓
Code: "Build Snapshot" — aggregate transactions, compute top-5 items
    ↓
HTTP Request: UPSERT ebay_weekly_snapshots
    ↓
HTTP Request: Bulk INSERT ebay_transactions ON CONFLICT DO UPDATE
    ↓
HTTP Request: SELECT prior snapshot for WoW delta
    ↓
Code: "Compute Deltas"
    ↓
Google Gemini: generate "what stood out" paragraph
    ↓
Code: "Build HTML Email" — template literal with KPI tiles
    ↓
Execute Workflow → SUB_HTML_Email_Sender
    ↓
Done

(Error Trigger → SUB_Error_Handler)
```

**Stickies (4-6 per non-negotiable rule):**

1. **ROI Overview** (blue, top-left, H2): client-facing summary
2. **Section: Fetch Data** (over Set Config + 2 SUB calls)
3. **Section: Aggregate & Persist** (over Build Snapshot + Supabase writes)
4. **Section: Notify** (over Compute Deltas + Gemini + Build HTML + Email SUB)
5. **Error Handler** (yellow, over Error Trigger + handler)

### 5.2 `UTIL_eBay_History_Backfill`

**Trigger:** Manual.

**Flow:**

```
Manual Trigger
    ↓
Set Config (start_date = max history available, end_date = today)
    ↓
Code: "Generate Week Ranges" — produce array of {week_starting, week_ending} pairs
    ↓
SplitInBatches (batch=1, to throttle API)
    ↓
Execute Workflow → SUB_eBay_Finances_Fetch (one week)
    ↓
Execute Workflow → SUB_eBay_Analytics_Fetch (one week)
    ↓
Code: "Build Snapshot" (same logic as MAIN)
    ↓
HTTP: UPSERT snapshot + bulk INSERT transactions (idempotent)
    ↓
Loop (back to SplitInBatches) until done
    ↓
Code: "Summarize Backfill" (count weeks, count transactions, etc.)
    ↓
Execute Workflow → SUB_HTML_Email_Sender (single completion email)
    ↓
Done

(Error Trigger → SUB_Error_Handler)
```

**Why per-week loop instead of one big date range:** chunking by week makes failures recoverable (failed week doesn't poison the entire backfill — re-run picks up where it left off thanks to UPSERT idempotency).

**Refinement post-research:**
- Finances API: pull per-week (matches snapshot grain, well under any 5yr cap)
- Analytics API: pull in 90-day chunks (max per-request span), then split daily rows into per-week buckets server-side (in `Build Snapshot` Code node). 2-year backfill = ~9 Analytics calls instead of 104 — saves time and quota.
- Total backfill scope: ~104 Finances calls + ~9 Analytics calls + ~104 Supabase upserts = manageable in under an hour with 2-second waits between API calls.

### 5.3 `SUB_eBay_Finances_Fetch`

**Inputs:** `{ startDate: ISO8601, endDate: ISO8601 }`
**Outputs:** `{ transactions: [...], total: N, currency: "USD" }`

**Flow:**

```
Execute Workflow Trigger
    ↓
Execute Workflow → SUB_Token_Refresher (gets fresh access_token)
    ↓
HTTP Request: GET https://api.ebay.com/sell/finances/v1/transaction
              ?filter=transactionDate:[{startDate}..{endDate}]
              &limit=1000
              Authorization: Bearer {{accessToken}}
              (Retry on Fail: 3 tries, 2000ms wait — per non-negotiable rule #13)
    ↓
Code: "Paginate" — if response.next is present, follow it until exhausted
    ↓
Code: "Normalize" — flatten eBay's Transaction objects into our schema
    ↓
Return
```

**Confirmed via research (Pass 2):**
- Endpoint host is `api.ebay.com` (not `apiz.ebay.com`)
- Filter syntax: `transactionDate:[ISO8601..ISO8601]`
- Up to ~5 years of history available with explicit start/end dates
- Required scope `sell.finances` is present on the active token
- TransactionType enum: SALE, REFUND, CREDIT, NON_SALE_CHARGE (incl. Promoted Listing fees), DISPUTE, SHIPPING_LABEL, TRANSFER

### 5.4 `SUB_eBay_Analytics_Fetch`

**Inputs:** `{ startDate: YYYYMMDD, endDate: YYYYMMDD }` (max 90-day span per call)
**Outputs:** `{ impressions, page_views, click_through_rate, conversion_rate, daily_rows: [...] }`

**Flow:**

```
Execute Workflow Trigger
    ↓
Execute Workflow → SUB_Token_Refresher
    ↓
HTTP Request: GET https://api.ebay.com/sell/analytics/v1/traffic_report
              ?marketplace_ids=EBAY_US
              &dimension=DAY
              &date_range=[{startDate}..{endDate}]
              &metric=TOTAL_IMPRESSION_TOTAL,LISTING_PAGE_VIEW_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE
              Authorization: Bearer {{accessToken}}
              (Retry on Fail: 3 tries, 2000ms wait)
    ↓
Code: "Normalize" — collapse daily rows into weekly aggregate; return daily rows for snapshot.source_meta
    ↓
Return
```

**Confirmed via research (Pass 2):**
- Endpoint is `getTrafficReport` (NOT `seller_standards_profile` — that's a separate endpoint for performance grades)
- Max 90-day span per request, max 2-year lookback total
- Date format: `YYYYMMDD..YYYYMMDD` (LA timezone) or ISO with offset
- Required scope `sell.analytics.readonly` is present on the active token

**Caveat:** numbers may be close-to-but-not-bit-identical to the seller-hub Performance UI. Acceptable since we own the canonical history once data starts accumulating.

### 5.5 `SUB_HTML_Email_Sender`

**Inputs:** `{ to, subject, htmlBody }`
**Outputs:** `{ status: 'sent' | 'failed', messageId? }`

**Flow:**

```
Execute Workflow Trigger
    ↓
Gmail node: Send (HTML mode)
    - Auth: existing Gmail credential
    - Append n8n attribution: DISABLED (per non-negotiable rule #11)
    - Retry on Fail: 3 tries
    ↓
Set: return { status: 'sent', messageId: $json.id }
    ↓
Return
```

**Note:** existing `SUB_Email_Responder` is "stub" status. We will either complete it or fork a focused `SUB_HTML_Email_Sender` — final call deferred to writing-plans pass after reviewing what's already in `SUB_Email_Responder`.

---

## 6. Email format

### Layout (HTML, mobile-friendly, 600px wide)

```
┌──────────────────────────────────────────┐
│   Ældern Tomes — Week of Apr 21–27       │
├──────────────────────────────────────────┤
│   [What Stood Out — 2-3 sentence narrative
│   from Gemini, e.g. "Solid week. Revenue
│   up 12% WoW driven by 3 high-margin
│   omnibus sales. Promoted-listing fees
│   crept up to 18% of revenue — worth
│   watching."]
├──────────────────────────────────────────┤
│   ┌────────┐ ┌────────┐ ┌────────┐       │
│   │GROSS   │ │UNITS   │ │NET     │       │
│   │$510.01 │ │  12    │ │$314.45 │       │
│   │▲ 12%   │ │▼ 2     │ │▲ 8%    │       │
│   └────────┘ └────────┘ └────────┘       │
├──────────────────────────────────────────┤
│   Top Sellers This Week                  │
│   1. Riyria Chronicles HC — $73 (1)      │
│   2. ...                                 │
├──────────────────────────────────────────┤
│   Traffic                                │
│   Impressions: 230K (▼ 3%)              │
│   Page Views: 612 (▼ 32%)                │
│   Conversion: 1.5% (▲ 0.4 pts)          │
├──────────────────────────────────────────┤
│   [Footer: pulled at, query Supabase     │
│    with `select * from ebay_weekly_      │
│    snapshots order by week_starting`]    │
└──────────────────────────────────────────┘
```

### Why HTML email (not plain text or Markdown)

Per `feedback_human_facing_format.md`: reports MBC will READ render as HTML, never raw markdown. The KPI tiles + WoW deltas need visual hierarchy that Markdown clients render inconsistently.

### Why one Gemini paragraph (not a longer narrative)

Token discipline (CLAUDE.md). One paragraph is enough to flag what's anomalous; the numbers carry the rest. Pinning the paragraph to "what stood out" keeps Gemini focused — long narratives drift into vagueness.

---

## 7. Edge cases & decisions

| Decision | Reasoning |
|---|---|
| Week boundary in ET, not PT (eBay's tz) | MBC operates in ET — emails read more naturally. Numbers will differ slightly from eBay's "Last 7 days" UI, which is acceptable; we own the canonical history. |
| Refunds tracked as negative-amount transactions in `ebay_transactions`, plus a separate `refunds_amount` column on `ebay_weekly_snapshots` | Granularity at transaction level + denormalized aggregate at snapshot level for email speed |
| Backfill uses per-week loop (not one big range) | Recoverable on partial failure — re-run picks up where it left off via UPSERT |
| Single user_id for now (MBC's ScryVault account `715aaa28-...`) | Multi-tenant via RLS already; no extra wiring needed |
| Top-5 items denormalized into snapshot.top_items JSONB | Email rendering doesn't need to query transactions; one Supabase read serves the full email |
| Gemini call wrapped in JSON-parse Code node per CLAUDE.md gotcha | n8n Gemini "Output as JSON" toggle is unreliable; always parse manually |
| n8n Gemini node uses flattened user message (system + user combined) | Per n8n-workflows CLAUDE.md gotcha — separate system messages get silently stripped |
| All HTTP nodes have `retryOnFail: true, maxTries: 3, waitBetweenTries: 2000` | Per non-negotiable rule #13 — applies to eBay APIs and Supabase HTTP calls |

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| eBay Finances API may not actually expose 2 years of history (default is 90 days, max varies) | **Pass 2 research will confirm.** If actual ceiling < 1 year, document and accept; baseline grows naturally from week-zero. |
| Analytics API may require specific date-range format that doesn't match per-week granularity | Research pass to confirm. May need to pull traffic monthly + interpolate weekly (acceptable approximation). |
| eBay throttles aggressive backfill | Rate-limit research deferred to Pass 2. Per-week loop with optional throttle delay between iterations. |
| `SUB_Email_Responder` stub blocks email delivery | Decision in writing-plans: either complete it or build focused `SUB_HTML_Email_Sender`. Either way, this is in scope. |
| OAuth scope `sell.finances` already granted? Confirmed YES — verified in token row scopes during this session. | None — already validated. |
| Workflow runs Monday before token refresh schedule? | `SUB_Token_Refresher` runs every 15 min — token will be fresh. |
| Backfill collides with weekly cron (both running same data) | UPSERT idempotency makes this safe. |

---

## 9. Component boundaries (per brainstorming skill: design for isolation)

| Unit | Purpose | Inputs | Outputs | Dependencies |
|---|---|---|---|---|
| Migration `005_ebay_reporting.sql` | DB schema | n/a | 2 tables, indexes, RLS policies | Supabase connection |
| `SUB_eBay_Finances_Fetch` | Get transactions for date range | dateRange | normalized transactions[] | SUB_Token_Refresher, eBay Finances API |
| `SUB_eBay_Analytics_Fetch` | Get traffic for date range | dateRange | traffic metrics object | SUB_Token_Refresher, eBay Analytics API |
| `SUB_HTML_Email_Sender` | Send one HTML email | {to, subject, htmlBody} | {status, messageId?} | Gmail credential |
| `MAIN_eBay_Weekly_Report` | Orchestrate weekly run | n/a (scheduled) | side effects: DB writes + email | all SUBs above |
| `UTIL_eBay_History_Backfill` | One-time historical load | n/a (manual) | side effects: DB writes + summary email | all SUBs above |

Each can be tested independently:
- SUB fetchers: input a hard-coded date range, verify shape of return
- SUB email sender: input a hard-coded HTML body, verify delivery
- MAIN/UTIL: integration test with stub SUBs (or run end-to-end against real eBay sandbox if available)

---

## 10. Decisions for MBC (when he returns)

These are calls I made under autonomy authorization. He can reverse any of them.

1. **Two new tables (`ebay_weekly_snapshots` + `ebay_transactions`), not extending `inventory_items`** — keeps reporting orthogonal to inventory; cross-population deferred.
2. **Build separate `SUB_HTML_Email_Sender`** instead of completing existing stub `SUB_Email_Responder` — focused single-purpose SUB is cleaner. Reversible if MBC prefers consolidation.
3. **Week boundary in ET** (not PT/eBay's tz). Causes ~3-hour misalignment with eBay UI numbers. Acceptable.
4. **One Gemini call per email**, 2-3 sentence "what stood out" — keeps cost low. Reversible to no-AI plain template if Gemini is too noisy.
5. **Backfill loops per-week**, not one massive call. Slower but recoverable.
6. **Spec lives in `scryvault-n8n/docs/superpowers/specs/`** (data lives in scryvault Supabase; the workflows are the build, but the data domain owns the spec).

---

## 11. Open questions

### Resolved by Pass 2 research

- ✅ **Finances API max history:** ~5 years with explicit start+end date filter (90 days default if end omitted)
- ✅ **Correct Analytics endpoint:** `getTrafficReport` at `https://api.ebay.com/sell/analytics/v1/traffic_report`, daily granularity, max 90-day span per request, max 2-year lookback
- ✅ **Promoted listing fees:** reported as `transactionType=NON_SALE_CHARGE` with `transactionMemo` indicating fee type — separate from SALE events

### Deferred to runtime (empirical resolution acceptable)

- **Exact daily call quotas** for `getTransactions` and `getTrafficReport` — defer to runtime. Backfill plan uses 2-second waits + chunked calls; if throttled, add backoff. Can query `getRateLimits` API to inspect remaining quota.
- **Item title / SKU enrichment in Transaction objects** — first execution will reveal whether fields are present. If not, add a follow-up `SUB_eBay_Order_Enrich` that calls `getOrders` for item details. Spec keeps `item_title` and `sku` in the schema as nullable; populate when available.
- **Whether `getTrafficReport` numbers exactly match the seller-hub UI** — accept slight variance; we own the canonical history going forward.

---

## 12. Spec self-review (against brainstorming checklist)

| Check | Status |
|---|---|
| Placeholders / TBDs | Present and labeled — Pass 2 research will resolve API specifics. Acceptable for design phase; will be removed before writing-plans. |
| Internal consistency | Schema, workflows, and email format align. Top-5 items denormalized in snapshot consistent with email rendering. |
| Scope check | Single implementation plan: 1 migration + 5 new workflows + extensions to 1 existing SUB chain. Manageable. |
| Ambiguity | Email send SUB choice flagged as "decision in writing-plans" — explicit, not hidden. |

---

## 13. Brainstorming pass notes

This spec was produced under autonomy authorization (MBC stepped away mid-session, asked Claude to "use your own recommendations for everything, do as much as you can"). The brainstorming skill's normal "ask one question at a time" flow was collapsed into "make defensible decisions, document them, MBC reviews the package."

Decisions table at §10 is the contract — each decision has a stated reasoning and is reversible if MBC objects.

Pass 2 (research) will hit eBay developer docs to resolve §11 open questions. Spec will be revised post-research before writing-plans is invoked.
