ALTER TABLE item_images
ADD COLUMN IF NOT EXISTS storage_path TEXT;

UPDATE item_images
SET storage_path = regexp_replace(
  public_url,
  '^.*?/storage/v1/object/public/book-images/',
  ''
)
WHERE storage_path IS NULL
  AND public_url LIKE '%/storage/v1/object/public/book-images/%';
