# Photo Intake v2 -- Multi-Photo AI Staging

> **Goal:** Replace the current multi-step staging flow with a single-action intake: drag photos in, pick condition, add notes, and the AI handles everything else -- metadata extraction, listing generation, photo storage, and staging.

---

## Context

Michael's current workflow outside ScryVault: photograph book → sync photos via OneDrive → open Claude chat → drop 3-4 photos + condition notes → Claude generates SEO title + HTML description → copy-paste into eBay draft. ScryVault needs to match or beat that level of convenience.

The current ScryVault intake has three separate steps (add book via ISBN/photo/manual → upload photos on detail page → generate listing on detail page). This spec collapses that into one action with the detail page becoming a review/edit step.

---

## The Modal: Photo + AI Tab

The "Add Book" modal gets a redesigned default tab. ISBN Lookup and Manual Entry tabs remain as fallbacks.

### Photo + AI Tab Layout (top to bottom)

1. **Photo drop zone** -- large area accepting drag-drop from file system (OneDrive folder) or click to browse. Shows thumbnail grid as photos are added. Drag to reorder thumbnails. Click X on a thumbnail to remove it before submission. No hard limit in the modal.

2. **Condition dropdown** -- Brand New / Like New / Very Good / Good / Acceptable. Required field.

3. **Condition notes** -- text area, placeholder: "Describe wear, markings, defects..." Optional.

4. **Additional instructions** -- text area, placeholder: "e.g. Bundle of 3 books, first edition, give it an Aeldern Note, not a book..." Optional. This is the escape hatch for anything the standard template doesn't cover: bundles, non-book products, special edition callouts, explicit instructions to the AI.

5. **"Stage Book" button** -- disabled until at least one photo and a condition are provided.

### Drag-Drop Behavior

- HTML5 drag-drop with visual feedback: border highlight + "Drop photos here" overlay on drag-over
- Accept: image/jpeg, image/png, image/webp
- Each photo compressed client-side before upload (existing compressImage utility: max 1600px, 80% JPEG quality)
- Thumbnail grid shows photos in drop order, draggable to reorder
- First photo in order = primary image (eBay cover photo)

---

## Submit Flow (What Happens Behind the Scenes)

When the user clicks "Stage Book":

### Step 1: Upload Photos to Supabase Storage
- All photos uploaded in parallel to Supabase Storage bucket "book-images"
- Path: `{userId}/{inventoryItemId}/{uuid}.jpg` (inventory_item_id generated as UUID client-side or by the API)
- Returns public URLs for each photo

### Step 2: Send to Gemini Vision
- Single Gemini 2.5 Flash API call with ALL photos + structured prompt
- The system prompt includes Michael's full Aeldern Tomes listing template (Pre-Check → Description → Details → Boilerplate → SEO Title) baked into the n8n workflow
- User inputs (condition, condition notes, additional instructions) are appended to the prompt
- Gemini performs:
  - **Pre-Check**: ISBN extraction, edition/printing identification from number line, format detection, visible flaw identification
  - **Metadata extraction**: title, author, publisher, publication date, edition, printing number
  - **Listing generation**: SEO title (max 80 chars, Cassini-optimized), HTML description (description paragraph + details bullets + boilerplate), condition grade with notes
- `thinkingBudget: 0` to avoid wasting output tokens on chain-of-thought
- `maxOutputTokens: 8192` to accommodate full listing output
- Returns structured JSON with all extracted metadata + generated listing content

### Step 3: Open Library Enrichment
- If ISBN extracted → call Open Library API for cover image URL + page count
- Cover image URL stored in books_catalog.cover_url
- Best-effort: if Open Library doesn't have it, continue without

### Step 4: Create Database Records
- **books_catalog**: title, authors, isbn, publisher, published_date, page_count, cover_url, categories
- **inventory_items**: book_id (FK), condition, condition_notes, listing_title (SEO title), listing_description (HTML), listing_condition_notes, listing_price (suggested_price if Gemini provides one), status="staged"
- **item_images**: one row per photo, linked to inventory_item_id, display_order matching the user's drag order, first image is_primary=true

### Step 5: Redirect
- Close the modal
- Navigate to the staging detail page for the new item
- Everything pre-filled: book metadata, all photos attached and reorderable, listing content ready for review

---

## The Detail Page (Review/Edit Step)

The staging detail page already exists and handles:
- Book metadata display (title, author, ISBN, publisher, etc.)
- Photo gallery with upload, reorder, delete, set-primary (ImageUploader component)
- Condition editing
- Listing content preview and editing (ListingPreview component)
- "Generate Listing" button (for regeneration)
- eBay publish button

### Changes Needed

1. **Photo gallery**: Add drag-to-reorder support. Currently supports upload/delete/set-primary but not reorder. Reordering updates display_order in item_images table.

2. **Cover image display**: Book Details section should show the Open Library cover_url from books_catalog if available, falling back to the primary item_image.

3. **Listing content**: Should be pre-populated from the Gemini response (SEO title in listing_title, HTML description in listing_description, condition notes in listing_condition_notes). The "Generate Listing" button becomes "Regenerate Listing" when content already exists.

---

## n8n Workflow Design

### New Workflow: SUB_LP_Photo_Stager

Replaces the current UTIL_Photo_Lookup_Webhook with a more comprehensive workflow.

**Accepts:** { images: [{ url, mimeType }], condition, conditionNotes, instructions }
**Returns:** { metadata: { title, authors, isbn, isbn13, publisher, publishedDate, edition, printingNumber, pages }, listing: { seoTitle, htmlDescription, conditionNotes, suggestedPrice }, lookupSource }

**Nodes:**
1. Execute Workflow Trigger
2. Build Gemini Prompt (Code node) -- assembles the full Aeldern Tomes template + user inputs + image references
3. Call Gemini Vision (HTTP Request) -- sends all images + prompt, googlePalmApi credential
4. Parse Gemini Response (Code node) -- extracts JSON, strips markdown fences, fallback regex extraction
5. Open Library Enrichment (HTTP Request) -- ISBN lookup for cover + page count, continueOnFail
6. Merge Results (Code node) -- combines Gemini output + OL enrichment
7. Error Trigger → SUB_Error_Handler

### Webhook Wrapper: UTIL_Photo_Stager_Webhook

Thin wrapper: webhook trigger → call SUB_LP_Photo_Stager → return result.
Path: POST /webhook/books/photo-stage

### System Prompt (Baked into Node 2)

Michael's full Aeldern Tomes listing template including:
- Pre-Check rules (ISBN, edition, number line, format, flaws)
- Description rules (jacket-copy style, no spoilers, 3-5 sentences)
- Details section format (Franchise, Title, Author, ISBN, Format/Edition, Publisher, Condition)
- Boilerplate lines (store link, follow, bundling, shipping, questions, requests)
- SEO title rules (80 char max, Cassini-optimized, no slashes/commas/dashes, keyword priority order)
- Bundle handling rules
- Non-book product adaptation rules
- Aeldern Notes rules (only when explicitly requested)
- Condition grade standards (Brand New, Like New, Very Good, Good, Acceptable)

This prompt is maintained in the n8n workflow, not in the frontend code.

---

## API Changes

### New Route: POST /api/books/photo-stage

Accepts JSON: `{ imageUrls: string[], condition: string, conditionNotes?: string, instructions?: string }`

1. Validates auth + required fields
2. Calls n8n webhook `books/photo-stage`
3. Creates books_catalog record (if ISBN found and not already in catalog)
4. Creates inventory_items record with listing content pre-filled
5. Creates item_images records for all photos
6. Returns the full inventory item with joins

### Modified: POST /api/inventory

Currently handles staging from ISBN/Manual entry. No changes needed -- the new photo-stage route handles the photo flow separately.

### Modified: Image upload flow

Currently photos are uploaded via POST /api/images/upload AFTER the item exists. For the new flow, photos are uploaded BEFORE the item is created (we need the URLs to send to Gemini). Two options:

**Option chosen: Upload first, create records after.**
- Frontend uploads photos to Supabase Storage via existing uploadBookImage() utility
- Generates a temporary item ID (UUID) for the storage path
- Sends photo public URLs to the n8n webhook
- After Gemini responds, creates the inventory_items record using the same UUID as the ID
- Creates item_images records linking to the already-uploaded photos

---

## Frontend Changes

### add-book-modal.tsx

- New default tab "Photo + AI" with:
  - Drag-drop zone (HTML5 DnD API with dragover/drop event handlers)
  - Thumbnail grid with drag-to-reorder (maintain an ordered array in state)
  - Condition dropdown (existing BookCondition type: Brand New / Like New / Very Good / Good / Acceptable)
  - Condition notes textarea
  - Additional instructions textarea
  - Loading state: progress indicator during upload + AI processing ("Uploading photos... Analyzing... Generating listing...")
- ISBN Lookup and Manual Entry tabs unchanged

### image-uploader.tsx

- Add drag-to-reorder support using HTML5 DnD or a lightweight library
- On reorder: PATCH display_order for affected images
- Add drag-to-upload (drop zone) to the existing upload area

### staging/[id]/page.tsx

- Book Details section: display books_catalog.cover_url if available (currently only shows item_images primary)
- Listing content: show "Regenerate Listing" instead of "Generate Listing" when listing_title already exists

---

## Condition Mapping

| ScryVault Condition | eBay ConditionID |
|---|---|
| Brand New | 1000 |
| Like New | 3000 |
| Very Good | 4000 |
| Good | 5000 |
| Acceptable | 6000 |

---

## Error Handling

- **No photos provided**: Button disabled, cannot submit
- **No condition selected**: Button disabled, cannot submit
- **Upload failure**: Show error per-photo, allow retry
- **Gemini timeout/failure**: Show error, offer "Try Again" button. Photos already uploaded are preserved.
- **Gemini can't extract title**: Check if user provided one in instructions. If not: "Couldn't identify the book. Add a title in the instructions field and try again."
- **Open Library lookup fails**: Continue without enrichment (cover, pages). Best-effort.
- **Supabase record creation fails**: Show error, photos remain in storage for retry

---

## Cost Estimate

- Gemini 2.5 Flash Vision: ~$0.001-0.003 per staging (4-6 photos + prompt)
- Open Library API: free
- Supabase Storage: included in plan
- Total per book: under $0.01

---

## What This Does NOT Include

- Mobile-first workflow (future consideration)
- Pulling photos from existing eBay listings (separate feature)
- Auto-publishing to eBay (user reviews and publishes manually)
- Price suggestion from market data (future feature)
- Batch processing multiple books at once (each book is one modal submission)
