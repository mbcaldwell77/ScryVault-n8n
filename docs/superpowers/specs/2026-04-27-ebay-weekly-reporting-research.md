# eBay Sell APIs — Research Findings

**Topic:** eBay Sell Finances + Analytics API capabilities for weekly reporting build
**Question:** Can our planned architecture (weekly recurring + initial backfill into Supabase) be supported by eBay's APIs given the OAuth scopes already granted?
**Decision this feeds:** Pass 3 implementation plan (writing-plans) for the eBay Weekly Reporting System
**Retrieval dates:** 2026-04-27
**Pass:** Two-pass adversarial. Pass 1 drafted with inline citations; Pass 2 applied skeptical review and struck unsourced claims.

---

## Findings (survived Pass 2)

### Finances API — `GET /sell/finances/v1/transaction`

- The endpoint is hosted at `https://api.ebay.com/sell/finances/v1/transaction`. [source: https://developer.ebay.com/api-docs/sell/finances/resources/transaction/methods/getTransactions, retrieved 2026-04-27]
- The `transactionDate` filter uses ISO 8601 timestamp range syntax: `filter=transactionDate:[2024-10-23T00:00:01.000Z..2024-11-09T00:00:01.000Z]`. [source: https://developer.ebay.com/api-docs/sell/finances/resources/transaction/methods/getTransactions, retrieved 2026-04-27]
- If the seller omits the ending date, the API returns up to 90 days from the start date (or current date if start was less than 90 days ago). With both start and end specified, the underlying transaction store retains roughly 5 years of history. [source: https://developer.ebay.com/api-docs/sell/finances/resources/transaction/methods/getTransactionSummary, retrieved 2026-04-27]
- Required OAuth scope: `https://api.ebay.com/oauth/api_scope/sell.finances`. **Confirmed present** on MBC's token (verified during this session in the lockIsStale token row). [source: token row sample in execution 8054, retrieved 2026-04-27]

### TransactionType enum (`pay:TransactionTypeEnum`)

- Documented values: `SALE`, `REFUND`, `CREDIT`, `NON_SALE_CHARGE`, `DISPUTE`, `SHIPPING_LABEL`, `TRANSFER`. [source: https://developer.ebay.com/api-docs/sell/finances/types/pay:TransactionTypeEnum, retrieved 2026-04-27]
- **Promoted listing fees** are reported as `NON_SALE_CHARGE` transactions; the specific fee name (e.g. "Promoted Offsite Fee") appears in the `transactionMemo` field. [source: https://developer.ebay.com/api-docs/sell/finances/types/pay:TransactionTypeEnum, retrieved 2026-04-27]
- `SHIPPING_LABEL` is a separate transactionType for shipping label charges. [same source]
- `TRANSFER` covers seller reimbursements to eBay for buyer refunds (managed-payments sellers). [same source]

### Analytics API — `GET /sell/analytics/v1/traffic_report`

- The endpoint is hosted at `https://api.ebay.com/sell/analytics/v1/traffic_report`. [source: https://developer.ebay.com/api-docs/sell/analytics/resources/traffic_report/methods/getTrafficReport, retrieved 2026-04-27]
- Required parameters: `marketplace_ids`, `date_range`, `dimension`, `metric`. [same source]
- `date_range` filter accepts two formats: `YYYYMMDD..YYYYMMDD` (assumed America/Los_Angeles), or ISO with explicit timezone offset. [same source]
- **Maximum date range per request: 90 days.** Anything wider returns an "invalid date range" error. [same source]
- **Maximum lookback: 2 years from today.** Start dates older than 2 years return error. [same source]
- Available metrics include `TOTAL_IMPRESSION_TOTAL`, `LISTING_IMPRESSION_SEARCH_RESULTS_PAGE`, `LISTING_IMPRESSION_STORE`, plus click-through rate and conversion-rate metrics. [same source]
- Required OAuth scope: `https://api.ebay.com/oauth/api_scope/sell.analytics.readonly`. **Confirmed present** on MBC's token. [source: token row sample in execution 8054, retrieved 2026-04-27]

### Rate limits

- eBay enforces per-app daily and per-window throttles, not flat quotas across all calls. Some methods have one daily window (86400s) plus a shorter window (e.g. 300s). [source: https://developer.ebay.com/develop/get-started/api-call-limits, retrieved 2026-04-27]
- The default app-level call quotas are designed for individuals and smaller businesses; an "Application Growth Check" raises them. [same source]
- The Developer Analytics `getRateLimits` endpoint can be queried at runtime to report exact remaining-call counts per resource per time window. [source: https://developer.ebay.com/api-docs/developer/analytics/resources/rate_limit/methods/getRateLimits, retrieved 2026-04-27]
- **Specific numerical limits for `getTransactions` and `getTrafficReport` were not extractable from search snippets** — see Open Questions.

---

## Implications for the design

| Question from spec §11 | Answer |
|---|---|
| Max history depth on `getTransactions` | ~5 years with explicit date range (well over what we need) |
| Correct Analytics endpoint for traffic | `getTrafficReport` — not `seller_standards_profile` (that's a separate seller-grade endpoint) |
| Smallest Analytics granularity | Day-level via `dimension=DAY` |
| Analytics max lookback | 2 years |
| Promoted listing fees: separate or bundled? | Separate — `transactionType=NON_SALE_CHARGE` with `transactionMemo` indicating Promoted Listing |
| Order item titles in transactions? | The `Transaction` type includes references to orderId; full item enrichment likely requires a second call (deferred — title comes via the transaction object's references where available) |

### Backfill loop math

- Finances API: one call per week works (well under 90-day window). 104 weeks ≈ 104 calls. ~1 call per 30s with 2s waits = under 1 hour.
- Analytics API: 90-day max range → can pull in 90-day chunks instead of weekly. 2 years = ~9 calls total. Then break apart per-week server-side using the daily rows.
- **Backfill design adjustment:** UTIL_eBay_History_Backfill should pull Finances API per-week (matching snapshot grain) but Analytics API in 90-day chunks (efficiency).

---

## Contradictions surfaced

None. All claims trace to single primary sources on developer.ebay.com.

---

## Struck during Pass 2

1. **Specific daily call limit numbers** (e.g. "5000/day") — STRUCK. Search snippets did not cite numerical defaults from primary docs. Reframed as "limits exist; our weekly workflow makes <10 calls and backfill is one-time, chunked — well within any plausible default quota. Verify at runtime via `getRateLimits` if throttling occurs."
2. **Claim that `getTrafficReport` returns the exact same numbers shown on the seller-hub Performance page** — STRUCK. Not confirmed by primary source. The UI may compose multiple metric types or use a different aggregation. Reframed in spec: "metrics will be close to UI but not bit-identical; this is acceptable since we own the canonical history going forward."
3. **Claim that `Transaction` records include item title and SKU directly** — STRUCK as unconfirmed. The `Transaction` type does include `references[]` to related orders/items (per `pay:Reference`) but the exact field shape for item title/SKU enrichment was not extracted. Implementation plan should validate empirically and call `Fulfillment API getOrders` for enrichment if needed.

---

## Open questions (for runtime/empirical resolution)

- **Exact daily call quotas for `getTransactions` and `getTrafficReport`** — defer to runtime check via `getRateLimits` after first execution. If throttling is hit, document and adjust.
- **Whether `getTrafficReport` can return per-listing impressions** (for "top items by traffic" reporting) — likely yes via `dimension=LISTING`, but verify empirically before adding to email.
- **Item-title enrichment in transactions** — first execution will reveal whether titles are present; if not, add `getOrders` enrichment in a follow-up SUB.

---

## Sources

- [getTransactions — eBay Finances API](https://developer.ebay.com/api-docs/sell/finances/resources/transaction/methods/getTransactions) — retrieved 2026-04-27
- [getTransactionSummary — eBay Finances API](https://developer.ebay.com/api-docs/sell/finances/resources/transaction/methods/getTransactionSummary) — retrieved 2026-04-27
- [TransactionTypeEnum — eBay Finances API](https://developer.ebay.com/api-docs/sell/finances/types/pay:TransactionTypeEnum) — retrieved 2026-04-27
- [Transaction type — eBay Finances API](https://developer.ebay.com/api-docs/sell/finances/types/pay:Transaction) — retrieved 2026-04-27
- [getTrafficReport — eBay Analytics API](https://developer.ebay.com/api-docs/sell/analytics/resources/traffic_report/methods/getTrafficReport) — retrieved 2026-04-27
- [Analytics API Overview](https://developer.ebay.com/api-docs/sell/analytics/overview.html) — retrieved 2026-04-27
- [API Call Limits](https://developer.ebay.com/develop/get-started/api-call-limits) — retrieved 2026-04-27
- [getRateLimits — Developer Analytics API](https://developer.ebay.com/api-docs/developer/analytics/resources/rate_limit/methods/getRateLimits) — retrieved 2026-04-27

---

## Methodology note

WebFetch attempts to developer.ebay.com timed out (TLS/connection drops on the n8n VPS path; not relevant to runtime since the VPS itself successfully calls eBay APIs). Findings derive from WebSearch snippets that quote primary-doc content. Where search snippets quote verbatim from developer.ebay.com pages, I treat that as primary-source citation. Where snippets paraphrase, I apply Pass 2 skepticism more aggressively (the rate-limit-numbers claim was struck on this basis).

If MBC wants higher rigor on any specific claim, a runtime call from the n8n VPS to the doc page or the API itself will resolve it.
