"use client";

import { useEffect, useState, useCallback } from "react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { EbayConnectionStatus, EbaySetupStatus } from "@/lib/ebay/types";
import {
  Sparkles,
  FileText,
  Pencil,
  Loader2,
  Check,
  Link2,
  PlugZap,
} from "lucide-react";

interface PromptTemplate {
  id: string;
  name: string;
  type: string;
  template: string;
  is_default: boolean;
  created_at: string;
}

type EbayConnection = EbayConnectionStatus & {
  default_category_id: string;
};

function getEbayErrorMessage(code: string | null): string | null {
  switch (code) {
    case "connect_failed":
      return "Unable to start the eBay connection flow. Review your eBay setup below and try again.";
    case "missing_code":
      return "eBay did not return an authorization code. Try connecting again.";
    case "invalid_state":
      return "The eBay callback could not be verified. Try reconnecting your eBay account.";
    case "callback_failed":
      return "The eBay callback failed before tokens could be saved. Review the setup checks below and try again.";
    default:
      return null;
  }
}

export default function SettingsPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ebayConnection, setEbayConnection] = useState<EbayConnection | null>(null);
  const [ebaySetup, setEbaySetup] = useState<EbaySetupStatus | null>(null);
  const [loadingEbay, setLoadingEbay] = useState(true);
  const [loadingEbaySetup, setLoadingEbaySetup] = useState(true);
  const [ebaySetupError, setEbaySetupError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchEbayConnection = useCallback(async () => {
    setLoadingEbay(true);
    try {
      const res = await fetch("/api/ebay/connection");
      const json = await res.json();
      if (res.ok) {
        setEbayConnection(json.data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingEbay(false);
    }
  }, []);

  const fetchEbaySetup = useCallback(async () => {
    setLoadingEbaySetup(true);
    setEbaySetupError(null);
    try {
      const res = await fetch("/api/ebay/setup");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to fetch eBay setup");
      }
      setEbaySetup(json.data);
    } catch (error) {
      setEbaySetupError(
        error instanceof Error ? error.message : "Failed to fetch eBay setup",
      );
    } finally {
      setLoadingEbaySetup(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/prompt-templates");
      const json = await res.json();
      if (res.ok) setTemplates(json.data || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleDisconnectEbay() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/ebay/disconnect", { method: "POST" });
      if (res.ok) {
        await Promise.all([fetchEbayConnection(), fetchEbaySetup()]);
      }
    } finally {
      setDisconnecting(false);
    }
  }

  function handleConnectEbay() {
    window.location.href = "/api/ebay/connect";
  }

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    fetchEbayConnection();
    fetchEbaySetup();
  }, [fetchEbayConnection, fetchEbaySetup]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const ebayStatus = searchParams.get("ebay");
    const ebayError = searchParams.get("ebay_error");

    if (ebayStatus === "connected") {
      setSaveMessage("eBay connected.");
      fetchEbayConnection();
      fetchEbaySetup();
    }

    const message = getEbayErrorMessage(ebayError);
    if (message) {
      setSaveError(message);
    }
  }, [fetchEbayConnection, fetchEbaySetup]);

  function startEditing(template: PromptTemplate) {
    setSaveMessage(null);
    setSaveError(null);
    setEditingId(template.id);
    setEditValue(template.template);
  }

  async function handleSaveTemplate(id: string) {
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const res = await fetch("/api/prompt-templates", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          template: editValue,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to save template");
      }

      setTemplates((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, template: json.data.template } : t,
        ),
      );
      setEditingId(null);
      setSaveMessage("Template saved.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  const typeLabel: Record<string, string> = {
    title: "Title Generation",
    description: "Description Generation",
    condition_notes: "Condition Notes",
  };

  const publishReady = Boolean(ebaySetup?.ready);
  const setupChecks = ebaySetup?.checks || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-muted">
          Configure your account, eBay connection, and listing templates.
        </p>
        {saveMessage && (
          <p className="mt-2 text-sm text-accent">{saveMessage}</p>
        )}
        {saveError && (
          <p className="mt-2 text-sm text-danger">{saveError}</p>
        )}
      </div>

      {/* Claude API Integration */}
      <GlassPanel>
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-accent/10 p-2">
            <Sparkles className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              AI Listing Generation
            </h2>
            <p className="text-sm text-text-muted">
              Powered by Claude Sonnet 4 for eBay-optimized listings
            </p>
          </div>
          <Badge variant="accent" className="ml-auto">Active</Badge>
        </div>
        <div className="rounded-xl bg-white/[0.02] p-4 text-sm text-text-muted space-y-1">
          <p>
            <strong className="text-text-primary">Model:</strong> claude-sonnet-4
          </p>
          <p>
            <strong className="text-text-primary">Features:</strong> Title optimization, HTML description, condition assessment, photo analysis
          </p>
          <p>
            <strong className="text-text-primary">Cost:</strong> ~$0.02-0.03 per listing generation
          </p>
        </div>
      </GlassPanel>

      {/* Prompt Templates */}
      <GlassPanel>
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-accent/10 p-2">
            <FileText className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Prompt Templates
            </h2>
            <p className="text-sm text-text-muted">
              Customize how Claude generates listing content
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : templates.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">
            No templates found. They will be created automatically when you visit this page.
          </p>
        ) : (
          <div className="space-y-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-text-primary">
                      {template.name}
                    </h3>
                    <Badge variant="default">
                      {typeLabel[template.type] || template.type}
                    </Badge>
                    {template.is_default && (
                      <Badge variant="accent">Default</Badge>
                    )}
                  </div>
                  {editingId !== template.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditing(template)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {editingId === template.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      rows={4}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-xs text-text-primary placeholder:text-text-muted/50 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        loading={saving}
                        onClick={() => handleSaveTemplate(template.id)}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-xs text-text-muted font-mono leading-relaxed">
                    {template.template}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* eBay Connection */}
      <GlassPanel>
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-accent/10 p-2">
            <Link2 className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">eBay Connection</h2>
            <p className="text-sm text-text-muted">
              Connect your eBay seller account for one-click publishing.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {loadingEbay ? (
              <Badge variant="default">Checking...</Badge>
            ) : ebayConnection?.connected ? (
              <Badge variant="success">Connected</Badge>
            ) : (
              <Badge variant="warning">Not Connected</Badge>
            )}
            {ebayConnection?.connected && !loadingEbaySetup && (
              <Badge variant={publishReady ? "success" : "warning"}>
                {publishReady ? "Ready to Publish" : "Needs Setup"}
              </Badge>
            )}
          </div>
        </div>

        {loadingEbay ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-white/[0.02] p-4 text-sm text-text-muted space-y-1">
              <p>
                <strong className="text-text-primary">Environment:</strong>{" "}
                {ebayConnection?.environment === "production" ? "Production" : "Sandbox"}
              </p>
              <p>
                <strong className="text-text-primary">Default book category:</strong>{" "}
                {ebayConnection?.default_category_id || "261186"}
              </p>
              <p>
                <strong className="text-text-primary">OAuth configuration:</strong>{" "}
                {ebayConnection?.configuration.oauth_ready ? "Ready" : "Needs attention"}
              </p>
              <p>
                <strong className="text-text-primary">Publish configuration:</strong>{" "}
                {ebayConnection?.configuration.publish_ready ? "Ready" : "Needs attention"}
              </p>
              {ebayConnection?.expires_at && (
                <p>
                  <strong className="text-text-primary">Access token expires:</strong>{" "}
                  {new Date(ebayConnection.expires_at).toLocaleString()}
                </p>
              )}
            </div>

            {loadingEbaySetup ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
              </div>
            ) : ebaySetupError ? (
              <div className="rounded-xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">
                {ebaySetupError}
              </div>
            ) : ebaySetup ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  {setupChecks.map((check) => (
                    <div
                      key={check.key}
                      className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-text-primary">{check.label}</p>
                        <p className="text-xs text-text-muted">{check.message}</p>
                      </div>
                      <Badge variant={check.ready ? "success" : "warning"}>
                        {check.ready ? "Ready" : "Action Required"}
                      </Badge>
                    </div>
                  ))}
                </div>

                {(ebaySetup.locations.length > 0 ||
                  ebaySetup.fulfillment_policies.length > 0 ||
                  ebaySetup.payment_policies.length > 0 ||
                  ebaySetup.return_policies.length > 0) && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-text-muted">
                        <p className="mb-2 font-semibold text-text-primary">Inventory Locations</p>
                        {ebaySetup.locations.length > 0 ? (
                          <div className="space-y-1">
                            {ebaySetup.locations.map((location) => (
                              <p key={location.merchant_location_key || `${location.country}-${location.postal_code}`}>
                                {location.merchant_location_key || "Unnamed location"}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p>No inventory locations found.</p>
                        )}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-text-muted">
                        <p className="mb-2 font-semibold text-text-primary">Business Policies</p>
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs uppercase tracking-wider">Fulfillment</p>
                            <p>
                              {ebaySetup.fulfillment_policies.length > 0
                                ? ebaySetup.fulfillment_policies
                                  .map((policy) => policy.name || policy.id || "Unnamed policy")
                                  .join(", ")
                                : "None found"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider">Payment</p>
                            <p>
                              {ebaySetup.payment_policies.length > 0
                                ? ebaySetup.payment_policies
                                  .map((policy) => policy.name || policy.id || "Unnamed policy")
                                  .join(", ")
                                : "None found"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider">Return</p>
                            <p>
                              {ebaySetup.return_policies.length > 0
                                ? ebaySetup.return_policies
                                  .map((policy) => policy.name || policy.id || "Unnamed policy")
                                  .join(", ")
                                : "None found"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            ) : null}

            <div className="flex gap-2">
              {ebayConnection?.connected ? (
                <>
                  <Button variant="secondary" onClick={handleConnectEbay}>
                    <PlugZap className="h-4 w-4" />
                    Reconnect eBay
                  </Button>
                  <Button
                    variant="danger"
                    loading={disconnecting}
                    onClick={handleDisconnectEbay}
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button onClick={handleConnectEbay}>
                  <PlugZap className="h-4 w-4" />
                  Connect eBay
                </Button>
              )}
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
