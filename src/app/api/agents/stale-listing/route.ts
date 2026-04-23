/**
 * POST /api/agents/stale-listing
 *
 * Internal endpoint for the n8n Stale Listing Reviver workflow to invoke
 * the stale-listing decision agent.
 *
 * Pattern:
 *   n8n triggers (cron) → fetches stale candidates + traffic → calls THIS →
 *   agent decides → returns decision → n8n executes eBay revise call
 *
 * Auth: shared secret (x-agent-secret header == AGENT_INTERNAL_SECRET env).
 *
 * Request body: StaleListingInput (see lib/agents/stale-listing-types.ts).
 * Response:     { data: StaleListingResult }
 */

import { NextRequest, NextResponse } from "next/server";
import { runStaleListingAgent, hasAnthropicCredentials } from "@/lib/agents";
import type { StaleListingInput } from "@/lib/agents";

const REQUIRED_HEADER = "x-agent-secret";

export async function POST(request: NextRequest) {
  // Auth
  const expected = process.env.AGENT_INTERNAL_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: { message: "AGENT_INTERNAL_SECRET not configured", code: "MISCONFIGURED" } },
      { status: 500 },
    );
  }
  const provided = request.headers.get(REQUIRED_HEADER);
  if (provided !== expected) {
    return NextResponse.json(
      { error: { message: "Invalid agent secret", code: "UNAUTHORIZED" } },
      { status: 401 },
    );
  }

  if (!hasAnthropicCredentials()) {
    return NextResponse.json(
      { error: { message: "ANTHROPIC_API_KEY not set", code: "MISCONFIGURED" } },
      { status: 500 },
    );
  }

  let input: StaleListingInput;
  try {
    input = (await request.json()) as StaleListingInput;
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body", code: "BAD_REQUEST" } },
      { status: 400 },
    );
  }

  // Minimal shape validation
  const required: (keyof StaleListingInput)[] = [
    "ebay_item_id",
    "current_title",
    "current_price",
    "cost_basis",
    "book_metadata",
    "days_since_listed",
    "page_views_30d",
    "watchers_count",
    "config",
  ];
  for (const key of required) {
    if (input[key] == null) {
      return NextResponse.json(
        { error: { message: `Missing required field: ${key}`, code: "BAD_REQUEST" } },
        { status: 400 },
      );
    }
  }

  // Config sanity
  if (
    input.config.price_drop_pct == null ||
    input.config.cost_floor_buffer == null ||
    input.config.min_days_between_actions == null
  ) {
    return NextResponse.json(
      { error: { message: "config requires price_drop_pct, cost_floor_buffer, min_days_between_actions", code: "BAD_REQUEST" } },
      { status: 400 },
    );
  }

  try {
    const result = await runStaleListingAgent(input);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[AGENTS_STALE_LISTING]", error);
    const message = error instanceof Error ? error.message : "Stale-listing agent failed";
    return NextResponse.json(
      { error: { message, code: "AGENT_FAILED" } },
      { status: 500 },
    );
  }
}
