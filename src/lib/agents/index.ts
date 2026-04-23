/**
 * Agents module — Anthropic SDK tool-use loop for ScryVault listing generation.
 *
 * Public API: just runListingAgent(input) and the feature flag helpers.
 * Everything else is internal.
 *
 * Cost path: ~$0.01-0.03 per listing at Sonnet 4.5 prices, depending on how
 * many critique iterations the agent runs. Default budget: AGENT_MODE=false
 * keeps this code OFF until Gemini credits run out.
 */

// Listing generation agent (replaces Gemini SUB_Title_Generator + SUB_Description)
export { runListingAgent } from "./listing-agent";
export type { AgentGenerationResult, AgentInput, AgentToolCall, AgentPathName } from "./types";

// Stale listing decision agent (replaces n8n Determine Tier + Diagnose Problem rules)
export { runStaleListingAgent } from "./stale-listing-agent";
export type {
  StaleListingInput,
  StaleListingResult,
  StaleListingDecision,
  StaleListingAction,
  StaleListingBookMetadata,
  StaleListingConfig,
} from "./stale-listing-types";

// Feature flag (shared by all agent paths)
export { isAgentModeEnabled, hasAnthropicCredentials, shouldUseAgent } from "./feature-flag";
