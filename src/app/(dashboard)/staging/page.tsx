"use client";

import { useEffect, useState, useCallback } from "react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Button } from "@/components/ui/button";
import { AddBookModal } from "@/components/features/add-book-modal";
import { StagedItemCard } from "@/components/features/staged-item-card";
import { ScanBarcode, Plus, Loader2 } from "lucide-react";
import type { InventoryItem } from "@/types/books";

export default function StagingPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory");
      const json = await res.json();
      if (res.ok) {
        setItems(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch staged items:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Staging Area</h1>
          <p className="text-text-muted">
            Scan books, add photos, and prepare listings before publishing.
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Book
        </Button>
      </div>

      {/* Items list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : items.length === 0 ? (
        <GlassPanel>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-accent/10 p-4">
              <ScanBarcode className="h-10 w-10 text-accent" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-text-primary">
              No staged items
            </h3>
            <p className="mt-2 max-w-sm text-sm text-text-muted">
              Scan a barcode or enter an ISBN to add your first book to the staging area.
            </p>
            <Button onClick={() => setShowAddModal(true)} className="mt-6">
              <Plus className="mr-1 h-4 w-4" />
              Add Your First Book
            </Button>
          </div>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <StagedItemCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Add Book Modal */}
      <AddBookModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onBookAdded={fetchItems}
      />
    </div>
  );
}
