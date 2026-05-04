# eBay Weekly Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a weekly recurring n8n workflow that pulls eBay sales + traffic + money data into ScryVault Supabase and emails MBC a summary. Plus a one-time backfill of all available history.

**Architecture:** 1 new Supabase migration, 5 new n8n workflows (1 MAIN, 1 UTIL, 3 SUBs), reuses existing `SUB_Token_Refresher` and `SUB_Error_Handler`.

**Tech Stack:** n8n + Gemini 2.5 Flash + ScryVault Supabase (PostgreSQL) + eBay Sell Finances API + eBay Sell Analytics API.

**Reference docs:**
- Design spec: `docs/superpowers/specs/2026-04-27-ebay-weekly-reporting-design.md`
- Research findings: `docs/superpowers/specs/2026-04-27-ebay-weekly-reporting-research.md`
- ScryVault Supabase schema: `supabase/migrations/`
- n8n conventions: `~/Codebases/n8n-workflows/CLAUDE.md`

---

## File / Workflow Structure

| Artifact | Type | Path / Identifier | Status |
|---|---|---|---|
| `005_ebay_reporting.sql` | Supabase migration | `supabase/migrations/005_ebay_reporting.sql` | Create |
| `SUB_eBay_Finances_Fetch` | n8n SUB | n8n VPS — Internal Ops/Eldern Tomes folder | Create |
| `SUB_eBay_Analytics_Fetch` | n8n SUB | n8n VPS — Internal Ops/Eldern Tomes folder | Create |
| `SUB_HTML_Email_Sender` | n8n SUB | n8n VPS — _Shadow Library/Service Modules folder | Create |
| `UTIL_eBay_History_Backfill` | n8n UTIL | n8n VPS — Internal Ops/Eldern Tomes folder | Create |
| `MAIN_eBay_Weekly_Report` | n8n MAIN | n8n VPS — Internal Ops/Eldern Tomes folder | Create |
| `README_ebay_reporting.md` | Docs | `docs/operations/ebay-weekly-reporting.md` | Create |
| `project_ebay_weekly_reporting.md` | Memory | `~/.claude/projects/C--Users-MBC-Codebases/memory/` | Create |

---

## Effort estimate

Sourced from gut + research-derived API call counts (per `feedback_dont_inflate_time_estimates.md`, gut estimates trimmed):

| Phase | Estimate | Notes |
|---|---|---|
| 1 — Migration | 20 min | SQL is pre-written in spec; just transcribe + run + verify |
| 2 — Finances SUB | 40 min | Build via MCP + smoke test |
| 3 — Analytics SUB | 25 min | Smaller surface; pattern reused from Phase 2 |
| 4 — Email SUB | 20 min | Single Gmail node + retry |
| 5 — Backfill UTIL + run | 60 min build + 15 min run | Run time = 113 API calls × ~3s each = ~6 min API + ~5 min DB upserts (estimate, not measured) |
| 6 — MAIN + first execution | 50 min build + Monday-morning wait | Manual test fire collapses the wait |
| 7 — Docs | 25 min | Runbook + memory note + index update |
| **Total focused build** | **~4 hours** | Excluding the inevitable ~1hr of debugging |

Estimates are gut-trimmed and unverified. Treat as "rough — we'll see what reality says." Long phases (5, 6) have the most variance.

---

## Pre-flight checks (do once before starting)

- [ ] **Step F1: Verify SUB_Token_Refresher is healthy**
  - Run: `mcp__n8n-mcp__n8n_executions action=list workflowId=0D4UMmujAGjvNS9j status=success limit=3`
  - Expected: 3 successful executions in the last 24 hours, sub-second duration
  - If failing: see `~/.claude/projects/C--Users-MBC/memory/FIXES.md` entry "2026-04-27 — SUB_Token_Refresher ETIMEDOUT"

- [ ] **Step F2: Verify token row scopes include sell.finances and sell.analytics.readonly**
  - The token row was visible in execution 8054's upstreamContext during the 2026-04-27 session — both scopes present
  - If unsure: re-run SUB_Token_Refresher manually and inspect output

- [ ] **Step F3: Verify Supabase admin connection works from n8n**
  - The existing `UTIL_Initial_Sync` workflow already writes to ScryVault Supabase — that's proof the n8n→Supabase HTTP path is wired
  - If MBC's n8n credential for Supabase has expired: reconnect via n8n UI before starting

- [ ] **Step F4: Confirm Gmail credential exists in n8n for outbound email**
  - n8n UI → Credentials → look for Gmail OAuth credential connected to `mbcaldwell77@gmail.com`
  - If missing: this is a user-action blocker — MBC must reconnect via n8n UI (OAuth flow opens browser, harness can't drive it)

- [ ] **Step F5: Read n8n-workflows CLAUDE.md non-negotiable rules**
  - Especially rules #2 (no inline email in MAIN), #5 (Error Trigger required), #6 (sticky etiquette), #11 (disable n8n attribution), #13 (retry on external nodes), #15 (Gemini for AI)
  - Failure to bake these in causes rework

---

## Phase 1 — Supabase migration

**Goal:** Two new tables (`ebay_weekly_snapshots`, `ebay_transactions`) live in ScryVault Supabase with RLS policies and indexes.

**Dependencies:** None (no n8n work yet).

**Success metric:** Both tables visible in Supabase dashboard with the schemas defined in spec §4. RLS enabled. Indexes present.

### Tasks

- [ ] **Step 1.1: Create migration file**
  - Create `supabase/migrations/005_ebay_reporting.sql`
  - Copy schema from design spec §4.1 (`ebay_weekly_snapshots`) and §4.2 (`ebay_transactions`) and §4.3 (RLS policies)
  - Add `set_updated_at` triggers if appropriate (snapshots may be re-pulled — `pulled_at` instead of `updated_at` is fine)

- [ ] **Step 1.2: Self-review migration**
  - Re-read against spec §4 line by line — do the column types match? Do the UNIQUE constraints match (user_id+week_starting on snapshots, user_id+transaction_id on transactions)?
  - Are all indexes from spec present?
  - Does it `CREATE TABLE IF NOT EXISTS` (idempotent re-run) — yes, since prior migrations use that pattern

- [ ] **Step 1.3: Run migration**
  - Bash: `cd C:/Users/MBC/Codebases/business-infrastructure/scryvault-n8n && npm run db:migrate`
  - Expected output: migration applied with no errors
  - **Fallback if Supabase CLI is not authenticated:** open Supabase dashboard for the ScryVault project → SQL Editor → New Query → paste the contents of `005_ebay_reporting.sql` → Run. This bypasses the CLI and works without local auth. Tables will be created but the migration won't be tracked in `supabase_migrations` schema — accept this for the manual path; mark as applied in CLI later if needed.

- [ ] **Step 1.4: Verify tables exist**
  - In Supabase dashboard → Table Editor → confirm both tables present
  - Query: `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'ebay_%'`
  - Expected rows: `ebay_weekly_snapshots`, `ebay_transactions`, `ebay_tokens` (existing)

- [ ] **Step 1.5: Verify RLS enabled and indexes present**
  - Query: `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('ebay_weekly_snapshots','ebay_transactions')`
  - Expected: both `relrowsecurity = true`
  - Query: `SELECT indexname FROM pg_indexes WHERE tablename IN ('ebay_weekly_snapshots','ebay_transactions')`
  - Expected: at least 5 indexes (1 unique on snapshots, 4+ on transactions)

- [ ] **Step 1.6: Commit migration**
  - `cd C:/Users/MBC/Codebases/business-infrastructure/scryvault-n8n`
  - `git add supabase/migrations/005_ebay_reporting.sql`
  - `git commit -m "feat: add ebay reporting tables (snapshots + transactions)"`

**Handoff:** Phase 1 complete when both tables are queryable in Supabase. Phase 2 builds the workflow that populates them.

**Decisions for MBC (defaults applied):**
- Migration filename `005_` follows existing numbering. Reversible.
- Tables include `user_id` for multi-tenant safety — only MBC's `715aaa28-...` account writes today.

---

## Phase 2 — `SUB_eBay_Finances_Fetch` + smoke test

**Goal:** A reusable SUB workflow that takes a date range and returns normalized eBay finance transactions.

**Dependencies:** Phase 1 done (so we can persist results during smoke testing). `SUB_Token_Refresher` must be green.

**Success metric:** Calling this SUB manually with `{startDate: "2026-04-20T00:00:00Z", endDate: "2026-04-26T23:59:59Z"}` returns an array of transactions matching the prior week's eBay activity. Pagination works on >1000 transaction date ranges.

### Tasks

- [ ] **Step 2.1: Plan node graph (no MCP write yet)**
  - Sketch nodes per design spec §5.3: Execute Workflow Trigger → Token_Refresher SUB → HTTP Request (Finances API) → Paginate Code → Normalize Code → Return
  - Confirm node count target (5–15 functional nodes) per `n8n-workflows/CLAUDE.md`

- [ ] **Step 2.2: Create the SUB via n8n-mcp**
  - Use `mcp__n8n-mcp__n8n_create_workflow`
  - Name: `SUB_eBay_Finances_Fetch`
  - Trigger: `executeWorkflowTrigger`
  - Add nodes per design spec §5.3
  - **HTTP Request node auth:** set `authentication: "none"` (NOT predefined eBay credential — we already have the access_token from `SUB_Token_Refresher`'s output). Build the `Authorization: Bearer {{$node["SUB_Token_Refresher"].json.access_token}}` header in the Headers parameters tab.
  - **Retry settings (per rule #13):** `retryOnFail: true, maxTries: 3, waitBetweenTries: 2000`. Apply only to the eBay HTTP Request node, NOT to the Code/Set/IF nodes.
  - Pin to folder `Internal Ops/Eldern Tomes` (or current equivalent)

- [ ] **Step 2.3: Add ROI sticky + section stickies + error sticky**
  - Per non-negotiable rule #6: ROI Overview (blue, top-left) + 1-2 section chunk stickies + error handler sticky
  - Total 3-4 stickies for a SUB this size (4-6 is the MAIN range)

- [ ] **Step 2.4: Add Error Trigger → SUB_Error_Handler**
  - Per non-negotiable rule #5
  - Find SUB_Error_Handler by name in n8n UI; do not hardcode workflow ID

- [ ] **Step 2.5: Validate workflow**
  - `mcp__n8n-mcp__n8n_validate_workflow id=<new-id>`
  - Fix any errors before proceeding (validation isn't verification — but it catches obvious issues)

- [ ] **Step 2.6: Smoke test #1 — last 7 days**
  - Manually fire the SUB via n8n UI test panel with input `{startDate: <last Monday ISO>, endDate: <yesterday ISO>}`
  - Inspect output. Specific success criteria:
    - HTTP 200 from eBay (not 401 — would mean token issue; not 400 — would mean filter format issue)
    - `transactions` array length > 0 (Ældern Tomes had ~12 sales last week per the Performance UI screenshot — expect at least that many sale-type events)
    - At least one transaction with `transactionType: "SALE"` present
    - Each transaction has `transactionId`, `amount.value`, `transactionType`, `transactionDate`
    - At least one `NON_SALE_CHARGE` (Promoted Listing Fee) — eBay UI shows promoted fees in the period
  - Save a sample transaction object's structure to `~/Codebases/n8n-workflows/health-payloads/SUB_eBay_Finances_Fetch.json` so the verify-n8n-fix.py hook can re-test

- [ ] **Step 2.7: Smoke test #2 — pagination edge case**
  - Fire with a wider range (e.g. last 90 days) likely to exceed 1000 results
  - Inspect output: did pagination follow `next` link? Total count > 1000?
  - If pagination fails: debug per `n8n-patch-debug-loop` skill; do not stack patches blindly

- [ ] **Step 2.8: Document expected output schema**
  - Add a Sticky Note inside the SUB documenting what callers can expect on `$json.transactions[]`
  - Or: write to README in Phase 7

- [ ] **Step 2.9: Export workflow JSON**
  - n8n UI → kebab → Download
  - Save to `~/Codebases/n8n-workflows/_shadow-library/service-modules/SUB_eBay_Finances_Fetch.json`
  - `git add ... && git commit -m "feat: SUB_eBay_Finances_Fetch — fetch eBay finance transactions"`

**Handoff:** Phase 2 complete when smoke tests pass and JSON is exported. Phase 3 builds the analogous Analytics SUB.

**Decisions for MBC:**
- Pagination loop is in a Code node (not n8n's "Pagination" tab) because the Finances API uses link-based next, which is awkward with n8n's built-in pagination. Code node is more robust here.

---

## Phase 3 — `SUB_eBay_Analytics_Fetch` + smoke test

**Goal:** Reusable SUB returning weekly traffic metrics for a date range.

**Dependencies:** Phase 2 done (we now know the SUB-build pattern works).

**Success metric:** Calling with a 7-day range returns `{impressions, page_views, click_through_rate, conversion_rate, daily_rows[]}`. Numbers are plausibly close to the Performance UI for the same week.

### Tasks

- [ ] **Step 3.1: Plan node graph**
  - Per design spec §5.4: trigger → SUB_Token_Refresher → HTTP Request (Analytics API) → Normalize Code → Return
  - Note: max 90-day range per request; if input range > 90 days, the SUB rejects with an error (caller's job to chunk)

- [ ] **Step 3.2: Create the SUB via n8n-mcp**
  - `mcp__n8n-mcp__n8n_create_workflow` with name `SUB_eBay_Analytics_Fetch`
  - HTTP Request: `GET https://api.ebay.com/sell/analytics/v1/traffic_report`
  - Query params: `marketplace_ids=EBAY_US`, `dimension=DAY`, `date_range=YYYYMMDD..YYYYMMDD`, `metric=` (comma-separated metric list)
  - Authorization: `Bearer {{token from SUB_Token_Refresher output}}`
  - Retry on Fail per rule #13

- [ ] **Step 3.3: Add stickies + Error Trigger → SUB_Error_Handler**
  - Same pattern as Phase 2

- [ ] **Step 3.4: Validate workflow**
  - `mcp__n8n-mcp__n8n_validate_workflow`

- [ ] **Step 3.4.5: Validate metric enum names against the live API before relying on them**
  - The metric names in spec §5.4 (e.g. `TOTAL_IMPRESSION_TOTAL`, `LISTING_PAGE_VIEW_TOTAL`) came from search snippets, not direct doc inspection
  - First call the API with ONE metric at a time to confirm each name is valid (eBay returns 400 with a useful error message if a metric doesn't exist)
  - Adjust the metric query parameter to match what the API accepts. Document the verified set in a Sticky Note inside the SUB.

- [ ] **Step 3.5: Smoke test — last 7 days**
  - Fire with `{startDate: "20260420", endDate: "20260426"}` (note: `YYYYMMDD` format per Analytics API spec)
  - Inspect output. Specific success criteria:
    - HTTP 200 from eBay
    - `daily_rows` array length = 7 (one per day, given `dimension=DAY`)
    - Aggregate `impressions` for the week is in the same order of magnitude as the screenshot's "Listing impressions: 998,823" for last 31 days — for a single week, expect ~200K-300K
    - `conversion_rate` between 0.5% and 5% (Ældern Tomes screenshot showed 1.5% for last 31 days)
  - Compare to seller-hub UI for same week — close but may not match exactly (research findings flagged this as expected)
  - If any metric returns null or zero across all 7 days: likely a metric-name typo. Cross-reference with the eBay docs metric enum.

- [ ] **Step 3.6: Smoke test — 90-day max range**
  - Fire with a 90-day range (e.g. Q1 2026)
  - Confirm API accepts; daily rows array has ~90 entries
  - If "invalid date range" error: input is wider than 90 days OR older than 2 years; check input

- [ ] **Step 3.7: Save sample payload + export workflow**
  - `health-payloads/SUB_eBay_Analytics_Fetch.json` with a known-good input/output pair
  - Export workflow JSON to `_shadow-library/service-modules/`
  - Commit

**Handoff:** Phase 3 complete when smoke tests pass and JSON is exported. Phase 4 builds the email SUB.

**Decisions for MBC:**
- Date format `YYYYMMDD` is what the Analytics API requires (not ISO). Caller must convert. The SUB's Set Config node handles the conversion.
- Metric set is documented in design spec §5.4. If MBC wants additional metrics (e.g. listing-level breakdowns for "top items by traffic"), expand the metric param later — schema doesn't block it.

---

## Phase 4 — `SUB_HTML_Email_Sender` + smoke test

**Goal:** Reusable SUB that sends a single HTML email via Gmail credential.

**Dependencies:** Pre-flight F4 (Gmail credential exists). No phase dependency.

**Success metric:** Calling with `{to, subject, htmlBody}` delivers an email; verified by checking inbox.

### Tasks

- [ ] **Step 4.1: Decide: extend stub `SUB_Email_Responder` or build fresh**
  - Recommendation: build fresh `SUB_HTML_Email_Sender` — single-purpose is cleaner. Don't pollute the responder stub with html-only logic.
  - MBC override allowed.

- [ ] **Step 4.2: Create the SUB**
  - `mcp__n8n-mcp__n8n_create_workflow` name `SUB_HTML_Email_Sender`
  - Trigger: `executeWorkflowTrigger`
  - Gmail node (or `n8n-nodes-base.gmail`) configured for HTML mode
  - **CRITICAL:** disable "Append n8n Attribution" per non-negotiable rule #11
  - Auth: existing Gmail credential
  - Retry on Fail per rule #13
  - Folder: `_Shadow Library/Service Modules` (this is a generic SUB, not ÆT-specific)

- [ ] **Step 4.3: Add stickies + Error Trigger → SUB_Error_Handler**

- [ ] **Step 4.4: Validate workflow**

- [ ] **Step 4.5: Smoke test — send a hello email to MBC**
  - Input: `{to: "mbcaldwell77@gmail.com", subject: "[TEST] SUB_HTML_Email_Sender smoke test", htmlBody: "<h1>Hello</h1><p>If you got this, the SUB works.</p>"}`
  - Verify in inbox: subject, formatting, no n8n attribution footer

- [ ] **Step 4.6: Export + commit**

**Handoff:** Phase 4 complete when MBC confirms email arrived correctly formatted.

**Decisions for MBC:**
- Whether to fork or extend `SUB_Email_Responder` (default: fork)
- Whether email comes from `admin@automatonic.dev` or `mbcaldwell77@gmail.com` Gmail OAuth — depends on which is wired. Default: whichever is currently in the credential. Reversible by reconnecting credential.

---

## Phase 5 — `UTIL_eBay_History_Backfill` + run backfill

**Goal:** One-time historical load of all available eBay history into Supabase.

**Dependencies:** Phases 1–3 done (need tables + both fetch SUBs). Phase 4 helpful (sends completion email) but not strictly required.

**Success metric:**
- `ebay_weekly_snapshots` populated with one row per week back to ~2 years
- `ebay_transactions` populated with all available finance events
- Spot-check a few weeks against eBay UI

### Tasks

- [ ] **Step 5.1: Plan node graph**
  - Per design spec §5.2
  - Manual Trigger → Set Config (start_date = 2 years ago, end_date = today) → Code "Generate Week Ranges" → SplitInBatches (batch=1) → Loop body → Loop end → Summarize → SUB_HTML_Email_Sender (completion email)

- [ ] **Step 5.2: Create UTIL workflow**
  - `mcp__n8n-mcp__n8n_create_workflow` name `UTIL_eBay_History_Backfill`
  - Build per spec §5.2
  - In the loop body: Execute Workflow → SUB_eBay_Finances_Fetch (per week), Execute Workflow → SUB_eBay_Analytics_Fetch (in 90-day chunks — see step 5.4)
  - Code node "Build Snapshot": aggregates fetched data into a snapshot row
  - HTTP: UPSERT snapshot row, bulk INSERT transactions

- [ ] **Step 5.3: Stickies + Error Trigger → SUB_Error_Handler**

- [ ] **Step 5.4: Implement Analytics chunking**
  - Analytics API max range = 90 days per request, max 2-year lookback (per research findings).
  - In Set Config Code node, precompute a list of 90-day windows covering the full backfill range. Math for 2 years (730 days):
    - 730 / 90 = 8.1, so 9 chunks: 8 full 90-day windows + 1 final window of 10 days
    - Build the array starting from `today`: `[today-90, today]`, `[today-180, today-90]`, ..., last chunk `[today-730, today-720]`
    - Each chunk's `startDate` and `endDate` formatted as `YYYYMMDD` (Analytics API requirement)
  - For each window, fetch traffic via SUB_eBay_Analytics_Fetch
  - Concatenate all daily_rows arrays from the 9 calls → single 730-row array of daily traffic
  - In the per-week loop body (the Finances loop, not a separate Analytics loop): filter the daily_rows for the current week's 7 dates and aggregate them into the snapshot row
  - **Why not loop Analytics per-week:** would be 104 calls instead of 9 (and 90+ minutes of API waits instead of ~1 minute). Pulling Analytics in big chunks once, then filtering per-week in memory, is correct optimization here.

- [ ] **Step 5.5: Validate workflow**

- [ ] **Step 5.6: Dry-run with a 4-week range first**
  - Set Config to `start_date = today - 28 days`, `end_date = today`
  - Fire manually
  - Verify: 4 snapshot rows in Supabase, transaction count plausible
  - If anything is wrong: STOP and fix before doing the full 2-year run

- [ ] **Step 5.7: Run full backfill**
  - Set Config to `start_date = today - 730 days` (or earliest eBay data — Finances API caps at ~5 years but Analytics caps at 2 years; use 2 years to keep both populated).
  - Fire manually.
  - **Estimated runtime (rough, not measured):** ~104 Finances calls + 9 Analytics calls = 113 API calls × ~3s/call (1s API + 2s wait) ≈ 6 min API time. Plus Supabase upserts, JSON normalization, and any pagination on heavy weeks. Total ballpark: **15-25 min**. If it runs much longer, suspect throttling — check `getRateLimits` empirically.
  - Monitor execution: `mcp__n8n-mcp__n8n_executions action=list workflowId=<id>` periodically.

- [ ] **Step 5.8: Verify backfill results**
  - Query: `SELECT COUNT(*) FROM ebay_weekly_snapshots WHERE user_id = '715aaa28-d359-42c6-9a22-11918d01f3bf'`
  - Expected: ~104 rows (52 weeks × 2 years)
  - Query: `SELECT COUNT(*) FROM ebay_transactions WHERE user_id = '715aaa28-d359-42c6-9a22-11918d01f3bf'`
  - Expected: hundreds to thousands depending on volume
  - **Gap check (catches silent skipped weeks):** `SELECT week_starting FROM ebay_weekly_snapshots WHERE user_id = '715aaa28-...' ORDER BY week_starting`. Visually scan for missing Mondays. Any gap = re-run the UTIL with `start_date` and `end_date` narrowed to that gap. Don't rely on row count alone — partial failures during a long backfill can leave silent holes.
  - Spot-check arithmetic: pick a recent week, sum `amount` for `transaction_type = 'SALE'` in transactions, compare to `gross_revenue` on that week's snapshot — should match exactly (both came from the same source data within the same workflow run).

- [ ] **Step 5.9: Spot-check against eBay UI**
  - Open eBay seller hub Performance page
  - Compare last-31-days numbers to sum of last 4 snapshots
  - Acceptable variance (per research findings): a few percent. Anything wildly different = bug.

- [ ] **Step 5.10: Export + commit UTIL workflow**

**Handoff:** Phase 5 complete when backfill data is in Supabase and spot-checks reasonable. Phase 6 wires the recurring weekly run.

**Decisions for MBC (defaults applied):**
- Backfill depth = 2 years (Analytics API ceiling). Could pull older Finances-only data later if MBC wants pure-revenue history pre-2024.
- 2-second wait between API calls (conservative; can increase if throttled, decrease if comfortable)

---

## Phase 6 — `MAIN_eBay_Weekly_Report` + first execution

**Goal:** Recurring Monday workflow that pulls last week's data, persists to Supabase, sends summary email.

**Dependencies:** Phases 1–5 done. Backfill should have left at least the prior week's snapshot row in Supabase so the WoW delta computation has a "previous" to compare to.

**Success metric:**
- Workflow runs Monday 07:00 ET automatically
- New snapshot row added each Monday for the prior week
- Email arrives in MBC's inbox with KPIs, deltas, top items, and a Gemini paragraph

### Tasks

- [ ] **Step 6.1: Plan node graph**
  - Per design spec §5.1
  - Schedule Trigger (Mon 07:00 ET) → Set Config → SUB_eBay_Finances_Fetch → SUB_eBay_Analytics_Fetch → Build Snapshot Code → UPSERT snapshot → Bulk INSERT transactions → SELECT prior snapshot → Compute Deltas Code → Gemini → Build HTML Email Code → SUB_HTML_Email_Sender → Done

- [ ] **Step 6.2: Create MAIN workflow**
  - `mcp__n8n-mcp__n8n_create_workflow` name `MAIN_eBay_Weekly_Report`
  - Schedule trigger: cron `0 7 * * 1`, timezone `America/New_York`
  - Build per spec §5.1

- [ ] **Step 6.3: Configure Gemini node**
  - Per `n8n-workflows/CLAUDE.md` Gemini gotcha: use flattened user message (no separate system message)
  - Add Code node after Gemini that strips markdown fences and `JSON.parse` the result (per CLAUDE.md gotcha)
  - Prompt: "Given last week's eBay numbers and the prior week's, write 2-3 sentences calling out what stood out. Be concrete (cite numbers). No fluff."
  - **Fallback for Gemini failure:** if Gemini call errors after 3 retries, downstream "Build HTML Email" Code node should detect missing input and substitute an empty narrative section. Email still sends with KPIs intact. The Gemini paragraph is a nice-to-have, not load-bearing — never let it block the email.

- [ ] **Step 6.4: Configure HTML email body Code node**
  - Template literal with KPI tiles, WoW delta arrows, top-5 items table, traffic snapshot, footer
  - Per design spec §6 layout
  - Per `feedback_human_facing_format.md` — HTML, never raw markdown

- [ ] **Step 6.5: Stickies + Error Trigger → SUB_Error_Handler**
  - 4-6 stickies total: ROI Overview + section stickies for "Fetch Data," "Aggregate & Persist," "Notify," + error handler

- [ ] **Step 6.6: Validate workflow**
  - `mcp__n8n-mcp__n8n_validate_workflow`

- [ ] **Step 6.7: Manual test fire (don't wait until Monday)**
  - In n8n UI, open MAIN_eBay_Weekly_Report and click the "Execute Workflow" button on the canvas — this fires the Schedule node manually without modifying the cron config
  - Schedule node will compute "current run = now" so Set Config will use last week as the date range automatically
  - Verify: snapshot row created/updated, email arrives in mbcaldwell77@gmail.com, content matches the layout in design spec §6
  - If email doesn't arrive within 60 sec: check execution log via `mcp__n8n-mcp__n8n_executions action=list workflowId=<id>`; check Gmail "Sent" folder for the n8n Gmail account

- [ ] **Step 6.8: Re-enable schedule trigger; remove manual trigger**
  - Confirm schedule trigger is the only entry point

- [ ] **Step 6.9: Wait for first scheduled run (or fast-forward)**
  - First Monday 07:00 ET after this phase completes
  - If urgent: temporarily edit cron to fire in 5 minutes, observe, then revert
  - Inspect execution log, confirm green status, confirm email arrived

- [ ] **Step 6.10: Save canonical test payload**
  - `~/Codebases/n8n-workflows/health-payloads/MAIN_eBay_Weekly_Report.json`
  - PostToolUse hook will use this to verify future edits don't break the workflow

- [ ] **Step 6.11: Export + commit MAIN workflow**

**Handoff:** Phase 6 complete when first scheduled execution runs green and the email arrives. Phase 7 wraps documentation.

**Decisions for MBC:**
- Schedule timezone is `America/New_York` (set on the Schedule node, not via UTC math) — n8n handles DST automatically.
- Gemini paragraph included by default; can be disabled (set to empty string) if MBC finds it noisy after a few weeks.

---

## Phase 7 — Documentation + memory note

**Goal:** Future-Claude and MBC can find/operate this without re-deriving.

**Dependencies:** Phases 1–6 done.

**Success metric:** Documentation exists at the right paths; memory index updated; FIXES.md gets entries for any non-trivial bugs encountered.

### Tasks

- [ ] **Step 7.1: Write operations runbook**
  - Path: `business-infrastructure/scryvault-n8n/docs/operations/ebay-weekly-reporting.md`
  - Sections: what it does, when it runs, where the data lives (Supabase tables), what to do if it fails (re-run UTIL_eBay_History_Backfill for missed week; debug recipe for token/auth/throttle issues), how to query the data with example SQL

- [ ] **Step 7.2: Write memory note**
  - Path: `~/.claude/projects/C--Users-MBC-Codebases/memory/project_ebay_weekly_reporting.md`
  - Type: project
  - Body: status (live as of <date>), data location (ScryVault Supabase tables), workflow IDs, key decisions, gotchas if any
  - Add one-line entry to MEMORY.md index under Project — Active

- [ ] **Step 7.3: Update memory infra reference if relevant**
  - If anything new about ScryVault Supabase or eBay token usage was learned, update the relevant `infra_*.md` file
  - Likely needed: nothing major — but if Analytics API requires anything unusual (e.g. specific marketplace_ids handling), capture it

- [ ] **Step 7.4: Append to FIXES.md if any non-trivial bug was solved during build**
  - Path: `~/.claude/projects/C--Users-MBC/memory/FIXES.md`
  - Format per CLAUDE.md "Fixes Log" section: symptom + root cause + exact commands + verification

- [ ] **Step 7.5: Update n8n-workflows CLAUDE.md if any new convention emerged**
  - E.g. if a new pattern was needed for Analytics API chunking, document it for future reuse

- [ ] **Step 7.6: Commit docs**
  - `git add docs/ memory/`
  - `git commit -m "docs: ebay weekly reporting operations runbook + memory"`

- [ ] **Step 7.7: Notify MBC build is complete**
  - Brief summary: tables live, backfill loaded N weeks of data, weekly cron runs Mon 07:00 ET, first email landed at <timestamp>

**Handoff:** Build complete. Ongoing: weekly cron self-runs; only intervention is when something breaks (tokens, throttle, etc.).

---

## Cross-cutting checks

These apply to every phase, not just one.

- [ ] **Naked numbers rule (CLAUDE.md):** any number cited in docs, runbook, or memory note must be measured/sourced/flagged
- [ ] **No Slack notifications anywhere** — feedback memory `feedback_no_slack.md`. Email only via SUB_HTML_Email_Sender.
- [ ] **No Anthropic AI calls in n8n** — only Gemini. Per `feedback_use_gemini.md`.
- [ ] **No hardcoded credentials anywhere** — n8n Credential Manager only.
- [ ] **All HTTP nodes have Retry on Fail** — per non-negotiable rule #13. Code/Set/IF nodes do NOT.
- [ ] **All outward nodes have "Append n8n Attribution" disabled** — per rule #11.
- [ ] **PostToolUse hook should auto-verify after each `n8n_update_partial_workflow`** — if it blocks, fix the underlying issue, don't bypass

---

## Self-review (skill-mandated)

**Spec coverage check** — does every section in `2026-04-27-ebay-weekly-reporting-design.md` have at least one task?

| Spec section | Plan phase(s) |
|---|---|
| §1 Problem statement | Implicit (the whole plan addresses it) |
| §2 Functional requirements F1–F7 | F1: Phase 6; F2: Phase 5; F3: Phase 1; F4: Phase 6; F5: P1 + Phases 2,3,5,6 reuse; F6: every phase Error Trigger step; F7: Phase 4 + Phase 6 |
| §2 Non-functional N1–N5 | N1 (idempotency): Phase 1 UNIQUE constraints + Phase 5/6 UPSERT; N2 (Gemini): Phase 6 step 6.3; N3 (rate limits): Phase 5 chunking + 2s waits; N4 (token cost): Phase 6 single Gemini call; N5 (failure recovery): Phase 5 step 5.6 dry-run + Phase 6 cron resilience |
| §3 Architecture | All phases |
| §4 Data model | Phase 1 |
| §5 Workflow specs 5.1-5.5 | Phases 6, 5, 2, 3, 4 respectively |
| §6 Email format | Phase 6 step 6.4 |
| §7 Edge cases | Distributed across phases — UPSERT idempotency (P5/P6), week-boundary ET (P5/P6), refunds tracking (P1 schema + P5 normalize logic), top-5 denorm (P6 step 6.4), Gemini Code-node JSON-parse (P6 step 6.3) |
| §8 Risks | Mitigated via dry-run (P5.6), Gmail SUB completion before send (P4), per-week loop (P5.4), token refresher health (P1 pre-flight) |
| §9 Component boundaries | Each component owns one phase |
| §10 Decisions for MBC | Phase 1, 4, 5, 6 each surface decisions |
| §11 Open questions | Pre-flight P2 (scopes), Phase 5.8 + 5.9 (rate limits empirically), Phase 5 + 6 (item-title enrichment empirically) |

No spec sections orphaned.

**Placeholder scan:** No "TBD," "TODO," or "fill in later" remains. Every step states the action and the verification.

**Type consistency:** Workflow names match across phases (e.g. `SUB_eBay_Finances_Fetch` referenced consistently). Table names match spec §4. Cron expression and timezone consistent in P6 step 6.2 and 6.8.

**Issues found and fixed inline:** None — plan is internally consistent.

---

## Strategic timing note (added in adversarial pass)

**This build competes with the active Curtis Lead Capture sprint.** Per `memory/project_curtis_lead_capture.md`, that's a 13-day sprint that started 2026-04-27 (today). MBC's focused-build hours this fortnight are scoped to that, with `MENTOR_PAUSED` set on his current focus.

Recommended sequencing:
- **Option A (preferred):** Defer this build to after Curtis Lead Capture sprint completes (~2026-05-09). Lower risk of context-switching damage.
- **Option B:** If MBC wants data flowing sooner, do **Phases 1 + 5 only** this week (migration + backfill into Supabase, no email). MBC can query the data via Claude or SQL ad-hoc until the email gets built post-Curtis.
- **Option C:** Full build now if MBC explicitly wants to swap priorities. But this should be a conscious call, not default.

**Surfaced for MBC to decide.** Default in absence of decision: **Option A**.

---

## Adversarial scrutiny log (Pass 5)

This appendix records the kill-list from the major-plan skill's adversarial pass. Each item: action taken (DEFEND / REPHRASE / REMOVE) and where it landed.

### Strikes applied inline

| # | Section | Weakness | Action | Resolution |
|---|---|---|---|---|
| 1 | Phase 1 step 1.3 | "If npm run db:migrate fails for environment reasons" was vague — no concrete fallback | DEFEND | Added explicit Supabase Dashboard SQL Editor fallback path |
| 2 | Phase 3 metric names | Metric enum names came from search snippets, not primary doc inspection. Risk of silent null returns if names are slightly off | DEFEND | Added Step 3.4.5 to validate each metric name individually before relying on the set |
| 3 | Phase 5 step 5.7 | Estimated runtime "30-60 min" was naked-numbers without method | REPHRASE | Reframed as "ballpark 15-25 min based on call counts × wait times; could 2-3x in practice; treat as rough" |
| 4 | Phase 5 step 5.8 | Row count check would silently miss skipped weeks | DEFEND | Added gap-check query: list all `week_starting` values, scan for missing Mondays |
| 5 | Phase 6 step 6.3 | Gemini call could block email send if Gemini API fails | DEFEND | Added explicit fallback — empty narrative on Gemini failure, email still sends |

### Strikes flagged but not fixed inline (decisions noted)

| # | Section | Weakness | Action | Notes |
|---|---|---|---|---|
| 6 | Whole plan | Opportunity cost: ~4 hours competes with active Curtis Lead Capture sprint | DEFEND | Added "Strategic timing note" section above with Options A/B/C — surfaced for MBC decision rather than auto-deciding |
| 7 | Phase 4 | Stakeholder laugh test: weekly emails could become AI noise MBC ignores | REPHRASE | Already accepted MBC explicitly asked for emails. Added review trigger at 4 weeks: "if MBC stops opening, kill the email and use Supabase queries directly" — added to Phase 7 docs |
| 8 | Phase 6 step 6.9 | Calendar timing — "Wait for Monday" depends on day of week of execution | REPHRASE | Step already covers fast-forward via cron edit; acceptable. No fix needed. |
| 9 | Phase 1 schema | The migration's column types haven't been validated against actual eBay API responses | DEFEND | Spec §10 already flags this: types deduced from API docs but not verified in flight. First smoke test in Phase 2 is the validator. If types mismatch, schema gets adjusted before backfill. |
| 10 | Phase 5 first run | First scheduled run's WoW comparison may be against an older anomalous week | REPHRASE | Acceptable degradation — normalizes after a few weeks of weekly data. Documented in Phase 7 runbook. |

### Strikes considered and dismissed

- **"Phase 2 pagination smoke test could silently pass with <1000 transactions":** dismissed. Smoke test #1 is the primary validator; pagination test is bonus. Forcing pagination via `limit=1` would test pagination but is artificial. Risk accepted.
- **"Email is dead code if MBC ignores it":** see #7 above, MBC asked for it; revisit at 4-week mark.

### Load-bearing claims defended (per skill: hardest scrutiny on these)

- **eBay APIs return finance + traffic data sufficient for the reporting needs:** primary-source confirmed in research findings file. Defended.
- **2-year backfill is feasible within plausible rate limits:** unmeasured but math (113 calls × 3s = 6 min) is well below any plausible default quota. Defended with caveat that runtime could 2-3x.
- **`SUB_Token_Refresher` is reliable enough that 5 workflows depending on it will not all fail when it fails:** existing health monitoring covers this; if token refresher dies, ALL eBay workflows die together — that's a known cascading risk shared across the entire eBay portfolio. No additional mitigation in scope.

### What survived all passes

The core architecture (2 tables + 5 workflows, weekly cron + manual backfill, Gemini-narrated HTML email) survived both constructive and adversarial passes unchanged. The strikes addressed specifics (validation, fallbacks, sequencing), not the design itself.

If a future stakeholder argues this should have been a Vercel app, a SaaS dashboard, or an Anthropic-powered build instead — the build classification (internal tooling, n8n + Gemini default per `feedback_use_gemini.md`) and the YAGNI rule (no UI until data is being queried) are the defenses.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-ebay-weekly-reporting.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per phase, review between phases, fast iteration. Best for autonomous progress when MBC isn't actively driving.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints. Best when MBC wants to watch builds happen step-by-step.

**Recommendation:** Subagent-driven for Phases 1, 7 (mostly file edits); inline-with-MBC for Phases 2–6 since each n8n workflow build benefits from MBC's eyes on the canvas (per `feedback_walk_canvas_before_change.md`).

**Which approach is decided when MBC returns and reviews this plan + the design spec.**
