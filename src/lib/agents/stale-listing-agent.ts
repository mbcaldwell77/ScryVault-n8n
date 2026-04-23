/**
 * Stale Listing Decision Agent
 *
 * Canonical "n8n triggers → Agent SDK decides → n8n executes" pattern.
 * - n8n cron job pulls stale candidates + traffic data from Supabase
 * - n8n calls POST /api/agents/stale-listing with this input
 * - Agent decides: revise title? lower price? both? leave alone? human review?
 * - Agent returns decision + drafted artifacts (new title, new price)
 * - n8n executes the eBay revise call
 *
 * Tools available to the agent:
 *   - critique_title (from tools.ts) — for validating drafted titles
 *   - compute_price_drop — for the math (LLMs can't be trusted with floats)
 *   - check_action_eligibility — anti-oscillation guard
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  ContentBlock,
  ToolUseBlock,
  TextBlock,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { TOOL_EXECUTORS, critiqueTitleTool } from "./tools";
import {
  STALE_LISTING_TOOL_DEFINITIONS,
  STALE_LISTING_TOOL_EXECUTORS,
} from "./stale-listing-tools";
import type { AgentToolCall } from "./types";
import type {
  StaleListingInput,
  StaleListingResult,
  StaleListingDecision,
} from "./stale-listing-types";

// ─── Configuration ─────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 2048;
const MAX_ITERATIONS = 6;

const COST_INPUT_PER_MTOK = 3.0;
const COST_OUTPUT_PER_MTOK = 15.0;

// ─── System prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a decision agent for an eBay collectible bookstore (Aeldern Tomes). Your job: review a stale listing and recommend ONE action.

The five possible actions:
1. revise_title         — rearrange the title to refresh Cassini search ranking; no price change
2. lower_price          — drop the price by the configured percentage; no title change
3. revise_and_lower     — both
4. no_action            — listing has organic momentum (watchers, recent views) OR is at cost floor with no other lever; leave it alone
5. needs_human          — edge case the agent can't confidently decide; flag for Michael

Decision heuristics (apply in order):

A. ELIGIBILITY GATE (always check first via check_action_eligibility tool)
   - If the proposed action is blocked by min_days_between_actions, you MUST pick a different action OR no_action.

B. ORGANIC MOMENTUM CHECK
   - If watchers_count >= 3 → strong signal someone is interested. Recommend no_action unless listing has been totally inactive (page_views_30d < 2).
   - If page_views_30d >= 20 AND watchers_count >= 1 → search-engine is finding it; recommend no_action.

C. PRICE FLOOR CHECK
   - Always run compute_price_drop BEFORE recommending lower_price or revise_and_lower.
   - If at_cost_floor=true AND price_changed=false → cannot lower further. Choose between revise_title (if eligible) and no_action.

D. TITLE FRESHNESS
   - If days_since_last_revision is null OR > 60 → title is "stale" enough to benefit from revision.
   - If a recent revision (< 30d) AND watchers_count == 0 → second revision unlikely to help; consider lower_price instead.

E. COMBINED ACTION
   - Only revise_and_lower when BOTH levers are appropriate AND eligible.
   - Don't combine if you're at the price floor (just revise) or recently revised (just lower).

WORKFLOW:
1. Read the input. Form a hypothesis about which action is right.
2. Run check_action_eligibility on your hypothesis.
3. If lowering price: run compute_price_drop to get the correct new_price.
4. If revising title: draft a title, then run critique_title to validate. Iterate if needed.
5. Once your decision is consistent + tools-validated, return JSON.

OUTPUT FORMAT (final message must be ONLY this JSON, no markdown fences):
{
  "action": "revise_title" | "lower_price" | "revise_and_lower" | "no_action" | "needs_human",
  "reasoning": "1-3 sentence explanation citing the signals you weighed",
  "new_title": "..." (only if action involves revise),
  "new_price": 17.97 (only if action involves lower; MUST come from compute_price_drop),
  "human_review_reason": "..." (only if action == needs_human)
}

Be conservative. The default for ambiguous cases is no_action — don't churn the listing for the sake of activity.`;

// ─── Public entry point ────────────────────────────────────────────────────

export async function runStaleListingAgent(
  input: StaleListingInput,
): Promise<StaleListingResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set — cannot run stale-listing agent path.",
    );
  }

  const client = new Anthropic({ apiKey });

  // Combined tool list: critique_title (from listing-agent tools) + stale-specific
  const tools: Tool[] = [critiqueTitleTool, ...STALE_LISTING_TOOL_DEFINITIONS];

  // Combined executor map
  const executors = {
    ...TOOL_EXECUTORS,
    ...STALE_LISTING_TOOL_EXECUTORS,
  };

  const userMessage = buildUserMessage(input);

  const messages: MessageParam[] = [{ role: "user", content: userMessage }];

  const toolCalls: AgentToolCall[] = [];
  const selfCritiques: string[] = [];
  let iterations = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalDecision: StaleListingDecision | null = null;

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;

    const response: Message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // System prompt cached — the heuristics block is large + identical every
      // call. ~90% input cost reduction on cache hits, break-even at ~4 calls.
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    if (response.stop_reason === "end_turn") {
      const text = extractText(response.content);
      finalDecision = parseDecisionJson(text);
      if (text) selfCritiques.push(text);
      break;
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const thinkingText = extractText(response.content);
      if (thinkingText) selfCritiques.push(thinkingText);

      const toolResults = response.content
        .filter((b): b is ToolUseBlock => b.type === "tool_use")
        .map((toolUse) => {
          const start = Date.now();
          const executor = executors[toolUse.name];
          let output: unknown;
          let isError = false;
          try {
            if (!executor) throw new Error(`Unknown tool: ${toolUse.name}`);
            output = executor(toolUse.input as Record<string, unknown>);
          } catch (err) {
            output = { error: err instanceof Error ? err.message : String(err) };
            isError = true;
          }
          const duration = Date.now() - start;

          toolCalls.push({
            tool: toolUse.name,
            input: toolUse.input as Record<string, unknown>,
            output,
            duration_ms: duration,
          });

          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: JSON.stringify(output),
            is_error: isError,
          };
        });

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    throw new Error(
      `Stale-listing agent stopped unexpectedly: ${response.stop_reason}. ` +
        `Iterations: ${iterations}, tokens: in=${totalInputTokens} out=${totalOutputTokens}.`,
    );
  }

  if (!finalDecision) {
    throw new Error(
      `Stale-listing agent hit MAX_ITERATIONS (${MAX_ITERATIONS}) without a final decision.`,
    );
  }

  // Cross-check: if action involves price change, new_price MUST have come from compute_price_drop.
  // If action involves title change, new_title MUST have passed critique_title.
  const actionUsesPrice =
    finalDecision.action === "lower_price" ||
    finalDecision.action === "revise_and_lower";
  const actionUsesTitle =
    finalDecision.action === "revise_title" ||
    finalDecision.action === "revise_and_lower";

  if (actionUsesPrice && finalDecision.new_price == null) {
    throw new Error(
      `Agent action '${finalDecision.action}' requires new_price but none provided.`,
    );
  }
  if (actionUsesTitle && !finalDecision.new_title) {
    throw new Error(
      `Agent action '${finalDecision.action}' requires new_title but none provided.`,
    );
  }
  if (
    actionUsesPrice &&
    !toolCalls.some((c) => c.tool === "compute_price_drop")
  ) {
    throw new Error(
      `Agent proposed price change without calling compute_price_drop tool — rejecting.`,
    );
  }
  if (
    actionUsesTitle &&
    !toolCalls.some((c) => c.tool === "critique_title")
  ) {
    throw new Error(
      `Agent proposed title change without calling critique_title tool — rejecting.`,
    );
  }

  const estimatedCost =
    (totalInputTokens / 1_000_000) * COST_INPUT_PER_MTOK +
    (totalOutputTokens / 1_000_000) * COST_OUTPUT_PER_MTOK;

  return {
    decision: finalDecision,
    usage: {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      estimated_cost: Number(estimatedCost.toFixed(4)),
    },
    agent: {
      path: "anthropic-agent",
      iterations,
      tool_calls: toolCalls,
      self_critiques: selfCritiques,
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildUserMessage(input: StaleListingInput): string {
  return `Review this stale listing and recommend an action.

## Listing State
- eBay Item ID: ${input.ebay_item_id}
- Current Title: "${input.current_title}"
- Current Price: $${input.current_price.toFixed(2)}
- Cost Basis: $${input.cost_basis.toFixed(2)}

## Book Metadata
- Title: ${input.book_metadata.title}
- Authors: ${input.book_metadata.authors?.join(", ") || "n/a"}
- Format: ${input.book_metadata.format || "n/a"}
- Edition: ${input.book_metadata.edition || "n/a"}
- Star Wars: ${input.book_metadata.is_star_wars ? "yes" : "no"}
- Star Wars Legends: ${input.book_metadata.is_legends ? "yes" : "no"}

## Staleness Signals
- Days since listed: ${input.days_since_listed}
- Days since last revision: ${input.days_since_last_revision ?? "never revised"}
- Days since last price drop: ${input.days_since_last_price_drop ?? "never dropped"}
- Page views (30d): ${input.page_views_30d}
- Watchers: ${input.watchers_count}

## Config
- Price drop %: ${input.config.price_drop_pct}
- Cost floor buffer: $${input.config.cost_floor_buffer.toFixed(2)}
- Min days between actions: ${input.config.min_days_between_actions}

Apply the heuristics from your system prompt. Use the tools. Return ONLY the final JSON.`;
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function parseDecisionJson(text: string): StaleListingDecision {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Stale-listing agent returned non-JSON: ${err instanceof Error ? err.message : String(err)}. ` +
        `First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Stale-listing agent returned non-object: ${typeof parsed}`);
  }

  const obj = parsed as Record<string, unknown>;
  const validActions = [
    "revise_title",
    "lower_price",
    "revise_and_lower",
    "no_action",
    "needs_human",
  ];

  if (typeof obj.action !== "string" || !validActions.includes(obj.action)) {
    throw new Error(
      `Stale-listing agent returned invalid action: ${JSON.stringify(obj.action)}`,
    );
  }
  if (typeof obj.reasoning !== "string") {
    throw new Error("Stale-listing agent missing string field: reasoning");
  }

  return {
    action: obj.action as StaleListingDecision["action"],
    reasoning: obj.reasoning,
    new_title:
      typeof obj.new_title === "string" ? obj.new_title : undefined,
    new_price:
      typeof obj.new_price === "number" ? obj.new_price : undefined,
    human_review_reason:
      typeof obj.human_review_reason === "string"
        ? obj.human_review_reason
        : undefined,
  };
}
