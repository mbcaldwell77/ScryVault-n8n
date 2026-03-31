// n8n Edition: Claude API calls are handled by n8n workflows, not this app.
// This file exists only to prevent import errors from shared type references.

export function getAnthropicClient(): never {
  throw new Error("Claude API is handled by n8n workflows in the n8n Edition. This function should not be called.");
}
