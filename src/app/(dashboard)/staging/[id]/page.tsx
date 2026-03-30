"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";
import { BookCoverImage } from "@/components/ui/book-cover-image";
import { ImageUploader } from "@/components/features/image-uploader";
import { ListingPreview } from "@/components/features/listing-preview";
import { calculateInventoryItemNetProfit } from "@/lib/financial/queries";
import {
  ArrowLeft,
  DollarSign,
  Plus,
  Save,
  Truck,
  Trash2,
  Loader2,
  UploadCloud,
  PackageCheck,
} from "lucide-react";
import {
  BOOK_CONDITIONS,
  SOURCE_TYPES,
  type InventoryItem,
  type ItemImage,
  type Source,
  type SourceType,
} from "@/types/books";
import type { GeneratedListing } from "@/lib/claude/types";
import type { EbaySetupStatus } from "@/lib/ebay/types";

function parseCurrencyInput(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function statusBadgeVariant(status: InventoryItem["status"]) {
  switch (status) {
    case "inventory":
      return "accent" as const;
    case "listed":
    case "sold":
    case "shipped":
      return "success" as const;
    default:
      return "default" as const;
  }
}

export default function StagedItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [images, setImages] = useState<ItemImage[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingToInventory, setSavingToInventory] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishSuccess, setPublishSuccess] = useState("");
  const [ebaySetup, setEbaySetup] = useState<EbaySetupStatus | null>(null);
  const [loadingEbaySetup, setLoadingEbaySetup] = useState(true);
  const [ebaySetupError, setEbaySetupError] = useState("");

  // Form state
  const [condition, setCondition] = useState("Good");
  const [conditionNotes, setConditionNotes] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [acquiredDate, setAcquiredDate] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [listingPrice, setListingPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [ebayFees, setEbayFees] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [categoryId, setCategoryId] = useState("261186");
  const [ebayConnected, setEbayConnected] = useState(false);
  const [skuFormat, setSkuFormat] = useState<"HC" | "TPB" | "MMPB">("HC");
  const [skuWebEnabled, setSkuWebEnabled] = useState(false);
  const [skuFirstEdition, setSkuFirstEdition] = useState(false);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [creatingSource, setCreatingSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceType, setNewSourceType] = useState<SourceType>(SOURCE_TYPES[0].value);
  const [sourceFormError, setSourceFormError] = useState("");
  const [settlementAction, setSettlementAction] = useState<"sold" | "shipped" | "save" | null>(null);
  const [settlementError, setSettlementError] = useState("");
  const [settlementSuccess, setSettlementSuccess] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);

  const fetchItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/inventory/${id}`);
      const json = await res.json();

      if (!res.ok) {
        router.push("/staging");
        return;
      }

      const data = json.data;
      setItem(data);
      setImages(data.item_images || []);
      setCondition(data.condition || "Good");
      setConditionNotes(data.condition_notes || "");
      setStorageLocation(data.storage_location || "");
      setSourceId(data.source_id || "");
      setAcquiredDate(data.acquired_date || "");
      setCostBasis(data.cost_basis != null ? String(data.cost_basis) : "");
      setListingPrice(data.listing_price != null ? String(data.listing_price) : "");
      setSalePrice(data.sale_price != null ? String(data.sale_price) : "");
      setEbayFees(data.ebay_fees != null ? String(data.ebay_fees) : "");
      setShippingCost(data.shipping_cost != null ? String(data.shipping_cost) : "");
    } catch {
      router.push("/staging");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/sources");
      const json = await res.json();
      if (res.ok) setSources(json.data || []);
    } catch { /* ignore */ }
  }, []);

  const fetchEbayConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/ebay/connection");
      const json = await res.json();
      if (res.ok) {
        setEbayConnected(Boolean(json.data?.connected));
        if (json.data?.default_category_id) {
          setCategoryId(json.data.default_category_id);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchEbaySetup = useCallback(async () => {
    setLoadingEbaySetup(true);
    setEbaySetupError("");

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

  useEffect(() => {
    fetchItem();
    fetchSources();
    fetchEbayConnection();
    fetchEbaySetup();
  }, [fetchItem, fetchSources, fetchEbayConnection, fetchEbaySetup]);

  useEffect(() => {
    router.prefetch("/staging");
  }, [router]);

  useEffect(() => {
    if (!deleteArmed) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDeleteArmed(false);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [deleteArmed]);

  async function patchItem(extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/inventory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        condition,
        condition_notes: conditionNotes || null,
        storage_location: storageLocation || null,
        source_id: sourceId || null,
        acquired_date: acquiredDate || null,
        cost_basis: costBasis ? parseFloat(costBasis) : null,
        listing_price: listingPrice ? parseFloat(listingPrice) : null,
        ...extra,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(json?.error?.message || "Failed to update item");
    }

    setItem(json.data);
    setSalePrice(json.data.sale_price != null ? String(json.data.sale_price) : "");
    setEbayFees(json.data.ebay_fees != null ? String(json.data.ebay_fees) : "");
    setShippingCost(json.data.shipping_cost != null ? String(json.data.shipping_cost) : "");
    return json.data;
  }

  async function handleSave() {
    setSaving(true);
    try {
      await patchItem();
      toast({
        title: "Details saved",
        description: "Item details were saved successfully.",
        variant: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save details";
      toast({
        title: "Save failed",
        description: message,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveToInventory() {
    setSavingToInventory(true);
    try {
      await patchItem({ status: "inventory" });
      toast({
        title: "Moved to inventory",
        description: "This item is now in inventory and ready for settlement or publishing.",
        variant: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to move item to inventory";
      toast({
        title: "Inventory update failed",
        description: message,
        variant: "error",
      });
    } finally {
      setSavingToInventory(false);
    }
  }

  async function handlePublishToEbay() {
    setPublishError("");
    setPublishSuccess("");

    if (!ebaySetup?.ready) {
      const firstBlockingMessage = ebaySetup?.checks.find((check) => check.blocking && !check.ready)?.message;
      const message = firstBlockingMessage || "eBay setup is incomplete. Review Settings before publishing.";
      setPublishError(message);
      toast({
        title: "Publishing blocked",
        description: message,
        variant: "warning",
      });
      return;
    }

    if (!listingPrice || Number.isNaN(parseFloat(listingPrice))) {
      const message = "Listing Price is required before publishing to eBay.";
      setPublishError(message);
      toast({
        title: "Listing price required",
        description: message,
        variant: "warning",
      });
      return;
    }

    setPublishing(true);
    try {
      await patchItem({ status: "inventory" });

      const res = await fetch("/api/ebay/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory_item_id: id,
          category_id: categoryId || undefined,
          sku_options: {
            format: skuFormat,
            web_enabled: skuWebEnabled,
            is_first_edition: skuFirstEdition,
          },
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to publish to eBay");
      }

      setItem(json.data.item);
      setPublishSuccess("Published to eBay successfully.");
      toast({
        title: "Published to eBay",
        description: "The listing is now live on eBay.",
        variant: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to publish to eBay";
      setPublishError(message);
      toast({
        title: "Publish failed",
        description: message,
        variant: "error",
      });
    } finally {
      setPublishing(false);
    }
  }

  async function handleDelete() {
    if (!deleteArmed) {
      setDeleteArmed(true);
      toast({
        title: "Confirm delete",
        description: "Click Delete Item again within 5 seconds to permanently remove this item.",
        variant: "warning",
      });
      return;
    }

    setDeleting(true);
    setDeleteArmed(false);

    try {
      const res = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to delete item");
      }

      router.push("/staging");
      toast({
        title: "Item deleted",
        description: "The item was permanently removed.",
        variant: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete item";
      toast({
        title: "Delete failed",
        description: message,
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleAcceptListing(
    listing: GeneratedListing & { listing_price: number | null },
  ) {
    const res = await fetch(`/api/inventory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listing_title: listing.listing_title,
        listing_description: listing.listing_description,
        listing_condition_notes: listing.listing_condition_notes,
        listing_price: listing.listing_price,
        // Optional status update, depends on roadmap details. Lets leave as is or update to 'ready' equivalent if we add that enum
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(json?.error?.message || "Failed to save listing");
    }

    setItem(json.data);
    setListingPrice(
      json.data.listing_price != null ? String(json.data.listing_price) : "",
    );
  }

  async function handleCreateSource() {
    const trimmedName = newSourceName.trim();
    setSourceFormError("");

    if (!trimmedName) {
      const message = "Source name is required.";
      setSourceFormError(message);
      toast({
        title: "Source name required",
        description: message,
        variant: "error",
      });
      return;
    }

    setCreatingSource(true);

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          type: newSourceType,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to create source");
      }

      const createdSource = json.data as Source;
      const nextSources = [...sources, createdSource].sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      setSources(nextSources);
      setSourceId(createdSource.id);
      setNewSourceName("");
      setNewSourceType(SOURCE_TYPES[0].value);
      setShowSourceForm(false);
      toast({
        title: "Source added",
        description: `${createdSource.name} is now available for this item and future intake.`,
        variant: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create source";
      setSourceFormError(message);
      toast({
        title: "Source save failed",
        description: message,
        variant: "error",
      });
    } finally {
      setCreatingSource(false);
    }
  }

  async function handleSettlementUpdate(nextStatus?: InventoryItem["status"]) {
    setSettlementError("");
    setSettlementSuccess("");

    const parsedSalePrice = parseCurrencyInput(salePrice);
    const parsedEbayFees = parseCurrencyInput(ebayFees);
    const parsedShippingCost = parseCurrencyInput(shippingCost);
    const requiresSalePrice =
      nextStatus === "sold" ||
      nextStatus === "shipped" ||
      item?.status === "sold" ||
      item?.status === "shipped";

    if (requiresSalePrice && parsedSalePrice == null) {
      setSettlementError("Sale Price is required for sold or shipped items.");
      return;
    }

    const action =
      nextStatus === "sold"
        ? "sold"
        : nextStatus === "shipped"
          ? "shipped"
          : "save";

    setSettlementAction(action);

    try {
      const saved = await patchItem({
        ...(nextStatus ? { status: nextStatus } : {}),
        sale_price: parsedSalePrice,
        ebay_fees: parsedEbayFees,
        shipping_cost: parsedShippingCost,
      });

      if (!saved) {
        throw new Error("Failed to update settlement details");
      }

      setSettlementSuccess(
        nextStatus === "sold"
          ? "Marked as sold and saved settlement details."
          : nextStatus === "shipped"
            ? "Marked as shipped."
            : "Settlement details saved.",
      );
      toast({
        title:
          nextStatus === "sold"
            ? "Item marked sold"
            : nextStatus === "shipped"
              ? "Item marked shipped"
              : "Settlement saved",
        description:
          nextStatus === "sold"
            ? "Sale details were saved and realized financials were updated."
            : nextStatus === "shipped"
              ? "Shipping was recorded for this item."
              : "Settlement details were updated.",
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update settlement details";
      setSettlementError(message);
      toast({
        title: "Settlement update failed",
        description: message,
        variant: "error",
      });
    } finally {
      setSettlementAction(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!item || !item.books_catalog) return null;
  const book = item.books_catalog;
  const blockingSetupChecks = ebaySetup?.checks.filter((check) => check.blocking && !check.ready) || [];
  const settlementEnabled =
    item.status === "inventory" ||
    item.status === "listed" ||
    item.status === "sold" ||
    item.status === "shipped";
  const salePriceValue = parseCurrencyInput(salePrice);
  const ebayFeesValue = parseCurrencyInput(ebayFees);
  const shippingCostValue = parseCurrencyInput(shippingCost);
  const costBasisValue = parseCurrencyInput(costBasis);
  const calculatedNetProfit = calculateInventoryItemNetProfit({
    sale_price: salePriceValue,
    cost_basis: costBasisValue,
    ebay_fees: ebayFeesValue,
    shipping_cost: shippingCostValue,
    net_profit: null,
  });
  const canMarkSold = item.status === "inventory" || item.status === "listed";
  const canMarkShipped = item.status === "sold";
  const canSaveSettlement = item.status === "sold" || item.status === "shipped";
  const settlementSaving = settlementAction !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/staging")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-text-primary truncate">
            {book.title}
          </h1>
          {book.authors && (
            <p className="text-sm text-text-muted truncate">
              {book.authors.join(", ")}
            </p>
          )}
        </div>
        <Badge variant={statusBadgeVariant(item.status)}>
          {item.status}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Book info + photos */}
        <div className="space-y-6 lg:col-span-2">
          {/* Book metadata card */}
          <GlassPanel>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">
              Book Details
            </h2>
            <div className="flex gap-4">
              <BookCoverImage
                src={book.cover_url}
                alt={book.title}
                className="h-40 w-28 shrink-0 shadow-md"
                iconClassName="h-8 w-8"
                priority
                sizes="112px"
              />
              <div className="space-y-1.5 text-sm">
                <p><span className="text-text-muted">Title:</span> <span className="text-text-primary">{book.title}</span></p>
                {book.subtitle && <p><span className="text-text-muted">Subtitle:</span> <span className="text-text-primary">{book.subtitle}</span></p>}
                {book.authors && <p><span className="text-text-muted">Author(s):</span> <span className="text-text-primary">{book.authors.join(", ")}</span></p>}
                {book.publisher && <p><span className="text-text-muted">Publisher:</span> <span className="text-text-primary">{book.publisher}</span></p>}
                {book.published_date && <p><span className="text-text-muted">Published:</span> <span className="text-text-primary">{book.published_date}</span></p>}
                {book.isbn && <p><span className="text-text-muted">ISBN:</span> <span className="text-text-primary font-mono">{book.isbn}</span></p>}
                {book.page_count && <p><span className="text-text-muted">Pages:</span> <span className="text-text-primary">{book.page_count}</span></p>}
              </div>
            </div>
          </GlassPanel>

          {/* Photos */}
          <GlassPanel>
            <ImageUploader
              inventoryItemId={id}
              images={images}
              onImagesChange={setImages}
            />
          </GlassPanel>

          {/* Listing Generation */}
          <ListingPreview
            inventoryItemId={id}
            initialListing={{
              listing_title: item.listing_title,
              listing_description: item.listing_description,
              listing_condition_notes: item.listing_condition_notes,
              listing_price: item.listing_price,
            }}
            onAccept={handleAcceptListing}
          />
        </div>

        {/* Right column: Enrichment form */}
        <div className="space-y-6">
          {/* Condition */}
          <GlassPanel>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">
              Condition
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2">
                {BOOK_CONDITIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCondition(c)}
                    aria-pressed={condition === c}
                    className={`rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all ${condition === c
                      ? "border-accent/60 bg-accent/15 text-text-primary shadow-[0_0_0_1px_rgba(67,213,176,0.25),0_12px_30px_rgba(67,213,176,0.12)] ring-1 ring-accent/30"
                      : "border-white/10 bg-white/5 text-text-muted hover:border-white/20 hover:bg-white/10 hover:text-text-primary"
                      }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span>{c}</span>
                      {condition === c && (
                        <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                          Selected
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-text-muted">
                  Condition Notes
                </label>
                <textarea
                  value={conditionNotes}
                  onChange={(e) => setConditionNotes(e.target.value)}
                  placeholder="Describe wear, markings, defects..."
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 hover:border-white/20"
                />
              </div>
            </div>
          </GlassPanel>

          {/* Acquisition Details */}
          <GlassPanel>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">
              Acquisition
            </h2>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-text-muted">Source</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowSourceForm((current) => !current);
                      setSourceFormError("");
                    }}
                    className="h-auto px-0 text-accent hover:bg-transparent hover:text-accent-dark"
                  >
                    <Plus className="h-4 w-4" />
                    {showSourceForm ? "Close" : "Add Source"}
                  </Button>
                </div>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 hover:border-white/20"
                >
                  <option value="">No source</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-text-muted">
                  Add a source here to track ROI by acquisition channel.
                </p>

                {showSourceForm && (
                  <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <Input
                      label="Source Name"
                      placeholder="e.g., Goodwill South, Estate Sale Box Lot"
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                    />
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-text-muted">Source Type</label>
                      <select
                        value={newSourceType}
                        onChange={(e) => setNewSourceType(e.target.value as SourceType)}
                        className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 hover:border-white/20"
                      >
                        {SOURCE_TYPES.map((sourceType) => (
                          <option key={sourceType.value} value={sourceType.value}>
                            {sourceType.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {sourceFormError && (
                      <p className="text-sm text-danger">{sourceFormError}</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowSourceForm(false);
                          setSourceFormError("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCreateSource}
                        loading={creatingSource}
                      >
                        <Plus className="h-4 w-4" />
                        Save Source
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <Input
                label="Date Acquired"
                type="date"
                value={acquiredDate}
                onChange={(e) => setAcquiredDate(e.target.value)}
              />
              <Input
                label="Cost (COGS)"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={costBasis}
                onChange={(e) => setCostBasis(e.target.value)}
              />
            </div>
          </GlassPanel>

          {/* Storage & Pricing */}
          <GlassPanel>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">
              Storage & Pricing
            </h2>
            <div className="space-y-3">
              <Input
                label="Storage Location"
                placeholder="e.g., Shelf A3, Box 12"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
              />
              <Input
                label="Listing Price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={listingPrice}
                onChange={(e) => setListingPrice(e.target.value)}
              />
              <Input
                label="eBay Category ID"
                placeholder="261186"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              />
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  SKU Options
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Format</label>
                  <select
                    value={skuFormat}
                    onChange={(e) => setSkuFormat(e.target.value as "HC" | "TPB" | "MMPB")}
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 hover:border-white/20"
                  >
                    <option value="HC">Hardcover (HC)</option>
                    <option value="TPB">Trade Paperback (TPB)</option>
                    <option value="MMPB">Mass Market Paperback (MMPB)</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={skuWebEnabled}
                    onChange={(e) => setSkuWebEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
                  />
                  WEB prefix
                </label>
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={skuFirstEdition}
                    onChange={(e) => setSkuFirstEdition(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
                  />
                  First Edition (1ST)
                </label>
              </div>
              {!ebayConnected && (
                <p className="text-xs text-warning">
                  Connect eBay in Settings before publishing.
                </p>
              )}
              {loadingEbaySetup && ebayConnected && (
                <p className="text-xs text-text-muted">
                  Checking eBay setup readiness...
                </p>
              )}
              {ebaySetupError && (
                <p className="text-xs text-danger">{ebaySetupError}</p>
              )}
              {blockingSetupChecks.length > 0 && (
                <div className="rounded-xl border border-warning/20 bg-warning/10 p-3 text-xs text-warning space-y-1">
                  {blockingSetupChecks.map((check) => (
                    <p key={check.key}>{check.message}</p>
                  ))}
                </div>
              )}
              {publishError && (
                <p className="text-xs text-danger">{publishError}</p>
              )}
              {publishSuccess && (
                <p className="text-xs text-accent">{publishSuccess}</p>
              )}
            </div>
          </GlassPanel>

          <GlassPanel>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">
              Settlement
            </h2>

            {settlementEnabled ? (
              <div className="space-y-3">
                <Input
                  label="Sale Price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                />
                <Input
                  label="eBay Fees"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={ebayFees}
                  onChange={(e) => setEbayFees(e.target.value)}
                />
                <Input
                  label="Shipping Cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <p className="text-xs uppercase tracking-wider text-text-muted">
                      Calculated Net Profit
                    </p>
                    <p className="mt-1 text-sm font-semibold text-text-primary">
                      {formatCurrency(calculatedNetProfit)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-text-muted">
                    <p>
                      <span className="text-text-primary">Sold:</span>{" "}
                      {item.sold_at ? new Date(item.sold_at).toLocaleDateString() : "—"}
                    </p>
                    <p className="mt-1">
                      <span className="text-text-primary">Shipped:</span>{" "}
                      {item.shipped_at ? new Date(item.shipped_at).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </div>

                {settlementError && (
                  <p className="text-xs text-danger">{settlementError}</p>
                )}
                {settlementSuccess && (
                  <p className="text-xs text-accent">{settlementSuccess}</p>
                )}

                <div className="grid grid-cols-1 gap-2">
                  {canMarkSold && (
                    <Button
                      onClick={() => handleSettlementUpdate("sold")}
                      loading={settlementAction === "sold"}
                      disabled={settlementSaving}
                      className="w-full"
                    >
                      <DollarSign className="mr-1 h-4 w-4" />
                      Mark Sold
                    </Button>
                  )}

                  {canMarkShipped && (
                    <Button
                      onClick={() => handleSettlementUpdate("shipped")}
                      loading={settlementAction === "shipped"}
                      disabled={settlementSaving}
                      className="w-full"
                    >
                      <Truck className="mr-1 h-4 w-4" />
                      Mark Shipped
                    </Button>
                  )}

                  {canSaveSettlement && (
                    <Button
                      variant="secondary"
                      onClick={() => handleSettlementUpdate()}
                      loading={settlementAction === "save"}
                      disabled={settlementSaving}
                      className="w-full"
                    >
                      <Save className="mr-1 h-4 w-4" />
                      Save Settlement
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                Settlement becomes available once this item has been saved to inventory or listed for sale.
              </p>
            )}
          </GlassPanel>

          {/* Actions */}
          <div className="grid grid-cols-1 gap-2">
            <Button onClick={handleSave} loading={saving} className="w-full" variant="secondary">
              <Save className="mr-1 h-4 w-4" />
              Save Details
            </Button>
            <Button onClick={handleSaveToInventory} loading={savingToInventory} className="w-full" variant="secondary">
              <PackageCheck className="mr-1 h-4 w-4" />
              Save to Inventory Only
            </Button>
            <Button
              onClick={handlePublishToEbay}
              loading={publishing}
              disabled={!ebayConnected || !listingPrice || loadingEbaySetup || !ebaySetup?.ready}
              className="w-full"
            >
              <UploadCloud className="mr-1 h-4 w-4" />
              Publish to eBay
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting} className="w-full">
              <Trash2 className="h-4 w-4" />
              {deleteArmed ? "Confirm Delete Item" : "Delete Item"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
