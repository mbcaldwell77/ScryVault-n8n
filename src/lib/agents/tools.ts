/**
 * Agent tool definitions.
 *
 * Each tool is a deterministic function the agent can call to validate or
 * critique its own draft. Tools are pure (no side effects) — they read inputs
 * and return verdicts. The agent decides what to do with the verdict.
 *
 * This is the "show your work" surface: every tool call is logged into
 * AgentToolCall so we can replay the agent's reasoning.
 */

import type { Tool } from "@anthropic-ai/sdk/resources/messages";

// ─────────────────────────────────────────────────────────────────────────────
// Tool: critique_title — apply Aeldern Tomes Cassini SEO rules
// ─────────────────────────────────────────────────────────────────────────────

export const critiqueTitleTool: Tool = {
  name: "critique_title",
  description:
    "Critique an eBay listing title against Aeldern Tomes Cassini SEO rules. " +
    "Returns a list of violations (or empty list if clean). " +
    "Use this AFTER drafting a title and BEFORE returning the final listing. " +
    "If violations exist, revise the title and call this tool again.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "The eBay listing title to critique (max 80 chars).",
      },
      book_metadata: {
        type: "object",
        description:
          "The book's metadata so the critic can verify keyword preservation.",
        properties: {
          title: { type: "string" },
          authors: { type: "array", items: { type: "string" } },
          format: { type: "string" },
          edition: { type: "string" },
          is_star_wars: { type: "boolean" },
          is_legends: { type: "boolean" },
        },
        required: ["title"],
      },
    },
    required: ["title", "book_metadata"],
  },
};

export interface TitleCritiqueInput {
  title: string;
  book_metadata: {
    title: string;
    authors?: string[];
    format?: string;
    edition?: string;
    is_star_wars?: boolean;
    is_legends?: boolean;
  };
}

export interface TitleCritiqueOutput {
  passed: boolean;
  violations: string[];
  warnings: string[];
}

/**
 * Pure deterministic critic. NO LLM calls — runs the exact same rules
 * the n8n SUB_Title_Generator uses, so the agent and Gemini paths produce
 * comparable outputs.
 */
export function critiqueTitle(input: TitleCritiqueInput): TitleCritiqueOutput {
  const violations: string[] = [];
  const warnings: string[] = [];
  const { title, book_metadata } = input;

  // Hard rule: 80 char max
  if (title.length > 80) {
    violations.push(`Title is ${title.length} chars, max 80.`);
  }

  // Forbidden punctuation (Cassini noise)
  const forbidden = /[,\-/—:;]/;
  const match = title.match(forbidden);
  if (match) {
    violations.push(
      `Forbidden punctuation '${match[0]}' — only periods (in initials) allowed.`,
    );
  }

  // No all caps
  const wordsOver3Char = title.split(/\s+/).filter((w) => w.length > 3);
  const allCapsWords = wordsOver3Char.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w));
  if (allCapsWords.length > wordsOver3Char.length * 0.5) {
    violations.push("Too many ALL CAPS words — looks spammy.");
  }

  // Keyword preservation: original title words must appear
  const originalWords = book_metadata.title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const titleLower = title.toLowerCase();
  const preserved = originalWords.filter((w) => titleLower.includes(w));
  const preservedRatio = originalWords.length > 0 ? preserved.length / originalWords.length : 1;
  if (preservedRatio < 0.7) {
    violations.push(
      `Only ${Math.round(preservedRatio * 100)}% of original title keywords preserved (need ≥70%).`,
    );
  }

  // Star Wars special case
  if (book_metadata.is_star_wars) {
    if (!/^star wars/i.test(title)) {
      violations.push("Star Wars titles must start with 'Star Wars'.");
    }
    if (book_metadata.is_legends && !/legends?$/i.test(title.trim())) {
      warnings.push("Legends should appear at end of title for Star Wars Legends books.");
    }
  }

  // Author preservation (warning if missing)
  if (book_metadata.authors && book_metadata.authors.length > 0) {
    const lastName = book_metadata.authors[0].split(/\s+/).pop()?.toLowerCase();
    if (lastName && !titleLower.includes(lastName)) {
      warnings.push(`Author last name '${lastName}' not in title.`);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool: validate_description — sanity-check HTML description
// ─────────────────────────────────────────────────────────────────────────────

export const validateDescriptionTool: Tool = {
  name: "validate_description",
  description:
    "Validate an eBay HTML description for safety + length. " +
    "Returns violations if description has scripts, inline styles, broken HTML, or wrong length.",
  input_schema: {
    type: "object",
    properties: {
      description_html: {
        type: "string",
        description: "The HTML description to validate.",
      },
    },
    required: ["description_html"],
  },
};

export interface DescriptionValidationInput {
  description_html: string;
}

export interface DescriptionValidationOutput {
  passed: boolean;
  violations: string[];
  word_count: number;
}

export function validateDescription(
  input: DescriptionValidationInput,
): DescriptionValidationOutput {
  const violations: string[] = [];
  const html = input.description_html;

  // No scripts
  if (/<script/i.test(html)) {
    violations.push("Contains <script> tag — eBay strips these and may flag the listing.");
  }

  // No inline styles (eBay strips them)
  if (/style\s*=/i.test(html)) {
    violations.push("Contains inline style attributes — eBay strips these.");
  }

  // Word count check (target 150-250 words per existing prompt)
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 100) {
    violations.push(`Description is only ${wordCount} words — too thin (target 150-250).`);
  }
  if (wordCount > 400) {
    violations.push(`Description is ${wordCount} words — too verbose (target 150-250).`);
  }

  // Allowed tags only
  const allowedTags = ["h3", "h4", "p", "ul", "li", "ol", "strong", "em", "br", "hr", "div", "span", "b", "i"];
  const tagsUsed = Array.from(html.matchAll(/<\/?([a-z][a-z0-9]*)/gi)).map((m) => m[1].toLowerCase());
  const disallowed = [...new Set(tagsUsed)].filter((t) => !allowedTags.includes(t));
  if (disallowed.length > 0) {
    violations.push(`Disallowed HTML tags: ${disallowed.join(", ")}.`);
  }

  return {
    passed: violations.length === 0,
    violations,
    word_count: wordCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registry — single map of tool definition + executor function
// ─────────────────────────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS: Tool[] = [critiqueTitleTool, validateDescriptionTool];

export type ToolExecutor = (input: Record<string, unknown>) => unknown;

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  critique_title: (input) => critiqueTitle(input as unknown as TitleCritiqueInput),
  validate_description: (input) =>
    validateDescription(input as unknown as DescriptionValidationInput),
};
