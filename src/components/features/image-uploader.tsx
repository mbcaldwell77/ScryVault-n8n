"use client";

import Image from "next/image";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { ImagePlus, X, Star, Loader2 } from "lucide-react";
import { compressImage } from "@/lib/storage/compress-image";
import type { ItemImage } from "@/types/books";

interface ImageUploaderProps {
  inventoryItemId: string;
  images: ItemImage[];
  onImagesChange: (images: ItemImage[]) => void;
}

const MAX_IMAGES = 12;

export function ImageUploader({ inventoryItemId, images, onImagesChange }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_IMAGES - images.length;
    setError("");

    if (remainingSlots <= 0) {
      const message = `You can upload up to ${MAX_IMAGES} photos per item.`;
      setError(message);
      toast({
        title: "Photo limit reached",
        description: message,
        variant: "warning",
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      return;
    }

    const selectedFiles = Array.from(files);
    const filesToUpload = selectedFiles.slice(0, remainingSlots);
    const newImages: ItemImage[] = [];

    if (filesToUpload.length < selectedFiles.length) {
      toast({
        title: "Photo limit applied",
        description: `Only the first ${remainingSlots} photo${remainingSlots === 1 ? " was" : "s were"} added. ${selectedFiles.length - filesToUpload.length} extra file${selectedFiles.length - filesToUpload.length === 1 ? " was" : "s were"} skipped.`,
        variant: "warning",
      });
    }

    setUploading(true);

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const compressed = await compressImage(file);

        const formData = new FormData();
        formData.append("file", compressed);
        formData.append("inventory_item_id", inventoryItemId);
        formData.append("display_order", String(images.length + i));
        formData.append("is_primary", String(images.length === 0 && i === 0));

        const res = await fetch("/api/images/upload", {
          method: "POST",
          body: formData,
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(json?.error?.message || "Upload failed");
        }

        newImages.push(json.data);
      }

      onImagesChange([...images, ...newImages]);
      toast({
        title: newImages.length === 1 ? "Photo uploaded" : "Photos uploaded",
        description:
          newImages.length === 1
            ? "Your image is ready for listing generation."
            : `${newImages.length} photos were added successfully.`,
        variant: "success",
      });
    } catch (err) {
      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages]);
      }

      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      toast({
        title: "Upload failed",
        description:
          newImages.length > 0
            ? `${message} ${newImages.length} photo${newImages.length === 1 ? " was" : "s were"} uploaded before the failure.`
            : message,
        variant: "error",
      });
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDelete(imageId: string) {
    setError("");
    setBusyImageId(imageId);

    try {
      const res = await fetch(`/api/images/${imageId}`, { method: "DELETE" });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to delete image");
      }

      const nextPrimaryImageId = json?.data?.next_primary_image_id as string | null | undefined;
      const remainingImages = images.filter((img) => img.id !== imageId);

      onImagesChange(
        remainingImages.map((img) => ({
          ...img,
          is_primary: nextPrimaryImageId ? img.id === nextPrimaryImageId : img.is_primary,
        })),
      );
      toast({
        title: "Photo removed",
        description: "The image was deleted.",
        variant: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete image";
      setError(message);
      toast({
        title: "Photo delete failed",
        description: message,
        variant: "error",
      });
      console.error("Delete failed:", err);
    } finally {
      setBusyImageId(null);
    }
  }

  async function handleSetPrimary(imageId: string) {
    if (images.find((img) => img.id === imageId)?.is_primary) {
      return;
    }

    const previousImages = images;
    const optimisticImages = images.map((img) => ({
      ...img,
      is_primary: img.id === imageId,
    }));

    setError("");
    setBusyImageId(imageId);
    onImagesChange(optimisticImages);

    try {
      const res = await fetch(`/api/images/${imageId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_primary: true }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to set primary image");
      }

      const primaryImageId = json?.data?.id || imageId;

      onImagesChange(
        optimisticImages.map((img) => ({
          ...img,
          is_primary: img.id === primaryImageId,
        })),
      );
      toast({
        title: "Primary photo updated",
        description: "This image will be used as the main listing photo.",
        variant: "success",
      });
    } catch (err) {
      onImagesChange(previousImages);
      const message = err instanceof Error ? err.message : "Failed to set primary image";
      setError(message);
      toast({
        title: "Primary photo update failed",
        description: message,
        variant: "error",
      });
      console.error("Set primary failed:", err);
    } finally {
      setBusyImageId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text-muted">
          Photos ({images.length}/{MAX_IMAGES})
        </label>
        {images.length < MAX_IMAGES && (
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            loading={uploading}
            disabled={Boolean(busyImageId)}
          >
            <ImagePlus className="mr-1 h-4 w-4" />
            Add Photos
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {images.length === 0 && !uploading ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] py-10 transition-colors hover:border-accent/30 hover:bg-accent/5"
        >
          <ImagePlus className="h-8 w-8 text-text-muted/40" />
          <p className="mt-2 text-sm text-text-muted">
            Click to upload photos
          </p>
          <p className="text-xs text-text-muted/60">
            JPEG, PNG, or WebP — max 5MB each
          </p>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {uploading && (
            <div className="flex aspect-square items-center justify-center rounded-lg bg-white/5">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          )}
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-lg bg-white/5"
            >
              <Image
                src={img.public_url}
                alt={`Uploaded photo ${img.display_order + 1}`}
                fill
                sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 16vw"
                className="object-cover"
              />

              <div className="absolute inset-0 flex items-start justify-end gap-1 bg-black/0 p-1 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => handleSetPrimary(img.id)}
                  disabled={uploading || busyImageId === img.id}
                  className={`rounded-md p-1 ${img.is_primary
                    ? "bg-accent text-vault-base"
                    : "bg-black/50 text-white hover:bg-accent hover:text-vault-base"
                    }`}
                  aria-label={`Set photo ${img.display_order + 1} as primary`}
                  title="Set as primary"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(img.id)}
                  disabled={uploading || busyImageId === img.id}
                  className="rounded-md bg-black/50 p-1 text-white hover:bg-danger hover:text-white"
                  aria-label={`Delete photo ${img.display_order + 1}`}
                  title="Delete"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {busyImageId === img.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}

              {img.is_primary && (
                <div className="absolute bottom-1 left-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-vault-base">
                  PRIMARY
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
