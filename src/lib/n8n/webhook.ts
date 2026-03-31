/**
 * n8n Webhook Client
 *
 * All business logic (ISBN lookup, listing generation, eBay publishing)
 * lives in n8n workflows. This module handles communication with n8n
 * via webhook endpoints.
 */

const N8N_WEBHOOK_BASE_URL =
  process.env.N8N_WEBHOOK_BASE_URL || "http://localhost:5678/webhook";

export class N8nWebhookError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly webhookPath: string,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = "N8nWebhookError";
  }
}

interface WebhookOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * POST to an n8n webhook endpoint and return the parsed JSON response.
 */
export async function callN8nWebhook<T = unknown>(
  path: string,
  payload: Record<string, unknown>,
  options: WebhookOptions = {},
): Promise<T> {
  const url = `${N8N_WEBHOOK_BASE_URL}/${path}`;
  const timeout = options.timeout ?? 30_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }
      throw new N8nWebhookError(
        `n8n webhook ${path} returned ${response.status}`,
        response.status,
        path,
        body,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof N8nWebhookError) throw error;

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new N8nWebhookError(
        `n8n webhook ${path} timed out after ${timeout}ms`,
        408,
        path,
      );
    }

    throw new N8nWebhookError(
      `Failed to reach n8n webhook ${path}: ${error instanceof Error ? error.message : String(error)}`,
      502,
      path,
    );
  } finally {
    clearTimeout(timer);
  }
}
