/**
 * Tools available to the Stale Listing decision agent.
 *
 * The agent reuses `critique_title` from tools.ts (when it drafts a revised
 * title) and gets a NEW `compute_price_drop` tool here. We don't trust LLMs to
 * do floating-point math — the tool computes the correct price using the same
 * rules the n8n Calculate Tier 1 Price node uses.
 */

import type { Tool } from "@anthropic-ai/sdk/resources/messages";

// ─────────────────────────────────────────────────────────────────────────────
// Tool: compute_price_drop — the math the agent must NOT do itself
// ─────────────────────────────────────────────────────────────────────────────

export const computePriceDropTool: Tool = {
  name: "compute_price_drop",
  description:
    "Compute the correct new price after a percentage drop, honoring the " +
    "cost floor (cost_basis + buffer). Returns the computed price plus a flag " +
    "indicating whether the listing is already at the floor. " +
    "ALWAYS use this tool — never compute prices yourself.",
  input_schema: {
    type: "object",
    properties: {
      current_price: { type: "number" },
      cost_basis: { type: "number" },
      drop_pct: {
        type: "number",
        description: "Percentage to drop (e.g., 5 for 5%)",
      },
      cost_floor_buffer: {
        type: "number",
        description: "Min margin above cost_basis to keep (e.g., 2.00)",
      },
    },
    required: ["current_price", "cost_basis", "drop_pct", "cost_floor_buffer"],
  },
};

export interface ComputePriceDropInput {
  current_price: number;
  cost_basis: number;
  drop_pct: number;
  cost_floor_buffer: number;
}

export interface ComputePriceDropOutput {
  new_price: number;
  actual_drop_pct: number;
  at_cost_floor: boolean;
  cost_floor_value: number;
  price_changed: boolean;
  notes: string[];
}

/**
 * Same math as the n8n Calculate Tier 1 Price node.
 * - new_price = current_price * (1 - drop_pct/100)
 * - floor to cent so drop is always >= drop_pct
 * - if new_price < cost_basis + buffer → clamp to floor
 * - price_changed only if final < current
 */
export function computePriceDrop(
  input: ComputePriceDropInput,
): ComputePriceDropOutput {
  const { current_price, cost_basis, drop_pct, cost_floor_buffer } = input;
  const notes: string[] = [];

  const costFloor = Number((cost_basis + cost_floor_buffer).toFixed(2));

  // Initial calculation
  let newPrice = current_price * (1 - drop_pct / 100);
  // Floor to cent so drop is always >= drop_pct
  newPrice = Math.floor(newPrice * 100) / 100;

  let atFloor = false;
  if (newPrice < costFloor) {
    newPrice = costFloor;
    atFloor = true;
    notes.push(
      `Computed price was below cost floor ($${costFloor.toFixed(2)} = cost_basis + buffer); clamped to floor.`,
    );
  }

  const priceChanged = newPrice < current_price;
  if (!priceChanged) {
    notes.push(
      "Listing is already at or below the cost floor — cannot drop further. Recommend no_action or needs_human.",
    );
  }

  const actualDropPct = priceChanged
    ? Number(
        (((current_price - newPrice) / current_price) * 100).toFixed(2),
      )
    : 0;

  return {
    new_price: newPrice,
    actual_drop_pct: actualDropPct,
    at_cost_floor: atFloor,
    cost_floor_value: costFloor,
    price_changed: priceChanged,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool: check_action_eligibility — anti-oscillation guard
// ─────────────────────────────────────────────────────────────────────────────

export const checkActionEligibilityTool: Tool = {
  name: "check_action_eligibility",
  description:
    "Check whether a listing is eligible for a new action based on " +
    "min_days_between_actions config. Prevents oscillating revisions.",
  input_schema: {
    type: "object",
    properties: {
      days_since_last_revision: {
        type: ["number", "null"],
        description: "Days since last title revision (null if never)",
      },
      days_since_last_price_drop: {
        type: ["number", "null"],
        description: "Days since last price drop (null if never)",
      },
      min_days_between_actions: { type: "number" },
      proposed_action: {
        type: "string",
        enum: ["revise_title", "lower_price", "revise_and_lower"],
      },
    },
    required: ["min_days_between_actions", "proposed_action"],
  },
};

export interface CheckActionEligibilityInput {
  days_since_last_revision: number | null;
  days_since_last_price_drop: number | null;
  min_days_between_actions: number;
  proposed_action: "revise_title" | "lower_price" | "revise_and_lower";
}

export interface CheckActionEligibilityOutput {
  eligible: boolean;
  blocking_reason: string | null;
}

export function checkActionEligibility(
  input: CheckActionEligibilityInput,
): CheckActionEligibilityOutput {
  const { proposed_action, min_days_between_actions } = input;
  const dsr = input.days_since_last_revision;
  const dsp = input.days_since_last_price_drop;

  if (proposed_action === "revise_title" || proposed_action === "revise_and_lower") {
    if (dsr !== null && dsr < min_days_between_actions) {
      return {
        eligible: false,
        blocking_reason: `Title revised ${dsr}d ago; must wait ${min_days_between_actions - dsr}d more.`,
      };
    }
  }

  if (proposed_action === "lower_price" || proposed_action === "revise_and_lower") {
    if (dsp !== null && dsp < min_days_between_actions) {
      return {
        eligible: false,
        blocking_reason: `Price dropped ${dsp}d ago; must wait ${min_days_between_actions - dsp}d more.`,
      };
    }
  }

  return { eligible: true, blocking_reason: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registry — combined with critique_title from tools.ts at the agent layer
// ─────────────────────────────────────────────────────────────────────────────

export const STALE_LISTING_TOOL_DEFINITIONS: Tool[] = [
  computePriceDropTool,
  checkActionEligibilityTool,
];

export type ToolExecutor = (input: Record<string, unknown>) => unknown;

export const STALE_LISTING_TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  compute_price_drop: (input) =>
    computePriceDrop(input as unknown as ComputePriceDropInput),
  check_action_eligibility: (input) =>
    checkActionEligibility(input as unknown as CheckActionEligibilityInput),
};
