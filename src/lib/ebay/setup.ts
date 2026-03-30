import type { SupabaseClient } from "@supabase/supabase-js";
import { ebayRequest } from "./api";
import { getEbayConfig, getEbayConfigurationStatus, getEbayPublishConfig } from "./config";
import { getEbayTokenRow } from "./token-store";
import { getValidEbayAccessToken } from "./tokens";
import type {
  EbayLocationSummary,
  EbaySetupCheck,
  EbaySetupResource,
  EbaySetupStatus,
} from "./types";

interface EbayPolicy {
  name?: string;
  policyId?: string;
}

interface EbayLocation {
  merchantLocationKey?: string;
  location?: {
    address?: {
      country?: string;
      postalCode?: string;
    };
  };
}

function createCheck(
  key: string,
  label: string,
  ready: boolean,
  blocking: boolean,
  message: string,
): EbaySetupCheck {
  return {
    key,
    label,
    ready,
    blocking,
    message,
  };
}

function normalizeResources(items: EbayPolicy[] | undefined): EbaySetupResource[] {
  return (items || []).map((item) => ({
    id: item.policyId || null,
    name: item.name || null,
  }));
}

function normalizeLocations(items: EbayLocation[] | undefined): EbayLocationSummary[] {
  return (items || []).map((item) => ({
    merchant_location_key: item.merchantLocationKey || null,
    country: item.location?.address?.country || null,
    postal_code: item.location?.address?.postalCode || null,
  }));
}

function findResourceById(
  resources: EbaySetupResource[],
  id: string | null | undefined,
): EbaySetupResource | null {
  if (!id) {
    return null;
  }

  return resources.find((resource) => resource.id === id) || null;
}

export async function getEbaySetupStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<EbaySetupStatus> {
  const configuration = getEbayConfigurationStatus();
  const checks: EbaySetupCheck[] = [
    createCheck(
      "oauth_configuration",
      "OAuth app configuration",
      configuration.oauth_ready,
      true,
      configuration.oauth_ready
        ? "OAuth environment variables are configured."
        : `Missing OAuth environment variables: ${configuration.missing_oauth.join(", ")}`,
    ),
    createCheck(
      "publish_configuration",
      "Publish configuration",
      configuration.publish_ready,
      true,
      configuration.publish_ready
        ? "Merchant location and business policy IDs are configured."
        : `Missing publish environment variables: ${configuration.missing_publish.join(", ")}`,
    ),
  ];

  const tokenRow = await getEbayTokenRow(supabase, userId);
  checks.push(
    createCheck(
      "account_connection",
      "eBay account connection",
      Boolean(tokenRow),
      true,
      tokenRow
        ? "Your eBay seller account is connected."
        : "Connect your eBay seller account before publishing.",
    ),
  );

  let locations: EbayLocationSummary[] = [];
  let fulfillmentPolicies: EbaySetupResource[] = [];
  let paymentPolicies: EbaySetupResource[] = [];
  let returnPolicies: EbaySetupResource[] = [];

  if (tokenRow) {
    try {
      const accessToken = await getValidEbayAccessToken(supabase, userId);
      const config = getEbayConfig();

      const [fulfillment, payment, returnsPolicy, locationResponse] = await Promise.all([
        ebayRequest<{ fulfillmentPolicies?: EbayPolicy[] }>(
          `/sell/account/v1/fulfillment_policy?marketplace_id=${encodeURIComponent(config.marketplaceId)}`,
          accessToken,
          { method: "GET" },
        ),
        ebayRequest<{ paymentPolicies?: EbayPolicy[] }>(
          `/sell/account/v1/payment_policy?marketplace_id=${encodeURIComponent(config.marketplaceId)}`,
          accessToken,
          { method: "GET" },
        ),
        ebayRequest<{ returnPolicies?: EbayPolicy[] }>(
          `/sell/account/v1/return_policy?marketplace_id=${encodeURIComponent(config.marketplaceId)}`,
          accessToken,
          { method: "GET" },
        ),
        ebayRequest<{ locations?: EbayLocation[] }>(
          "/sell/inventory/v1/location",
          accessToken,
          { method: "GET" },
        ),
      ]);

      fulfillmentPolicies = normalizeResources(fulfillment.fulfillmentPolicies);
      paymentPolicies = normalizeResources(payment.paymentPolicies);
      returnPolicies = normalizeResources(returnsPolicy.returnPolicies);
      locations = normalizeLocations(locationResponse.locations);

      if (configuration.publish_ready) {
        const publishConfig = getEbayPublishConfig();
        const matchingLocation = locations.find(
          (location) => location.merchant_location_key === publishConfig.merchantLocationKey,
        );
        const matchingFulfillment = findResourceById(
          fulfillmentPolicies,
          publishConfig.fulfillmentPolicyId,
        );
        const matchingPayment = findResourceById(
          paymentPolicies,
          publishConfig.paymentPolicyId,
        );
        const matchingReturn = findResourceById(
          returnPolicies,
          publishConfig.returnPolicyId,
        );

        checks.push(
          createCheck(
            "inventory_location",
            "Inventory location",
            Boolean(matchingLocation),
            true,
            matchingLocation
              ? `Inventory location ${publishConfig.merchantLocationKey} is available.`
              : `Configured merchant location ${publishConfig.merchantLocationKey} was not found in eBay Inventory locations.`,
          ),
        );
        checks.push(
          createCheck(
            "fulfillment_policy",
            "Fulfillment policy",
            Boolean(matchingFulfillment),
            true,
            matchingFulfillment
              ? `Fulfillment policy ${publishConfig.fulfillmentPolicyId} is available.`
              : `Configured fulfillment policy ${publishConfig.fulfillmentPolicyId} was not found in your eBay account.`,
          ),
        );
        checks.push(
          createCheck(
            "payment_policy",
            "Payment policy",
            Boolean(matchingPayment),
            true,
            matchingPayment
              ? `Payment policy ${publishConfig.paymentPolicyId} is available.`
              : `Configured payment policy ${publishConfig.paymentPolicyId} was not found in your eBay account.`,
          ),
        );
        checks.push(
          createCheck(
            "return_policy",
            "Return policy",
            Boolean(matchingReturn),
            true,
            matchingReturn
              ? `Return policy ${publishConfig.returnPolicyId} is available.`
              : `Configured return policy ${publishConfig.returnPolicyId} was not found in your eBay account.`,
          ),
        );
      } else {
        checks.push(
          createCheck(
            "inventory_location",
            "Inventory location",
            locations.length > 0,
            true,
            locations.length > 0
              ? "At least one inventory location exists in your eBay account."
              : "No inventory locations were found in your eBay account.",
          ),
        );
        checks.push(
          createCheck(
            "fulfillment_policy",
            "Fulfillment policy",
            fulfillmentPolicies.length > 0,
            true,
            fulfillmentPolicies.length > 0
              ? "At least one fulfillment policy exists in your eBay account."
              : "No fulfillment policies were found in your eBay account.",
          ),
        );
        checks.push(
          createCheck(
            "payment_policy",
            "Payment policy",
            paymentPolicies.length > 0,
            true,
            paymentPolicies.length > 0
              ? "At least one payment policy exists in your eBay account."
              : "No payment policies were found in your eBay account.",
          ),
        );
        checks.push(
          createCheck(
            "return_policy",
            "Return policy",
            returnPolicies.length > 0,
            true,
            returnPolicies.length > 0
              ? "At least one return policy exists in your eBay account."
              : "No return policies were found in your eBay account.",
          ),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to verify eBay setup.";

      checks.push(
        createCheck(
          "account_access",
          "eBay API access",
          false,
          true,
          message,
        ),
      );
    }
  }

  return {
    ready: checks.filter((check) => check.blocking).every((check) => check.ready),
    configuration,
    checks,
    locations,
    fulfillment_policies: fulfillmentPolicies,
    payment_policies: paymentPolicies,
    return_policies: returnPolicies,
  };
}

export function getBlockingSetupMessages(status: EbaySetupStatus): string[] {
  return status.checks
    .filter((check) => check.blocking && !check.ready)
    .map((check) => check.message);
}
