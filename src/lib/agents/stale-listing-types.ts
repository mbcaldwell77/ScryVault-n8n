/**
 * Types for the Stale Listing decision agent.
 *
 * Inputs: listing state + traffic signals + config knobs.
 * Outputs: an action recommendation (revise / lower / both / no_action / needs_human).
 *
 * n8n Stale Listing Reviver workflow calls the agent with this payload,
 * gets back a decision, and executes the corresponding eBay revise call.
 */

import type { AgentToolCall, AgentPathName } from "./types";

// ─── Input ─────────────────────────────────────────────────────────────────

export interface StaleListingBookMetadata {
  title: string;
  authors?: string[];
  format?: string; // "HC" | "TPB" | "MMPB"
  edition?: string;
  is_star_wars?: boolean;
  is_legends?: boolean;
}

export interface StaleListingConfig {
  /** % drop to apply when lowering price (default 5) */
  price_drop_pct: number;
  /** Min margin above cost basis to keep (default $2.00) */
  cost_floor_buffer: number;
  /** Don't act on a listing acted on in the last N days (default 14) */
  min_days_between_actions: number;
}

export interface StaleListingInput {
  ebay_item_id: string;
  inventory_item_id: string;

  current_title: string;
  current_price: number;
  cost_basis: number;

  book_metadata: StaleListingBookMetadata;

  // Staleness signals
  days_since_listed: number;
  days_since_last_revision: number | null;
  days_since_last_price_drop: number | null;

  // Traffic data (last 30 days)
  page_views_30d: number;
  watchers_count: number;

  config: StaleListingConfig;
}

// ─── Output ────────────────────────────────────────────────────────────────

export type StaleListingAction =
  | "revise_title"
  | "lower_price"
  | "revise_and_lower"
  | "no_action"
  | "needs_human";

export interface StaleListingDecision {
  action: StaleListingAction;
  reasoning: string;
  new_title?: string;
  new_price?: number;
  human_review_reason?: string;
}

export interface StaleListingResult {
  decision: StaleListingDecision;
  usage: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost: number;
  };
  agent: {
    path: AgentPathName;
    iterations: number;
    tool_calls: AgentToolCall[];
    self_critiques: string[];
  };
}
