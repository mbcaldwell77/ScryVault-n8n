import type { EbayConfigurationStatus } from "./types";

const DEFAULT_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
];

const OAUTH_ENV_NAMES = [
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "EBAY_REDIRECT_URI",
] as const;

const PUBLISH_ENV_NAMES = [
  "EBAY_MERCHANT_LOCATION_KEY",
  "EBAY_FULFILLMENT_POLICY_ID",
  "EBAY_PAYMENT_POLICY_ID",
  "EBAY_RETURN_POLICY_ID",
] as const;

export interface EbayConfig {
  environment: "production" | "sandbox";
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authBaseUrl: string;
  apiBaseUrl: string;
  scopes: string[];
  marketplaceId: string;
  currency: string;
  defaultCategoryId: string;
}

export interface EbayPublishConfig {
  merchantLocationKey: string;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getMissingEnv(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name]);
}

export function getEbayEnvironment(): "production" | "sandbox" {
  const environment = (
    process.env.EBAY_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_EBAY_ENVIRONMENT ||
    "production"
  ).toLowerCase();

  return environment === "sandbox" ? "sandbox" : "production";
}

export function getEbayScopes(): string[] {
  return (process.env.EBAY_SCOPES || DEFAULT_SCOPES.join(" "))
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function getEbayDefaultCategoryId(): string {
  return process.env.EBAY_DEFAULT_BOOK_CATEGORY_ID || "261186";
}

export function getEbayConfigurationStatus(): EbayConfigurationStatus {
  const missingOAuth = getMissingEnv(OAUTH_ENV_NAMES);
  const missingPublish = getMissingEnv(PUBLISH_ENV_NAMES);

  return {
    oauth_ready: missingOAuth.length === 0,
    publish_ready: missingPublish.length === 0,
    missing: [...missingOAuth, ...missingPublish],
    missing_oauth: missingOAuth,
    missing_publish: missingPublish,
  };
}

export function getEbayConfig(): EbayConfig {
  const environment = getEbayEnvironment();
  const isSandbox = environment === "sandbox";

  return {
    environment,
    clientId: requiredEnv("EBAY_CLIENT_ID"),
    clientSecret: requiredEnv("EBAY_CLIENT_SECRET"),
    redirectUri: requiredEnv("EBAY_REDIRECT_URI"),
    authBaseUrl: isSandbox
      ? "https://auth.sandbox.ebay.com"
      : "https://auth.ebay.com",
    apiBaseUrl: isSandbox
      ? "https://api.sandbox.ebay.com"
      : "https://api.ebay.com",
    scopes: getEbayScopes(),
    marketplaceId: process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
    currency: process.env.EBAY_CURRENCY || "USD",
    defaultCategoryId: getEbayDefaultCategoryId(),
  };
}

export function getEbayPublishConfig(): EbayPublishConfig {
  return {
    merchantLocationKey: requiredEnv("EBAY_MERCHANT_LOCATION_KEY"),
    fulfillmentPolicyId: requiredEnv("EBAY_FULFILLMENT_POLICY_ID"),
    paymentPolicyId: requiredEnv("EBAY_PAYMENT_POLICY_ID"),
    returnPolicyId: requiredEnv("EBAY_RETURN_POLICY_ID"),
  };
}
