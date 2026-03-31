// n8n Edition: Listing generation is handled by n8n workflows via webhook.
// This file exists only to prevent import errors from shared type references.

import type { ListingGenerationInput, GenerationResult } from "./types";

export async function generateListing(
  _input: ListingGenerationInput,
): Promise<GenerationResult> {
  throw new Error("Listing generation is handled by n8n workflows in the n8n Edition. Use the /api/listings/generate route which proxies to n8n.");
}
