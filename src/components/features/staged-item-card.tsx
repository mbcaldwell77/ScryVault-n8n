"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { BookCoverImage } from "@/components/ui/book-cover-image";
import { MapPin, DollarSign } from "lucide-react";
import type { InventoryItem } from "@/types/books";

interface StagedItemCardProps {
  item: InventoryItem;
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "staged": return "default" as const;
    case "inventory": return "accent" as const;
    case "listed": return "success" as const;
    case "sold": return "success" as const;
    default: return "default" as const;
  }
}

export function StagedItemCard({ item }: StagedItemCardProps) {
  const book = item.books_catalog;

  return (
    <Link href={`/staging/${item.id}`}>
      <div className="group rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl transition-all duration-200 hover:border-accent/20 hover:bg-white/[0.07]">
        <div className="flex gap-4">
          <BookCoverImage
            src={book?.cover_url}
            alt={book?.title || "Book cover"}
            className="h-24 w-16 shrink-0"
            sizes="64px"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
                {book?.title || "Unknown Title"}
              </h3>
              <Badge variant={statusBadgeVariant(item.status)} className="shrink-0">
                {item.status}
              </Badge>
            </div>

            {book?.authors && book.authors.length > 0 && (
              <p className="mt-0.5 text-sm text-text-muted truncate">
                {book.authors.join(", ")}
              </p>
            )}

            {book?.isbn && (
              <p className="mt-0.5 text-xs text-text-muted/60 font-mono">
                ISBN: {book.isbn}
              </p>
            )}

            {/* Meta row */}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span className="inline-flex items-center gap-1">
                <Badge variant={
                  item.condition === "Brand New" || item.condition === "Like New"
                    ? "success"
                    : item.condition === "Good" || item.condition === "Very Good"
                      ? "accent"
                      : "warning"
                }>
                  {item.condition}
                </Badge>
              </span>

              {item.cost_basis != null && (
                <span className="inline-flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  ${Number(item.cost_basis).toFixed(2)}
                </span>
              )}

              {item.storage_location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {item.storage_location}
                </span>
              )}

              {item.sources?.name && (
                <span className="text-text-muted/60">
                  via {item.sources.name}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
