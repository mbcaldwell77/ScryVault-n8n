"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import {
  Sparkles,
  RefreshCw,
  Check,
  Pencil,
  Eye,
  Code,
  DollarSign,
  Zap,
} from "lucide-react";
import type { GeneratedListing } from "@/lib/claude/types";
import { AgentTracePanel, type AgentTrace } from "./agent-trace-panel";

interface ListingPreviewProps {
  inventoryItemId: string;
  initialListing: {
    listing_title: string | null;
    listing_description: string | null;
    listing_condition_notes: string | null;
    listing_price: number | null;
  };
  onAccept: (listing: GeneratedListing & { listing_price: number | null }) => Promise<void>;
}

export function ListingPreview({
  inventoryItemId,
  initialListing,
  onAccept,
}: ListingPreviewProps) {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptionView, setDescriptionView] = useState<"preview" | "html">("preview");
  const { toast } = useToast();

  // Generated content state
  const [title, setTitle] = useState(initialListing.listing_title || "");
  const [description, setDescription] = useState(initialListing.listing_description || "");
  const [conditionNotes, setConditionNotes] = useState(initialListing.listing_condition_notes || "");
  const [price, setPrice] = useState(
    initialListing.listing_price != null ? String(initialListing.listing_price) : "",
  );
  const [hasGenerated, setHasGenerated] = useState(
    Boolean(initialListing.listing_title),
  );
  const [editing, setEditing] = useState(false);

  // Usage tracking
  const [lastUsage, setLastUsage] = useState<{
    input_tokens: number;
    output_tokens: number;
    estimated_cost: number;
  } | null>(null);

  // Agent trace (only set when AGENT_MODE=true on the API side)
  const [agentTrace, setAgentTrace] = useState<AgentTrace | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/listings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory_item_id: inventoryItemId }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || "Generation failed");
      }

      const { listing, usage, agent } = json.data;
      setTitle(listing.listing_title);
      setDescription(listing.listing_description);
      setConditionNotes(listing.listing_condition_notes);
      if (listing.suggested_price != null) {
        setPrice(String(listing.suggested_price));
      }
      setLastUsage(usage);
      setAgentTrace(agent ?? null);
      setHasGenerated(true);
      setEditing(false);
      toast({
        title: "AI draft ready",
        description: "Review the draft, adjust anything you want, then save it to the item.",
        variant: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setError(message);
      toast({
        title: "Listing generation failed",
        description: message,
        variant: "error",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleAccept() {
    setSaving(true);
    setError(null);

    try {
      await onAccept({
        listing_title: title,
        listing_description: description,
        listing_condition_notes: conditionNotes,
        suggested_price: price ? parseFloat(price) : null,
        listing_price: price ? parseFloat(price) : null,
      });
      toast({
        title: "Listing saved",
        description: "The AI draft was accepted and saved to this item.",
        variant: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save listing";
      setError(message);
      toast({
        title: "Listing save failed",
        description: message,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  // No content generated yet — show generate button
  if (!hasGenerated) {
    return (
      <GlassPanel>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Listing Content
            </h2>
          </div>

          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-accent/10 p-4">
              <Sparkles className="h-8 w-8 text-accent" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-text-primary">
              Generate Listing with AI
            </h3>
            <p className="mt-2 max-w-sm text-sm text-text-muted">
              Claude will create an eBay-optimized title, HTML description, and
              condition assessment based on the book details and photos.
            </p>
            <Button onClick={handleGenerate} loading={generating} className="mt-6">
              <Sparkles className="mr-1 h-4 w-4" />
              Generate Listing
            </Button>
            {error && (
              <p className="mt-3 text-sm text-danger">{error}</p>
            )}
          </div>
        </div>
      </GlassPanel>
    );
  }

  // Content generated — show preview/edit
  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <GlassPanel size="sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Listing Content
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(!editing)}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {editing ? "Preview" : "Edit"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              loading={generating}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Regenerate
            </Button>
          </div>
        </div>
      </GlassPanel>

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Title */}
      <GlassPanel size="sm">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
          eBay Title ({title.length}/80)
        </label>
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-text-primary placeholder:text-text-muted/50 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            maxLength={80}
          />
        ) : (
          <p className="text-sm font-medium text-text-primary">{title}</p>
        )}
        <div className="mt-1 h-1 w-full rounded-full bg-white/5">
          <div
            className={`h-1 rounded-full transition-all ${title.length > 75
              ? "bg-danger"
              : title.length > 60
                ? "bg-warning"
                : "bg-accent"
              }`}
            style={{ width: `${(title.length / 80) * 100}%` }}
          />
        </div>
      </GlassPanel>

      {/* Description */}
      <GlassPanel size="sm">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Description
          </label>
          {!editing && (
            <div className="flex rounded-lg border border-white/10 bg-white/5">
              <button
                onClick={() => setDescriptionView("preview")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs transition-colors ${descriptionView === "preview"
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:text-text-primary"
                  }`}
              >
                <Eye className="h-3 w-3" /> Preview
              </button>
              <button
                onClick={() => setDescriptionView("html")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs transition-colors ${descriptionView === "html"
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:text-text-primary"
                  }`}
              >
                <Code className="h-3 w-3" /> HTML
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={12}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-xs text-text-primary placeholder:text-text-muted/50 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        ) : descriptionView === "preview" ? (
          <div
            className="prose prose-sm prose-invert max-w-none rounded-xl bg-white/[0.02] p-4 text-sm text-text-primary [&_h3]:text-text-primary [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_p]:text-text-muted [&_p]:mb-2 [&_ul]:text-text-muted [&_li]:text-text-muted [&_strong]:text-text-primary [&_hr]:border-white/10"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        ) : (
          <pre className="overflow-x-auto rounded-xl bg-white/[0.02] p-4 font-mono text-xs text-text-muted">
            {description}
          </pre>
        )}
      </GlassPanel>

      {/* Condition Notes */}
      <GlassPanel size="sm">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
          Condition Notes
        </label>
        {editing ? (
          <textarea
            value={conditionNotes}
            onChange={(e) => setConditionNotes(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        ) : (
          <p className="text-sm text-text-muted">{conditionNotes}</p>
        )}
      </GlassPanel>

      {/* Suggested Price */}
      <GlassPanel size="sm">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
          AI Suggested Listing Price
        </label>
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-text-muted" />
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="max-w-32"
          />
        </div>
        <p className="mt-2 text-xs text-text-muted">
          This price comes from the AI draft using the book metadata, condition, and photos. It is not live market-comps data.
        </p>
      </GlassPanel>

      {/* Usage stats */}
      {lastUsage && (
        <div className="flex items-center gap-4 px-1 text-xs text-text-muted/60">
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {lastUsage.input_tokens.toLocaleString()} in / {lastUsage.output_tokens.toLocaleString()} out
          </span>
          <span>~${lastUsage.estimated_cost.toFixed(4)}</span>
          {agentTrace && (
            <span className="text-accent/70">via Agent SDK</span>
          )}
        </div>
      )}

      {/* Agent trace (only when AGENT_MODE=true) */}
      {agentTrace && <AgentTracePanel trace={agentTrace} />}

      {/* Accept button */}
      <div className="flex gap-2">
        <Button onClick={handleAccept} loading={saving} className="flex-1">
          <Check className="mr-1 h-4 w-4" />
          Accept & Save Listing
        </Button>
      </div>
    </div>
  );
}
