/**
 * Listing Agent — Anthropic SDK tool-use loop for eBay listing generation.
 *
 * Pattern: prompt → draft → critique (tool call) → revise if needed → final.
 * Max 5 iterations to prevent runaway loops. Each tool call is logged into
 * AgentToolCall for replay / portfolio "show your work" UI.
 *
 * The agent has TWO tools:
 *   - critique_title: deterministic Cassini SEO check
 *   - validate_description: deterministic HTML safety check
 *
 * The agent DOES NOT have access to the database, eBay API, or any external
 * services. Pure prompt + critic loop. n8n stays the orchestration layer for
 * any side-effecting work (saving the listing, calling eBay).
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  ContentBlock,
  ToolUseBlock,
  TextBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { SYSTEM_PROMPT, buildGenerationPrompt } from "@/lib/claude/prompts";
import type { GeneratedListing } from "@/lib/claude/types";
import type { AgentGenerationResult, AgentInput, AgentToolCall } from "./types";
import { TOOL_DEFINITIONS, TOOL_EXECUTORS } from "./tools";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 4096;
const MAX_ITERATIONS = 5;

// Prices per million tokens for cost estimation (Sonnet 4.5 as of writing)
const COST_INPUT_PER_MTOK = 3.0;
const COST_OUTPUT_PER_MTOK = 15.0;

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function runListingAgent(
  input: AgentInput,
): Promise<AgentGenerationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set — cannot run agent path. " +
        "Either set the env var or disable AGENT_MODE.",
    );
  }

  const client = new Anthropic({ apiKey });

  // Build the user message — same prompt the Gemini path uses, plus a
  // critic-loop nudge so the agent uses its tools.
  const userMessage = buildAgentUserMessage(input);

  // Conversation state
  const messages: MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  // Trace state
  const toolCalls: AgentToolCall[] = [];
  const selfCritiques: string[] = [];
  let iterations = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalListing: GeneratedListing | null = null;

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;

    const response: Message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // System prompt cached — same text every call. ~90% input token cost
      // reduction on cache hits. Cache writes cost +25% but break even at ~4 calls.
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: TOOL_DEFINITIONS,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // If the model is done thinking and just returns text, parse it as the final listing
    if (response.stop_reason === "end_turn") {
      const text = extractText(response.content);
      finalListing = parseListingJson(text);
      // Save the assistant's final text as a self-critique entry too
      if (text) selfCritiques.push(text);
      break;
    }

    // If the model wants tools, execute them and feed results back
    if (response.stop_reason === "tool_use") {
      // Add the model's response (tool_use blocks) to the conversation
      messages.push({ role: "assistant", content: response.content });

      // Capture any text the model included alongside its tool calls
      // (this is its "thinking out loud" — useful for the trace)
      const thinkingText = extractText(response.content);
      if (thinkingText) selfCritiques.push(thinkingText);

      // Execute each tool call
      const toolResults = response.content
        .filter((b): b is ToolUseBlock => b.type === "tool_use")
        .map((toolUse) => {
          const start = Date.now();
          const executor = TOOL_EXECUTORS[toolUse.name];
          let output: unknown;
          let isError = false;
          try {
            if (!executor) throw new Error(`Unknown tool: ${toolUse.name}`);
            output = executor(toolUse.input as Record<string, unknown>);
          } catch (err) {
            output = {
              error: err instanceof Error ? err.message : String(err),
            };
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

    // Unexpected stop reason (e.g., max_tokens) — bail with what we have
    throw new Error(
      `Agent loop stopped unexpectedly: ${response.stop_reason}. ` +
        `Iterations: ${iterations}, tokens: in=${totalInputTokens} out=${totalOutputTokens}.`,
    );
  }

  if (!finalListing) {
    throw new Error(
      `Agent loop hit MAX_ITERATIONS (${MAX_ITERATIONS}) without producing a final listing.`,
    );
  }

  const estimatedCost =
    (totalInputTokens / 1_000_000) * COST_INPUT_PER_MTOK +
    (totalOutputTokens / 1_000_000) * COST_OUTPUT_PER_MTOK;

  return {
    listing: finalListing,
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildAgentUserMessage(input: AgentInput): string {
  const basePrompt = buildGenerationPrompt(input);

  // Append agent-specific instructions: USE THE TOOLS
  return `${basePrompt}

## Agent Workflow Instructions

You have access to two tools:
1. \`critique_title\` — checks your draft title against Cassini SEO rules
2. \`validate_description\` — checks your HTML description for safety + length

REQUIRED WORKFLOW:
1. Draft your initial \`listing_title\` and \`listing_description\`
2. Call \`critique_title\` with your draft title and the book metadata
3. Call \`validate_description\` with your draft HTML description
4. If either tool returns violations, REVISE and call the tool again until both pass
5. Once both tools pass, return the final JSON (no more tool calls)

Return ONLY the final JSON object as your last message — no markdown, no commentary.`;
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function parseListingJson(text: string): GeneratedListing {
  // Strip markdown code fences if present (defensive — prompt says don't use them)
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Agent returned non-JSON final message: ${err instanceof Error ? err.message : String(err)}. ` +
        `First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Agent returned non-object JSON: ${typeof parsed}`);
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.listing_title !== "string") {
    throw new Error("Agent JSON missing string field: listing_title");
  }
  if (typeof obj.listing_description !== "string") {
    throw new Error("Agent JSON missing string field: listing_description");
  }
  if (typeof obj.listing_condition_notes !== "string") {
    throw new Error("Agent JSON missing string field: listing_condition_notes");
  }

  return {
    listing_title: obj.listing_title,
    listing_description: obj.listing_description,
    listing_condition_notes: obj.listing_condition_notes,
    suggested_price:
      typeof obj.suggested_price === "number" ? obj.suggested_price : null,
  };
}
