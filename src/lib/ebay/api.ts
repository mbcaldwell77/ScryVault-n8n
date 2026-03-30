import { getEbayConfig, getEbayPublishConfig } from "./config";

export async function ebayRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit,
): Promise<T> {
  const config = getEbayConfig();
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const details = payload.errors || payload.error_description || payload.message || payload.error;
    const message = Array.isArray(details)
      ? details.map((item: { message?: string }) => item.message).filter(Boolean).join("; ")
      : String(details || "eBay API request failed");
    throw new Error(message);
  }

  return payload as T;
}

function normalizeCondition(condition: string): string {
  switch (condition) {
    case "Brand New":
      return "NEW";
    case "Like New":
      return "USED_EXCELLENT";
    case "Very Good":
      return "USED_VERY_GOOD";
    case "Good":
      return "USED_GOOD";
    case "Acceptable":
      return "USED_ACCEPTABLE";
    default:
      return "USED_GOOD";
  }
}

export async function createOrReplaceInventoryItem(
  accessToken: string,
  sku: string,
  input: {
    title: string;
    description: string;
    condition: string;
    imageUrls: string[];
    quantity: number;
    isbn: string | null;
    authors: string[] | null;
    publisher: string | null;
    categories: string[] | null;
  },
): Promise<void> {
  const aspects: Record<string, string[]> = {};
  if (input.authors?.length) aspects.Author = input.authors;
  if (input.publisher) aspects.Publisher = [input.publisher];
  if (input.categories?.length) aspects.Subject = input.categories;

  await ebayRequest(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, accessToken, {
    method: "PUT",
    body: JSON.stringify({
      condition: normalizeCondition(input.condition),
      availability: {
        shipToLocationAvailability: {
          quantity: input.quantity,
        },
      },
      product: {
        title: input.title,
        description: input.description,
        imageUrls: input.imageUrls,
        isbn: input.isbn || undefined,
        aspects,
      },
    }),
  });
}

export async function createOffer(
  accessToken: string,
  input: {
    sku: string;
    categoryId: string;
    listingDescription: string;
    availableQuantity: number;
    price: number;
  },
): Promise<{ offerId: string }> {
  const config = getEbayConfig();
  const publishConfig = getEbayPublishConfig();

  return ebayRequest<{ offerId: string }>(`/sell/inventory/v1/offer`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      sku: input.sku,
      marketplaceId: config.marketplaceId,
      format: "FIXED_PRICE",
      availableQuantity: input.availableQuantity,
      categoryId: input.categoryId,
      listingDescription: input.listingDescription,
      merchantLocationKey: publishConfig.merchantLocationKey,
      listingPolicies: {
        fulfillmentPolicyId: publishConfig.fulfillmentPolicyId,
        paymentPolicyId: publishConfig.paymentPolicyId,
        returnPolicyId: publishConfig.returnPolicyId,
      },
      pricingSummary: {
        price: {
          value: input.price.toFixed(2),
          currency: config.currency,
        },
      },
    }),
  });
}

export async function publishOffer(
  accessToken: string,
  offerId: string,
): Promise<{ listingId?: string; listingUrl?: string }> {
  return ebayRequest<{ listingId?: string; listingUrl?: string }>(
    `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
    accessToken,
    {
      method: "POST",
    },
  );
}
