export interface EbayTokenRow {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  scopes: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface EbayTokenPayload {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  scopes: string[];
}

export interface EbayOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

export interface EbayConfigurationStatus {
  oauth_ready: boolean;
  publish_ready: boolean;
  missing: string[];
  missing_oauth: string[];
  missing_publish: string[];
}

export interface EbayConnectionStatus {
  connected: boolean;
  environment: "production" | "sandbox";
  expires_at: string | null;
  scopes: string[];
  configuration: EbayConfigurationStatus;
}

export interface EbaySetupCheck {
  key: string;
  label: string;
  ready: boolean;
  blocking: boolean;
  message: string;
}

export interface EbaySetupResource {
  id: string | null;
  name: string | null;
}

export interface EbayLocationSummary {
  merchant_location_key: string | null;
  country: string | null;
  postal_code: string | null;
}

export interface EbaySetupStatus {
  ready: boolean;
  configuration: EbayConfigurationStatus;
  checks: EbaySetupCheck[];
  locations: EbayLocationSummary[];
  fulfillment_policies: EbaySetupResource[];
  payment_policies: EbaySetupResource[];
  return_policies: EbaySetupResource[];
}
