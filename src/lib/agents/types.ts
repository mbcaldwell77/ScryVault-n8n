/**
 * Agent-specific types. Agent path returns the same shape as the Gemini path
 * (GenerationResult) so the API route is path-agnostic — but adds extra
 * provenance fields so we can tell which path produced an output.
 */

import type { GenerationResult, ListingGenerationInput } from "@/lib/claude/types";

export type AgentPathName = "anthropic-agent" | "gemini-n8n";

/**
 * Trace entry for one tool call inside the agent loop.
 * Useful for debugging + portfolio "show your work" UI.
 */
export interface AgentToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  duration_ms: number;
}

/**
 * Augmented result. Wraps the standard GenerationResult and adds
 * agent-specific fields. The `data` shape matches what the existing
 * /api/listings/generate route already returns.
 */
export interface AgentGenerationResult extends GenerationResult {
  agent: {
    path: AgentPathName;
    iterations: number;
    tool_calls: AgentToolCall[];
    self_critiques: string[];
  };
}

export type AgentInput = ListingGenerationInput;
