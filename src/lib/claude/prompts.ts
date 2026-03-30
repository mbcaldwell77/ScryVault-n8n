import type { ListingGenerationInput } from "./types";

export const SYSTEM_PROMPT = `You are an expert eBay listing specialist for used and collectible books. You create listings that maximize visibility and sales on eBay's marketplace.

Your expertise includes:
- eBay Cassini search algorithm optimization
- Accurate book condition assessment
- Compelling, honest book descriptions
- HTML formatting for eBay listings

Always be accurate and honest about condition. Never exaggerate or misrepresent.`;

export function buildGenerationPrompt(input: ListingGenerationInput): string {
  const metadata = [
    `Title: ${input.title}`,
    input.subtitle ? `Subtitle: ${input.subtitle}` : null,
    input.authors?.length ? `Author(s): ${input.authors.join(", ")}` : null,
    input.publisher ? `Publisher: ${input.publisher}` : null,
    input.published_date ? `Published: ${input.published_date}` : null,
    input.isbn ? `ISBN: ${input.isbn}` : null,
    input.page_count ? `Pages: ${input.page_count}` : null,
    input.categories?.length ? `Categories: ${input.categories.join(", ")}` : null,
    input.language ? `Language: ${input.language}` : null,
    `Condition: ${input.condition}`,
    input.condition_notes ? `Condition Notes: ${input.condition_notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const hasImages = input.image_urls.length > 0;

  return `Generate an eBay listing for this book. ${hasImages ? "I've attached photos of the actual book — use them to assess condition and note any visible details." : "No photos are available for this item."}

## Book Metadata
${metadata}

## Instructions

Respond with a JSON object containing exactly these fields:

### listing_title
- eBay-optimized title, maximum 80 characters
- Include: author last name, key title words, edition/format if notable, condition keyword
- Prioritize Cassini search terms that buyers actually search for
- Do NOT use all caps or excessive punctuation

### listing_description
- HTML-formatted description suitable for eBay
- Use clean, simple HTML: <h3>, <p>, <ul>, <li>, <strong>, <em>, <br>, <hr>
- Structure: brief hook → book details → condition details → shipping note
- Be specific and honest about condition
- Keep it concise but informative — 150-250 words
- Do NOT include inline styles, scripts, or complex CSS

### listing_condition_notes
- 1-3 sentences summarizing condition for the eBay condition description field
- Be specific: mention any wear, markings, damage, or notable positive condition factors
- This is separate from the full description

### suggested_price
- A suggested listing price in USD based on the book's likely market value
- Consider: edition, condition, demand, rarity
- Return null if you can't reasonably estimate
- This is a starting point — the seller will adjust as needed

Respond ONLY with valid JSON, no markdown code fences or other text.`;
}
