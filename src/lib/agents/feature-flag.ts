/**
 * Agent SDK feature flag
 *
 * Default OFF — Gemini (via n8n) handles all listing generation.
 * Flip ON when ready to route through the Anthropic Agent SDK loop.
 *
 * Set in .env.local:
 *   AGENT_MODE=true   # use Anthropic Agent SDK
 *   AGENT_MODE=false  # use Gemini via n8n (default)
 */
export function isAgentModeEnabled(): boolean {
  return process.env.AGENT_MODE === "true";
}

/**
 * Anthropic API key check — agent mode requires this to be set.
 * Returns false if AGENT_MODE=true but key is missing (we'll fall back to n8n).
 */
export function hasAnthropicCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Single source of truth: should this request use the agent path?
 * True only if flag is ON AND credentials exist.
 */
export function shouldUseAgent(): boolean {
  return isAgentModeEnabled() && hasAnthropicCredentials();
}
