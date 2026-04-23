# n8n Wiring Spec — Stale Listing Reviver Agent Path

When you're ready to flip `AGENT_MODE=true` and route Stale Listing Reviver
decisions through the agent (instead of the rule-based Determine Tier +
Diagnose Problem chain), apply these changes to the workflow.

**Workflow:** `MAIN_Stale_Listing_Reviver` (id `SunYaEHCnxIM58gJ`)

**Why not auto-wired:** the live workflow just got stabilized through a long
debugging session. Touching it via MCP without you watching is too risky.
This spec is paste-ready when you want it.

---

## Prerequisites

1. `scryvault-n8n` deployed somewhere n8n can reach (Vercel URL, or local tunnel)
2. Three env vars set on the n8n Hetzner instance:
   - `AGENT_MODE=true`
   - `SCRYVAULT_AGENT_URL=https://your-vercel-url.vercel.app/api/agents/stale-listing`
   - `AGENT_INTERNAL_SECRET=<same-value-as-scryvault-n8n>`
3. Same `AGENT_INTERNAL_SECRET` set in scryvault-n8n's Vercel env

## The Switch + HTTP Request insert

**Insert point:** between `Determine Tier` (existing decision node) and
`Calculate Tier 1 Price` (existing math node). You're branching the decision
between agent-path and rule-path.

### Step 1 — Add `Route Decision Path` Switch node

```json
{
  "name": "Route Decision Path",
  "type": "n8n-nodes-base.switch",
  "typeVersion": 3,
  "parameters": {
    "rules": {
      "values": [
        {
          "outputKey": "Agent",
          "conditions": {
            "options": { "caseSensitive": true, "typeValidation": "strict" },
            "conditions": [
              {
                "operator": { "type": "string", "operation": "equals" },
                "leftValue": "={{ $env.AGENT_MODE }}",
                "rightValue": "true"
              }
            ],
            "combinator": "and"
          }
        },
        {
          "outputKey": "Rules",
          "conditions": {
            "options": { "caseSensitive": true, "typeValidation": "strict" },
            "conditions": [
              {
                "operator": { "type": "string", "operation": "notEquals" },
                "leftValue": "={{ $env.AGENT_MODE }}",
                "rightValue": "true"
              }
            ],
            "combinator": "and"
          }
        }
      ]
    },
    "options": {}
  }
}
```

### Step 2 — Add `Call Stale-Listing Agent` HTTP Request node

Wire to the `Agent` output of the Switch.

```json
{
  "name": "Call Stale-Listing Agent",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "parameters": {
    "method": "POST",
    "url": "={{ $env.SCRYVAULT_AGENT_URL }}",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "x-agent-secret", "value": "={{ $env.AGENT_INTERNAL_SECRET }}" },
        { "name": "Content-Type",   "value": "application/json" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"ebay_item_id\": \"{{ $json.item_id }}\",\n  \"inventory_item_id\": \"{{ $json.inventory_item_id }}\",\n  \"current_title\": \"{{ $json.title }}\",\n  \"current_price\": {{ $json.current_price }},\n  \"cost_basis\": {{ $json.cost_basis }},\n  \"book_metadata\": {\n    \"title\": \"{{ $json.book_title }}\",\n    \"authors\": {{ JSON.stringify($json.authors || []) }},\n    \"format\": \"{{ $json.format || '' }}\",\n    \"is_star_wars\": {{ $json.is_star_wars || false }},\n    \"is_legends\": {{ $json.is_legends || false }}\n  },\n  \"days_since_listed\": {{ $json.days_since_listed }},\n  \"days_since_last_revision\": {{ $json.days_since_last_revision || null }},\n  \"days_since_last_price_drop\": {{ $json.days_since_last_price_drop || null }},\n  \"page_views_30d\": {{ $json.page_views_30d || 0 }},\n  \"watchers_count\": {{ $json.watchers_count || 0 }},\n  \"config\": {\n    \"price_drop_pct\": {{ $('Merge Config').first().json.tier1_price_drop_pct }},\n    \"cost_floor_buffer\": 2.00,\n    \"min_days_between_actions\": 14\n  }\n}",
    "options": {
      "timeout": 60000,
      "response": { "response": { "fullResponse": false } }
    }
  },
  "retryOnFail": true,
  "maxTries": 2,
  "waitBetweenTries": 3000
}
```

**Note:** `retryOnFail: true` with `maxTries: 2` is OK here because this is an
external HTTP call (Anthropic + scryvault are both external from n8n's POV).
Per `feedback_n8n_retry_on_fail.md`: retry on externals only.

### Step 3 — Add `Unwrap Agent Decision` Set node

The agent returns `{ data: { decision: { action, new_title?, new_price?, reasoning } } }`.
Flatten it back to the same shape the rule chain produces, so downstream nodes
work unchanged.

```json
{
  "name": "Unwrap Agent Decision",
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "parameters": {
    "mode": "manual",
    "fields": {
      "values": [
        { "name": "tier",            "type": "number",  "stringValue": "={{ $json.data.decision.action === 'no_action' ? 0 : 1 }}" },
        { "name": "new_title",       "type": "string",  "stringValue": "={{ $json.data.decision.new_title || $('Merge Config').item.json.title }}" },
        { "name": "new_price",       "type": "number",  "numberValue": "={{ $json.data.decision.new_price || $('Merge Config').item.json.current_price }}" },
        { "name": "agent_reasoning", "type": "string",  "stringValue": "={{ $json.data.decision.reasoning }}" },
        { "name": "agent_action",    "type": "string",  "stringValue": "={{ $json.data.decision.action }}" },
        { "name": "agent_path",      "type": "boolean", "booleanValue": true }
      ]
    },
    "options": {}
  }
}
```

### Step 4 — Wire connections

```
Determine Tier
   ↓
Route Decision Path (Switch)
   ├── Agent  → Call Stale-Listing Agent → Unwrap Agent Decision → Revise on eBay
   └── Rules  → Calculate Tier 1 Price → Revise on eBay  (existing chain)
```

Both branches converge on `Revise on eBay`. The Set node's `tier`, `new_title`,
`new_price` fields match what the existing rule chain produces, so no
downstream changes needed.

---

## Test procedure (before flipping to all-stale-listings)

1. Set the env vars on the n8n instance — restart n8n to load them
2. Manually run the workflow with one known stale item (find one in the dry-run logs)
3. Watch execution: confirm Switch routes to `Agent` output
4. Confirm HTTP Request returns 200
5. Confirm Unwrap node has `agent_path: true`
6. Confirm `Revise on eBay` body uses the agent's title + price
7. If Revise on eBay fires: confirm same eBay item now shows the agent's revisions

If any step fails, set `AGENT_MODE=false` and restart n8n. Workflow returns to
rule-based path immediately, no rollback needed (the rule branch is unchanged).

---

## Cost monitoring

Each agent call: ~$0.005-0.02 (Sonnet 4.5 with prompt caching).

n8n run frequency × eligible items × cost per call = total monthly cost.

Example: if Stale Reviver runs daily and finds avg 5 stale items/day:
- 5 × 30 = 150 calls/month
- 150 × $0.01 = $1.50/month

---

## Rollback

Single flag flip:
```
AGENT_MODE=false
```
Restart n8n. Switch routes to Rules branch. Done.

The agent nodes stay in place (disabled by default — they don't run when
Switch routes elsewhere). When/if you flip back to true, no re-wiring needed.
