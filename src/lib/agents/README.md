# Agents Module

Anthropic Agent SDK tool-use loops for ScryVault.

## Status

**OFF by default.** Gemini (via n8n) handles all generation/decisions until
`AGENT_MODE=true` flips. This module is portfolio scaffold — fully wired but
dormant until Gemini's $10/mo budget runs out.

## Two Agents

### 1. Listing Generation Agent
Generates eBay listings (title, description, condition_notes, price). Replaces
the Gemini call inside the n8n SUB_Title_Generator + SUB_Description_Generator
chain when `AGENT_MODE=true`.

### 2. Stale Listing Decision Agent
Decides what to do with an underperforming listing (revise title / lower price /
both / no-op / flag for human). Replaces the rule-based `Determine Tier` +
`Diagnose Problem` n8n nodes. Canonical "n8n triggers → Agent decides → n8n
executes" pattern.

## Architecture

### Listing generation flow
```
User clicks "Generate Listing"
   ↓
POST /api/listings/generate                  ← user-facing route
   ↓
shouldUseAgent()?
   ├── true  → runListingAgent() in-process  ← THIS module
   └── false → call n8n webhook              ← existing Gemini path
```

### Stale listing flow (canonical pattern)
```
n8n cron (Stale Listing Reviver workflow)
   ↓
n8n: fetch stale candidates + traffic data from Supabase
   ↓
n8n: Switch node on AGENT_MODE
   ├── true  → POST /api/agents/stale-listing → runStaleListingAgent()
   └── false → existing rule-based Determine Tier + Diagnose Problem chain
   ↓
agent returns { action, new_title?, new_price?, reasoning }
   ↓
n8n: execute eBay revise call with the decision
```

For n8n to call agents directly (either route), shared-secret auth via the
`x-agent-secret` header (must match `AGENT_INTERNAL_SECRET` env).

## Files

| File                       | Purpose                                                      |
|----------------------------|--------------------------------------------------------------|
| `index.ts`                 | Public API barrel — exports both agents + flag helpers       |
| `feature-flag.ts`          | `AGENT_MODE` + `ANTHROPIC_API_KEY` env checks                |
| `types.ts`                 | Shared agent types (AgentToolCall, AgentPathName, AgentGenerationResult) |
| `tools.ts`                 | Listing-generation tools: critique_title, validate_description |
| `listing-agent.ts`         | Listing-generation tool-use loop                             |
| `stale-listing-types.ts`   | Stale-listing input/output schemas                           |
| `stale-listing-tools.ts`   | Stale-listing tools: compute_price_drop, check_action_eligibility |
| `stale-listing-agent.ts`   | Stale-listing tool-use loop                                  |

## Tool inventory

### Shared by both agents
| Tool             | Type          | What it checks                                   |
|------------------|---------------|--------------------------------------------------|
| `critique_title` | deterministic | 80-char limit, forbidden punct, ALL CAPS, keyword preservation, Star Wars special case, author last name |

### Listing-generation only
| Tool                   | Type          | What it checks                                |
|------------------------|---------------|-----------------------------------------------|
| `validate_description` | deterministic | No `<script>`, no inline styles, allowed tags, word count 100-400 |

### Stale-listing only
| Tool                       | Type          | What it does                                       |
|----------------------------|---------------|----------------------------------------------------|
| `compute_price_drop`       | deterministic | Floor-rounded % drop with cost-floor clamp (LLMs can't do float math) |
| `check_action_eligibility` | deterministic | Anti-oscillation: blocks actions taken within `min_days_between_actions` |

All tools are PURE functions — no API calls, no DB. Same rules the n8n nodes
use, so agent and Gemini paths produce comparable outputs.

## Tool-use loop pattern (both agents)

```
1. Send prompt + tool definitions to Anthropic
2. Model responds with either:
   a. tool_use → execute tool(s), send results back, loop
   b. end_turn → parse final JSON, return
3. Hard cap: MAX_ITERATIONS (5 for listing, 6 for stale-listing)
4. POST-loop validation (stale-listing): confirm required tools were called
   before accepting a price/title change. Rejects "agent hallucinated a price"
   bugs.
```

Each tool call is logged into `result.agent.tool_calls` for replay /
"show your work" portfolio UI.

## Environment variables

| Var                     | Purpose                                          | Default  |
|-------------------------|--------------------------------------------------|----------|
| `AGENT_MODE`            | `"true"` flips on the agent path                 | `false`  |
| `ANTHROPIC_API_KEY`     | Required when `AGENT_MODE=true`                  | unset    |
| `AGENT_INTERNAL_SECRET` | Shared secret for n8n → `/api/agents/*`          | unset    |

## Cost

At Sonnet 4.5 prices (~$3/MTok input, $15/MTok output):

**Listing generation** (1-2 critique loops typical):
- Single shot: ~$0.005-0.01
- Worst case (5 iter): ~$0.02-0.03
- 100 listings/mo: ~$1-3/mo

**Stale-listing decision** (smaller prompt, 1-3 tool calls typical):
- Single shot: ~$0.002-0.005
- Worst case (6 iter): ~$0.01-0.02
- 50 stale checks/wk = 200/mo: ~$0.40-1.00/mo

Combined ceiling at flag-flip: ~$3-5/mo. When Gemini's $10/mo runs out,
this is the fallback.

## n8n integration

### Stale Listing Reviver workflow Switch node
```
Switch: { value: $env.AGENT_MODE, equals: "true" }
  ├── true  → HTTP Request node → POST {SCRYVAULT_URL}/api/agents/stale-listing
  │           Headers: x-agent-secret = {{ $env.AGENT_INTERNAL_SECRET }}
  │           Body:    full StaleListingInput (built from upstream nodes)
  │           Response unwrap: $json.data.decision
  └── false → existing rule-based Determine Tier + Diagnose Problem chain
```

Both branches converge to the same downstream node (Revise on eBay) since
both produce `{ action, new_title?, new_price? }`.

### Listing generation Switch
The user-facing /api/listings/generate route handles the flag check itself —
no n8n Switch needed for that path. The n8n SUB_Title_Generator workflow
remains the Gemini path; when AGENT_MODE flips, requests bypass n8n entirely
for listing generation.

## Toggling the flag

**Local dev (.env.local):**
```
AGENT_MODE=true
ANTHROPIC_API_KEY=sk-ant-...
AGENT_INTERNAL_SECRET=<random-string>
```

**Production (Vercel):**
- Add the three env vars in Vercel project settings
- Redeploy (or use runtime env hot reload)

**Rollback:** flip `AGENT_MODE=false`, redeploy. Gemini paths resume.

## Future work (not yet built)

| Add               | Where                              | Why                                |
|-------------------|------------------------------------|------------------------------------|
| Trace UI          | staging page component             | Surface tool_calls + reasoning for portfolio "show your work" |
| Comp lookup tool  | tools.ts                           | Real eBay sold-listing comps for price suggestions |
| Photo condition agent | new agent module                | Vision-based condition assessment from photos |
| Category lookup   | tools.ts                           | eBay category picker (deferred — Aeldern Tomes uses one category) |
| Prompt caching    | both agents                        | Cache the SYSTEM_PROMPT for ~90% input cost reduction at scale |
