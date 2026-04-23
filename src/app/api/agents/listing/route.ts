/**
 * POST /api/agents/listing
 *
 * Internal endpoint for n8n workflows to invoke the Anthropic Agent SDK
 * listing-generation loop. The user-facing /api/listings/generate route also
 * dispatches here when AGENT_MODE=true.
 *
 * Auth: shared secret header (AGENT_INTERNAL_SECRET) — n8n sends it,
 * we verify it. NOT a Supabase user route.
 *
 * Request body matches ListingGenerationInput from src/lib/claude/types.ts.
 * Response is AgentGenerationResult.
 */

import { NextRequest, NextResponse } from "next/server";
import { runListingAgent, hasAnthropicCredentials } from "@/lib/agents";
import type { AgentInput } from "@/lib/agents";

const REQUIRED_HEADER = "x-agent-secret";

export async function POST(request: NextRequest) {
  // Auth — n8n must send shared secret header
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

  let input: AgentInput;
  try {
    input = (await request.json()) as AgentInput;
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body", code: "BAD_REQUEST" } },
      { status: 400 },
    );
  }

  // Minimal validation — full schema check could be added later
  if (!input.title || typeof input.title !== "string") {
    return NextResponse.json(
      { error: { message: "title is required", code: "BAD_REQUEST" } },
      { status: 400 },
    );
  }
  if (!input.condition || typeof input.condition !== "string") {
    return NextResponse.json(
      { error: { message: "condition is required", code: "BAD_REQUEST" } },
      { status: 400 },
    );
  }

  try {
    const result = await runListingAgent(input);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[AGENTS_LISTING]", error);
    const message = error instanceof Error ? error.message : "Agent loop failed";
    return NextResponse.json(
      { error: { message, code: "AGENT_FAILED" } },
      { status: 500 },
    );
  }
}
