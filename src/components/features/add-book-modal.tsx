"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassPanel } from "@/components/ui/glass-panel";
import { BookCoverImage } from "@/components/ui/book-cover-image";
import { BarcodeScanner } from "@/components/features/barcode-scanner";
import { Search, BookOpen, Plus, Camera } from "lucide-react";
import type { BookMetadata } from "@/lib/books/google-books";

interface AddBookModalProps {
  open: boolean;
  onClose: () => void;
  onBookAdded: () => void;
}

export function AddBookModal({ open, onClose, onBookAdded }: AddBookModalProps) {
  const [isbn, setIsbn] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lookupResult, setLookupResult] = useState<BookMetadata | null>(null);
  const [mode, setMode] = useState<"isbn" | "manual">("isbn");
  const [showScanner, setShowScanner] = useState(false);

  // Manual entry fields
  const [manualTitle, setManualTitle] = useState("");
  const [manualAuthors, setManualAuthors] = useState("");
  const [manualPublisher, setManualPublisher] = useState("");
  const [manualYear, setManualYear] = useState("");

  function resetState() {
    setIsbn("");
    setSearching(false);
    setSaving(false);
    setError("");
    setLookupResult(null);
    setMode("isbn");
    setShowScanner(false);
    setManualTitle("");
    setManualAuthors("");
    setManualPublisher("");
    setManualYear("");
  }

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleISBNLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLookupResult(null);
    setSearching(true);

    try {
      const res = await fetch(`/api/books/lookup?isbn=${encodeURIComponent(isbn)}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message || "Lookup failed");
        return;
      }

      setLookupResult(json.data);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSearching(false);
    }
  }

  async function handleAddToStaging(book: {
    isbn?: string;
    title: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    subtitle?: string;
    pageCount?: number;
    description?: string;
    coverUrl?: string;
    categories?: string[];
    language?: string;
  }) {
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(book),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message || "Failed to add book");
        setSaving(false);
        return;
      }

      onBookAdded();
      handleClose();
    } catch {
      setError("Network error — please try again");
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Book to Staging" className="max-w-xl">
      {/* Mode toggle */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => { setMode("isbn"); setError(""); setLookupResult(null); }}
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${mode === "isbn"
            ? "bg-accent/10 text-accent border border-accent/20"
            : "bg-white/5 text-text-muted border border-white/10 hover:bg-white/10"
            }`}
        >
          <Search className="mr-2 inline h-4 w-4" />
          ISBN Lookup
        </button>
        <button
          onClick={() => { setMode("manual"); setError(""); setLookupResult(null); }}
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${mode === "manual"
            ? "bg-accent/10 text-accent border border-accent/20"
            : "bg-white/5 text-text-muted border border-white/10 hover:bg-white/10"
            }`}
        >
          <BookOpen className="mr-2 inline h-4 w-4" />
          Manual Entry
        </button>
      </div>

      {mode === "isbn" && (
        <>
          {showScanner ? (
            <BarcodeScanner
              onScan={(scannedIsbn) => {
                setShowScanner(false);
                setIsbn(scannedIsbn);
              }}
              onClose={() => setShowScanner(false)}
            />
          ) : (
            <>
              <form onSubmit={handleISBNLookup} className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Enter ISBN (10 or 13 digits)"
                    value={isbn}
                    onChange={(e) => setIsbn(e.target.value)}
                    autoFocus
                  />
                </div>
                <Button type="submit" loading={searching} size="md">
                  Search
                </Button>
              </form>
              <button
                type="button"
                onClick={() => { setShowScanner(true); setError(""); setLookupResult(null); }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-text-muted transition-all hover:bg-white/10 hover:text-text-primary"
              >
                <Camera className="h-4 w-4" />
                Scan ISBN Barcode
              </button>
            </>
          )}

          {lookupResult && (
            <GlassPanel size="sm" className="mt-4">
              <div className="flex gap-4">
                <BookCoverImage
                  src={lookupResult.coverUrl}
                  alt={lookupResult.title}
                  className="h-32 w-24 shrink-0 shadow-md"
                  sizes="96px"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text-primary truncate">
                    {lookupResult.title}
                  </h3>
                  {lookupResult.subtitle && (
                    <p className="text-sm text-text-muted truncate">{lookupResult.subtitle}</p>
                  )}
                  <p className="mt-1 text-sm text-text-muted">
                    {lookupResult.authors?.join(", ")}
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    {[lookupResult.publisher, lookupResult.publishedDate].filter(Boolean).join(" · ")}
                  </p>
                  {lookupResult.pageCount && (
                    <p className="text-xs text-text-muted">{lookupResult.pageCount} pages</p>
                  )}
                </div>
              </div>
              <Button
                onClick={() => handleAddToStaging(lookupResult)}
                loading={saving}
                className="mt-4 w-full"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add to Staging
              </Button>
            </GlassPanel>
          )}
        </>
      )}

      {mode === "manual" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddToStaging({
              title: manualTitle,
              authors: manualAuthors ? manualAuthors.split(",").map((a) => a.trim()) : undefined,
              publisher: manualPublisher || undefined,
              publishedDate: manualYear || undefined,
            });
          }}
          className="space-y-4"
        >
          <Input
            label="Title"
            placeholder="Book title"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="Author(s)"
            placeholder="Comma-separated (e.g., Author One, Author Two)"
            value={manualAuthors}
            onChange={(e) => setManualAuthors(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Publisher"
              placeholder="Publisher name"
              value={manualPublisher}
              onChange={(e) => setManualPublisher(e.target.value)}
            />
            <Input
              label="Year"
              placeholder="e.g., 2024"
              value={manualYear}
              onChange={(e) => setManualYear(e.target.value)}
            />
          </div>
          <Button type="submit" loading={saving} className="w-full">
            <Plus className="mr-1 h-4 w-4" />
            Add to Staging
          </Button>
        </form>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}
    </Modal>
  );
}
