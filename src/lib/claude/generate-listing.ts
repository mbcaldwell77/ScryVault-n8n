import type { MessageParam, ImageBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { getAnthropicClient } from "./client";
import { SYSTEM_PROMPT, buildGenerationPrompt } from "./prompts";
import type {
  ListingGenerationInput,
  GeneratedListing,
  GenerationResult,
} from "./types";

const MODEL = "claude-sonnet-4-20250514";

// Pricing per 1M tokens (Sonnet 4)
const INPUT_COST_PER_MILLION = 3.0;
const OUTPUT_COST_PER_MILLION = 15.0;

async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; media_type: "image/jpeg" | "image/png" | "image/webp" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    let mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
    if (contentType.includes("png")) mediaType = "image/png";
    else if (contentType.includes("webp")) mediaType = "image/webp";

    return { data: base64, media_type: mediaType };
  } catch {
    return null;
  }
}

export async function generateListing(
  input: ListingGenerationInput,
): Promise<GenerationResult> {
  const client = getAnthropicClient();
  const prompt = buildGenerationPrompt(input);

  // Build content blocks: images first (up to 4), then text prompt
  const contentBlocks: MessageParam["content"] = [];

  // Fetch and attach up to 4 images for vision analysis
  const imageUrls = input.image_urls.slice(0, 4);
  const imageResults = await Promise.all(imageUrls.map(fetchImageAsBase64));

  for (const img of imageResults) {
    if (img) {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.media_type,
          data: img.data,
        },
      } as ImageBlockParam);
    }
  }

  contentBlocks.push({ type: "text", text: prompt });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: contentBlocks,
      },
    ],
  });

  // Extract text from response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Parse JSON from response — strip markdown fences if present
  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let listing: GeneratedListing;
  try {
    listing = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse listing JSON: ${jsonText.slice(0, 200)}`);
  }

  // Validate required fields
  if (!listing.listing_title || !listing.listing_description || !listing.listing_condition_notes) {
    throw new Error("Generated listing is missing required fields");
  }

  // Enforce 80-char title limit
  if (listing.listing_title.length > 80) {
    listing.listing_title = listing.listing_title.slice(0, 80).trim();
  }

  // Calculate cost
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const estimatedCost =
    (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;

  return {
    listing,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: Math.round(estimatedCost * 10000) / 10000, // 4 decimal places
    },
  };
}
