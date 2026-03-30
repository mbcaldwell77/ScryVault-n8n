import { createAdminClient } from "@/lib/db/supabase-admin";

const BOOK_IMAGES_BUCKET = "book-images";
const BOOK_IMAGE_FILE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024;
const BOOK_IMAGE_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SUPABASE_PUBLIC_OBJECT_PREFIX = `/storage/v1/object/public/${BOOK_IMAGES_BUCKET}/`;
let bookImagesBucketReadyPromise: Promise<void> | null = null;

function sanitizeExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() || "jpg";
  return extension.replace(/[^a-z0-9]/g, "") || "jpg";
}

export function getBookImagesBucketName(): string {
  return BOOK_IMAGES_BUCKET;
}

export function buildBookImageStoragePath(input: {
  userId: string;
  inventoryItemId: string;
  fileName: string;
}): string {
  const extension = sanitizeExtension(input.fileName);
  const uniqueId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${input.userId}/${input.inventoryItemId}/${uniqueId}.${extension}`;
}

async function ensureBookImagesBucketInternal() {
  const admin = createAdminClient();
  const { error: bucketError } = await admin.storage.getBucket(BOOK_IMAGES_BUCKET);

  if (bucketError) {
    const bucketMissing =
      /not found/i.test(bucketError.message) ||
      String((bucketError as { statusCode?: number | string }).statusCode || "") === "404";

    if (!bucketMissing) {
      throw bucketError;
    }

    const { error: createError } = await admin.storage.createBucket(BOOK_IMAGES_BUCKET, {
      public: true,
      fileSizeLimit: BOOK_IMAGE_FILE_SIZE_LIMIT_BYTES,
      allowedMimeTypes: [...BOOK_IMAGE_ALLOWED_MIME_TYPES],
    });

    if (createError && !/already exists/i.test(createError.message)) {
      throw createError;
    }
  }

  const { error: updateError } = await admin.storage.updateBucket(BOOK_IMAGES_BUCKET, {
    public: true,
    fileSizeLimit: BOOK_IMAGE_FILE_SIZE_LIMIT_BYTES,
    allowedMimeTypes: [...BOOK_IMAGE_ALLOWED_MIME_TYPES],
  });

  if (updateError) {
    throw updateError;
  }
}

export async function ensureBookImagesBucket(): Promise<void> {
  if (!bookImagesBucketReadyPromise) {
    bookImagesBucketReadyPromise = ensureBookImagesBucketInternal().catch((error) => {
      bookImagesBucketReadyPromise = null;
      throw error;
    });
  }

  await bookImagesBucketReadyPromise;
}

export async function uploadBookImage(input: {
  userId: string;
  inventoryItemId: string;
  file: File;
}): Promise<{ publicUrl: string; storagePath: string }> {
  await ensureBookImagesBucket();

  const admin = createAdminClient();
  const storagePath = buildBookImageStoragePath({
    userId: input.userId,
    inventoryItemId: input.inventoryItemId,
    fileName: input.file.name,
  });

  const { error: uploadError } = await admin.storage
    .from(BOOK_IMAGES_BUCKET)
    .upload(storagePath, input.file, {
      contentType: input.file.type,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = admin.storage.from(BOOK_IMAGES_BUCKET).getPublicUrl(storagePath);

  return {
    publicUrl: data.publicUrl,
    storagePath,
  };
}

export function getBookImageStoragePathFromPublicUrl(
  publicUrl: string | null | undefined,
): string | null {
  if (!publicUrl) {
    return null;
  }

  try {
    const url = new URL(publicUrl);
    const prefixIndex = url.pathname.indexOf(SUPABASE_PUBLIC_OBJECT_PREFIX);

    if (prefixIndex === -1) {
      return null;
    }

    return decodeURIComponent(
      url.pathname.slice(prefixIndex + SUPABASE_PUBLIC_OBJECT_PREFIX.length),
    );
  } catch {
    return null;
  }
}

export async function deleteBookImage(image: {
  storage_path?: string | null;
  public_url?: string | null;
}): Promise<void> {
  const storagePath =
    image.storage_path || getBookImageStoragePathFromPublicUrl(image.public_url);

  if (!storagePath) {
    return;
  }

  await ensureBookImagesBucket();

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BOOK_IMAGES_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw error;
  }
}
