# Photo Intake v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current multi-step staging flow with a single-action "Photo + AI" intake: drag photos in, pick condition, add notes, and the system handles metadata extraction, listing generation, photo storage, and staging in one action.

**Architecture:** New n8n workflow (SUB_LP_Photo_Stager) with the full Aeldern Tomes listing template baked in as the Gemini system prompt. New API route on ScryVault app that uploads photos to Supabase Storage first, then calls n8n with photo URLs, then creates books_catalog + inventory_items + item_images in one transaction. Add-Book modal gets a redesigned "Photo + AI" tab with drag-drop upload, thumbnail reordering, condition dropdown, and free-text instructions. ImageUploader component on the detail page gets drag-drop upload and drag-to-reorder.

**Tech Stack:** Next.js 16, TypeScript strict, Supabase (PostgreSQL + Storage), n8n, Gemini 2.5 Flash Vision, Open Library API, @dnd-kit for drag-and-drop.

---

## File Structure

### New files
- `n8n workflow JSON export: n8n-workflows/_shadow-library/service-modules/SUB_LP_Photo_Stager.json` -- Gemini Vision + Open Library enrichment
- `n8n workflow JSON export: n8n-workflows/_shadow-library/service-modules/UTIL_Photo_Stager_Webhook.json` -- webhook wrapper
- `src/app/api/books/photo-stage/route.ts` -- new API route that orchestrates upload → AI → DB creation
- `src/lib/storage/upload-book-images.ts` -- client-side helper for batch uploading pre-item photos
- `src/components/features/photo-intake-form.tsx` -- new sub-component for the Photo + AI tab

### Modified files
- `src/components/features/add-book-modal.tsx` -- replace Photo Lookup tab with new PhotoIntakeForm
- `src/components/features/image-uploader.tsx` -- add drag-drop and drag-to-reorder
- `src/app/api/images/[id]/route.ts` -- add PATCH support for display_order changes
- `src/app/(dashboard)/staging/[id]/page.tsx` -- prefer books_catalog.cover_url for Book Details display
- `package.json` -- add @dnd-kit dependencies

### Deleted files
- None (keep the existing Photo Lookup route working during transition, remove at end)

---

## Task 0: Setup Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @dnd-kit**

Run:
```bash
cd C:/Users/MBC/Codebases/business-infrastructure/scryvault-n8n
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: Packages installed, package.json updated.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit for drag-and-drop"
```

---

## Task 1: Create SUB_LP_Photo_Stager n8n Workflow

**Files:**
- Create via n8n API: workflow "SUB_LP_Photo_Stager" (n8n workflow, exported JSON lives in n8n-workflows repo but MUST be created in the live n8n instance)

- [ ] **Step 1: Build the workflow via n8n REST API**

Create a Python script `C:/Users/MBC/scripts/create_photo_stager.py`:

```python
import json, urllib.request, os

n8n_key = os.environ['N8N_API_KEY']
n8n_url = os.environ['N8N_API_URL']

SYSTEM_PROMPT = """You are a professional eBay listing strategist for the eBay store Aeldern Tomes, a one-person bookstore specializing in rare, collectible, out-of-print, and first edition science fiction, fantasy, and Star Wars titles. Your job is to craft SEO-optimized Cassini titles and HTML descriptions for eBay listings.

PRE-CHECK: Analyze all provided images for: ISBN, edition and number line print info, format (Hardcover/Trade Paperback/Softcover/etc.), visible flaws (scratches, bubbling, stains, edge wear, tears, fading). Pull as much metadata from photos as possible. DO NOT GUESS - if unsure, leave the field empty and note it in notes.

DESCRIPTION: Jacket-copy style, no spoilers, 3-5 sentences. If part of a series, note it without giving away events. For Broken Binding editions, include a second paragraph detailing Tier level, stenciled edges, reversible dust jacket, endpaper artists, bookmark, signed/unsigned status.

DETAILS bullets in this exact order:
- Franchise/Series (if applicable; for Star Wars Legends include "Expanded Universe (EU)")
- Title
- Author
- ISBN (without dashes)
- Format/Edition (use "1st Edition" not "First Edition"; never both "First Edition" AND "First Printing")
- Publisher (only include if collectible significance: Gollancz UK, Subterranean Press, SFBC, Broken Binding, Goldsboro)
- Condition: [Grade] - [Flaw summary]. Please review the photos carefully before purchasing for condition details.

BOILERPLATE (each line separated by blank line, NO visual separators):
Visit the eBay store at https://www.ebay.com/str/elderntomes
Follow the store for new listings and great finds!
Bundling available - check storefront and message to combine shipping.
Ships in 24 hours or less, carefully packaged.
Questions? Feedback? Message me - quick to answer.
Aeldern Tomes take requests! Message your want list and I'll keep an eye out.

SEO TITLE RULES (strict 80-char max, aim 78-80):
- No slashes, commas, em dashes, hyphens. Periods only in initials/abbreviations.
- Must include: full Title, full Author name, spelled-out Format
- No publication year unless explicitly requested
- No filler (publisher, condition, ex-library, etc.)
- For fiction order: Title, Author, Format, Edition, then optional Genre/Series
- For Star Wars books: 'Star Wars' first, then book title, then author, then format, then 'Legends' as its own keyword
- For nonfiction: prioritize subject/topic keywords over publisher
- Only include publisher name if collectibly significant (Gollancz, Subterranean, SFBC, Broken Binding, Goldsboro)

CONDITION GRADES: Brand New, Like New, Very Good, Good, Acceptable

BUNDLES: List every title in Details. Include ISBNs if visible in photos.

NON-BOOK ITEMS: Adapt template - title becomes product name, ISBN becomes UPC, publisher becomes brand. Omit fields with no analogue.

Follow the seller's additional instructions if provided. Return ONLY valid JSON, no markdown fences."""

workflow = {
    "name": "SUB_LP_Photo_Stager",
    "nodes": [
        # ROI sticky
        {"id": "sticky-roi", "name": "ROI Overview", "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": [40, -200],
         "parameters": {"content": "## Photo Stager\n**Accepts:** { imageUrls[], condition, conditionNotes, instructions }\n**Returns:** { metadata, listing, lookupSource }\n**Call via:** Execute Workflow from UTIL_Photo_Stager_Webhook\n\nGemini Vision extracts book metadata from photos + generates Aeldern Tomes eBay listing (SEO title + HTML description). Open Library enrichment adds cover + page count.", "width": 540, "height": 160, "color": 5}},
        # Execute Workflow Trigger
        {"id": "trigger", "name": "Receive Photos Request", "type": "n8n-nodes-base.executeWorkflowTrigger", "typeVersion": 1.1, "position": [260, 0],
         "parameters": {"workflowInputs": {"values": [
             {"name": "imageUrls", "type": "array"},
             {"name": "condition", "type": "string"},
             {"name": "conditionNotes", "type": "string"},
             {"name": "instructions", "type": "string"}
         ]}}},
        # Build Gemini Prompt
        {"id": "build-prompt", "name": "Build Gemini Prompt", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [480, 0],
         "parameters": {"mode": "runOnceForAllItems",
          "jsCode": f"""const input = $input.first().json;
const systemPrompt = {json.dumps(SYSTEM_PROMPT)};
const userPrompt = 'Condition: ' + (input.condition || 'Good') + '\\n\\n' +
  'Condition notes: ' + (input.conditionNotes || '(none)') + '\\n\\n' +
  'Additional instructions: ' + (input.instructions || '(none)') + '\\n\\n' +
  'Return a JSON object with this exact shape (no markdown fences):\\n' +
  '{\\n' +
  '  \"metadata\": {\"title\": \"\", \"authors\": \"\", \"isbn\": \"\", \"isbn13\": \"\", \"publisher\": \"\", \"publishedDate\": \"\", \"edition\": \"\", \"printingNumber\": \"\", \"pages\": \"\", \"format\": \"\"},\\n' +
  '  \"listing\": {\"seoTitle\": \"\", \"htmlDescription\": \"\", \"conditionSummary\": \"\"}\\n' +
  '}';

return [{{ json: {{ systemPrompt, userPrompt, imageUrls: input.imageUrls || [] }} }}];"""}},
        # Call Gemini Vision
        {"id": "call-gemini", "name": "Call Gemini Vision", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [700, 0],
         "retryOnFail": True, "maxTries": 3, "waitBetweenTries": 3000,
         "parameters": {
             "method": "POST",
             "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
             "authentication": "predefinedCredentialType",
             "sendHeaders": True,
             "headerParameters": {"parameters": [{"name": "Content-Type", "value": "application/json"}]},
             "sendBody": True, "contentType": "json", "specifyBody": "json",
             "jsonBody": "={{ JSON.stringify({ systemInstruction: { parts: [{ text: $json.systemPrompt }] }, contents: [{ parts: [ { text: $json.userPrompt }, ...$json.imageUrls.map(u => ({ fileData: { fileUri: u, mimeType: 'image/jpeg' } })) ] }], generationConfig: { maxOutputTokens: 8192, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } } }) }}",
             "options": {},
             "nodeCredentialType": "googlePalmApi"
         },
         "credentials": {"googlePalmApi": {"id": "JL7o3bNX4uoUpNsu", "name": "Google Gemini(PaLM) Api account"}}
        },
        # Parse Gemini Response
        {"id": "parse-response", "name": "Parse Gemini Response", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [920, 0],
         "parameters": {"mode": "runOnceForAllItems",
          "jsCode": """const response = $input.first().json;
let text = '';
try {
  text = response.candidates[0].content.parts[0].text.trim();
} catch(e) {
  throw new Error('Gemini returned no content');
}
if (text.startsWith('```')) {
  text = text.replace(/^```(?:json)?\\n?/, '').replace(/\\n?```$/, '');
}
let parsed;
try {
  parsed = JSON.parse(text);
} catch(e) {
  throw new Error('Gemini returned invalid JSON: ' + text.substring(0, 300));
}
const metadata = parsed.metadata || {};
const listing = parsed.listing || {};
if (metadata.isbn) metadata.isbn = metadata.isbn.replace(/[^0-9X]/gi, '');
if (metadata.isbn13) metadata.isbn13 = metadata.isbn13.replace(/[^0-9X]/gi, '');
return [{ json: { metadata, listing } }];"""}},
        # Clean ISBN for lookup
        {"id": "clean-isbn", "name": "Clean ISBN", "type": "n8n-nodes-base.set", "typeVersion": 3.4, "position": [1140, 0],
         "parameters": {"mode": "manual", "duplicateItem": False,
          "assignments": {"assignments": [
              {"id": "c1", "name": "cleanIsbn", "value": "={{ ($json.metadata.isbn13 || $json.metadata.isbn || '').replace(/[^0-9X]/gi, '') }}", "type": "string"},
              {"id": "c2", "name": "payload", "value": "={{ JSON.stringify($json) }}", "type": "string"}
          ]}, "options": {}}},
        # Open Library Lookup (best-effort)
        {"id": "ol-lookup", "name": "Open Library Lookup", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1360, 0],
         "continueOnFail": True,
         "parameters": {"method": "GET",
          "url": "=https://openlibrary.org/api/books?bibkeys=ISBN:{{ $json.cleanIsbn }}&format=json&jscmd=data",
          "authentication": "none", "options": {}}},
        # Merge Results
        {"id": "merge-results", "name": "Merge Results", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1580, 0],
         "parameters": {"mode": "runOnceForAllItems",
          "jsCode": """const ol = $input.first().json;
const prev = $('Clean ISBN').first().json;
const payload = JSON.parse(prev.payload);
const cleanIsbn = prev.cleanIsbn;
const metadata = payload.metadata;
const listing = payload.listing;
if (cleanIsbn && ol && ol['ISBN:' + cleanIsbn]) {
  const book = ol['ISBN:' + cleanIsbn];
  if (book.cover) metadata.coverUrl = book.cover.medium || book.cover.large || '';
  if (!metadata.pages && book.number_of_pages) metadata.pages = String(book.number_of_pages);
  if (!metadata.publishedDate && book.publish_date) metadata.publishedDate = book.publish_date;
}
return [{ json: { metadata, listing, lookupSource: 'Gemini Vision + Open Library' } }];"""}}
    ],
    "connections": {
        "Receive Photos Request": {"main": [[{"node": "Build Gemini Prompt", "type": "main", "index": 0}]]},
        "Build Gemini Prompt": {"main": [[{"node": "Call Gemini Vision", "type": "main", "index": 0}]]},
        "Call Gemini Vision": {"main": [[{"node": "Parse Gemini Response", "type": "main", "index": 0}]]},
        "Parse Gemini Response": {"main": [[{"node": "Clean ISBN", "type": "main", "index": 0}]]},
        "Clean ISBN": {"main": [[{"node": "Open Library Lookup", "type": "main", "index": 0}]]},
        "Open Library Lookup": {"main": [[{"node": "Merge Results", "type": "main", "index": 0}]]}
    },
    "settings": {"executionOrder": "v1", "callerPolicy": "workflowsFromSameOwner"}
}

payload = json.dumps(workflow).encode('utf-8')
req = urllib.request.Request(f'{n8n_url}/workflows', data=payload,
    headers={'X-N8N-API-KEY': n8n_key, 'Content-Type': 'application/json'}, method='POST')
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    print(f"Created SUB_LP_Photo_Stager: {data['id']}")
    print(f"SAVE THIS ID for Task 2: {data['id']}")
```

Run it:
```bash
python3 C:/Users/MBC/scripts/create_photo_stager.py
```

Expected output: `Created SUB_LP_Photo_Stager: <id>` and prints the ID.

- [ ] **Step 2: Save the SUB workflow ID in a note file**

Record the SUB workflow ID in `C:/Users/MBC/scripts/photo_stager_ids.txt`:
```
SUB_LP_Photo_Stager: <id from step 1>
```

- [ ] **Step 3: Export the workflow JSON to the repo**

```python
# C:/Users/MBC/scripts/export_photo_stager.py
import json, urllib.request, os
n8n_key = os.environ['N8N_API_KEY']
n8n_url = os.environ['N8N_API_URL']
wf_id = '<SUB_LP_Photo_Stager_ID>'  # paste from photo_stager_ids.txt
req = urllib.request.Request(f'{n8n_url}/workflows/{wf_id}', headers={'X-N8N-API-KEY': n8n_key})
with urllib.request.urlopen(req) as resp:
    wf = json.loads(resp.read().decode('utf-8'))
export = {'name': wf['name'], 'nodes': wf['nodes'], 'connections': wf['connections'], 'settings': wf.get('settings', {}), 'meta': None, 'pinData': None}
with open('C:/Users/MBC/Codebases/n8n-workflows/_shadow-library/service-modules/SUB_LP_Photo_Stager.json', 'w', encoding='utf-8') as f:
    json.dump(export, f, indent=2)
print('Exported')
```

Run it. Expected: file written to repo.

- [ ] **Step 4: Commit the export**

```bash
cd C:/Users/MBC/Codebases/n8n-workflows
git add _shadow-library/service-modules/SUB_LP_Photo_Stager.json
git commit -m "feat: add SUB_LP_Photo_Stager workflow export"
```

---

## Task 2: Create UTIL_Photo_Stager_Webhook

**Files:**
- Create via n8n API: workflow "UTIL_Photo_Stager_Webhook"
- Create: `C:/Users/MBC/Codebases/n8n-workflows/_shadow-library/service-modules/UTIL_Photo_Stager_Webhook.json`

- [ ] **Step 1: Create webhook wrapper workflow**

Create `C:/Users/MBC/scripts/create_photo_stager_webhook.py`:

```python
import json, urllib.request, os

n8n_key = os.environ['N8N_API_KEY']
n8n_url = os.environ['N8N_API_URL']
SUB_ID = '<SUB_LP_Photo_Stager_ID>'  # paste from photo_stager_ids.txt

workflow = {
    "name": "UTIL_Photo_Stager_Webhook",
    "nodes": [
        {"id": "sticky-roi", "name": "ROI Overview", "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": [40, -180],
         "parameters": {"content": "## Photo Stager Webhook\n**Accepts:** POST /webhook/books/photo-stage with { imageUrls[], condition, conditionNotes, instructions }\n**Returns:** { metadata, listing, lookupSource }\n**Call via:** ScryVault n8n app API route", "width": 460, "height": 140, "color": 5}},
        {"id": "webhook", "name": "Photo Stage Request", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [260, 0],
         "webhookId": "books-photo-stage",
         "parameters": {"httpMethod": "POST", "path": "books/photo-stage", "responseMode": "lastNode", "options": {}}},
        {"id": "extract-body", "name": "Extract Body", "type": "n8n-nodes-base.set", "typeVersion": 3.4, "position": [480, 0],
         "parameters": {"mode": "manual", "duplicateItem": False,
          "assignments": {"assignments": [
              {"id": "b1", "name": "imageUrls", "value": "={{ $json.body.imageUrls || [] }}", "type": "array"},
              {"id": "b2", "name": "condition", "value": "={{ $json.body.condition || 'Good' }}", "type": "string"},
              {"id": "b3", "name": "conditionNotes", "value": "={{ $json.body.conditionNotes || '' }}", "type": "string"},
              {"id": "b4", "name": "instructions", "value": "={{ $json.body.instructions || '' }}", "type": "string"}
          ]}, "options": {}}},
        {"id": "call-sub", "name": "Call Photo Stager", "type": "n8n-nodes-base.executeWorkflow", "typeVersion": 1.2, "position": [700, 0],
         "parameters": {"workflowId": {"__rl": True, "value": SUB_ID, "mode": "id"},
          "workflowInputs": {"mappingMode": "defineBelow", "value": {}, "matchingColumns": [],
           "schema": [
               {"id": "s1", "displayName": "imageUrls", "type": "array", "defaultMatch": False, "display": True, "canBeUsedToMatch": True},
               {"id": "s2", "displayName": "condition", "type": "string", "defaultMatch": False, "display": True, "canBeUsedToMatch": True},
               {"id": "s3", "displayName": "conditionNotes", "type": "string", "defaultMatch": False, "display": True, "canBeUsedToMatch": True},
               {"id": "s4", "displayName": "instructions", "type": "string", "defaultMatch": False, "display": True, "canBeUsedToMatch": True}
           ], "attemptToConvertTypes": False, "convertFieldsToString": False},
          "options": {"waitForSubWorkflow": True}}},
        {"id": "return-result", "name": "Return Result", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [920, 0],
         "parameters": {"mode": "runOnceForAllItems", "jsCode": "return [{ json: { data: $input.first().json } }];"}}
    ],
    "connections": {
        "Photo Stage Request": {"main": [[{"node": "Extract Body", "type": "main", "index": 0}]]},
        "Extract Body": {"main": [[{"node": "Call Photo Stager", "type": "main", "index": 0}]]},
        "Call Photo Stager": {"main": [[{"node": "Return Result", "type": "main", "index": 0}]]}
    },
    "settings": {"executionOrder": "v1", "callerPolicy": "workflowsFromSameOwner"}
}

payload = json.dumps(workflow).encode('utf-8')
req = urllib.request.Request(f'{n8n_url}/workflows', data=payload,
    headers={'X-N8N-API-KEY': n8n_key, 'Content-Type': 'application/json'}, method='POST')
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    wf_id = data['id']
    print(f"Created UTIL_Photo_Stager_Webhook: {wf_id}")

req2 = urllib.request.Request(f'{n8n_url}/workflows/{wf_id}/activate', data=b'{}',
    headers={'X-N8N-API-KEY': n8n_key, 'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req2) as resp:
        print(f"Activated: {json.loads(resp.read().decode('utf-8')).get('active')}")
except Exception as e:
    print(f"Activation error: {e}")
```

Run it:
```bash
python3 C:/Users/MBC/scripts/create_photo_stager_webhook.py
```

Expected: Workflow created and activated. Record the ID in `photo_stager_ids.txt`.

- [ ] **Step 2: Test the webhook is registered**

```bash
curl -s -X POST "http://localhost:5678/webhook/books/photo-stage" \
  -H "Content-Type: application/json" \
  -d '{"imageUrls":[],"condition":"Good","conditionNotes":"","instructions":""}' \
  --max-time 30
```

Expected: A JSON response (likely with an error about empty imageUrls from Gemini, but NOT a 404 "webhook not registered" error). If 404, debug the webhook registration.

- [ ] **Step 3: Export and commit**

Create `C:/Users/MBC/scripts/export_photo_stager_webhook.py` modeled on the export script from Task 1, targeting the UTIL_Photo_Stager_Webhook workflow. Write to `C:/Users/MBC/Codebases/n8n-workflows/_shadow-library/service-modules/UTIL_Photo_Stager_Webhook.json`.

```bash
cd C:/Users/MBC/Codebases/n8n-workflows
git add _shadow-library/service-modules/UTIL_Photo_Stager_Webhook.json
git commit -m "feat: add UTIL_Photo_Stager_Webhook workflow export"
```

---

## Task 3: Test n8n Workflow with Real Photo

**Files:**
- None (test only)

- [ ] **Step 1: Upload a test photo to a public URL**

Use a Supabase Storage URL (since Gemini requires accessible URLs, not base64 in this approach -- actually wait, let's verify the Gemini call format).

Actually, reconsider: Gemini's `fileData.fileUri` requires a URL that Google can fetch. For local testing, we need Supabase public URLs. Skip this test for now and test through the full API flow in Task 6.

---

## Task 4: Create Photo Upload Helper (Frontend Library)

**Files:**
- Create: `src/lib/storage/upload-book-images.ts`
- Test: skip unit tests (pure browser-API wrapper; tested via integration in Task 6)

- [ ] **Step 1: Create the helper**

```typescript
// src/lib/storage/upload-book-images.ts
import { compressImage } from "./compress-image";

export interface UploadedPhoto {
  publicUrl: string;
  storagePath: string;
  order: number;
}

export interface UploadProgress {
  total: number;
  completed: number;
  currentFile: string;
}

export async function uploadBookPhotos(
  files: File[],
  tempItemId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadedPhoto[]> {
  const uploaded: UploadedPhoto[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.({ total: files.length, completed: i, currentFile: file.name });

    const compressed = await compressImage(file);
    const formData = new FormData();
    formData.append("file", compressed);
    formData.append("temp_item_id", tempItemId);
    formData.append("display_order", String(i));

    const res = await fetch("/api/images/upload-pre-item", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message || `Upload failed for ${file.name}`);
    }

    const json = await res.json();
    uploaded.push({
      publicUrl: json.data.public_url,
      storagePath: json.data.storage_path,
      order: i,
    });
  }

  onProgress?.({ total: files.length, completed: files.length, currentFile: "" });
  return uploaded;
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/MBC/Codebases/business-infrastructure/scryvault-n8n
git add src/lib/storage/upload-book-images.ts
git commit -m "feat: add uploadBookPhotos helper for batch pre-item uploads"
```

---

## Task 5: Create Pre-Item Upload API Route

**Files:**
- Create: `src/app/api/images/upload-pre-item/route.ts`

Photos need to be uploaded BEFORE the inventory_item exists because we need their URLs to send to Gemini. This route uploads to a temporary path `{userId}/{tempItemId}/{uuid}.jpg` and returns the public URL + storage path. No DB record is created (item_images rows get created later when the item is staged).

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/images/upload-pre-item/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { uploadBookImage } from "@/lib/storage/book-images";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
        { status: 401 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const tempItemId = formData.get("temp_item_id");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: { message: "File is required", code: "MISSING_FILE" } },
        { status: 400 },
      );
    }
    if (typeof tempItemId !== "string" || !tempItemId) {
      return NextResponse.json(
        { error: { message: "temp_item_id is required", code: "MISSING_TEMP_ID" } },
        { status: 400 },
      );
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: { message: "Unsupported image type. Use JPEG, PNG, or WebP.", code: "INVALID_TYPE" } },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: { message: "File too large (max 5MB)", code: "FILE_TOO_LARGE" } },
        { status: 400 },
      );
    }

    const result = await uploadBookImage(supabase, {
      userId: user.id,
      inventoryItemId: tempItemId,
      file,
    });

    return NextResponse.json({
      data: {
        public_url: result.publicUrl,
        storage_path: result.storagePath,
      },
    });
  } catch (error) {
    console.error("[UPLOAD_PRE_ITEM]", error);
    return NextResponse.json(
      { error: { message: "Upload failed", code: "UPLOAD_FAILED" } },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/images/upload-pre-item/route.ts
git commit -m "feat: add pre-item photo upload route"
```

---

## Task 6: Create Photo Stage API Route

**Files:**
- Create: `src/app/api/books/photo-stage/route.ts`

This route orchestrates the full flow: takes photo URLs + condition + notes, calls n8n to extract metadata + generate listing, creates books_catalog + inventory_items + item_images in one go, returns the created item.

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/books/photo-stage/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { callN8nWebhook, N8nWebhookError } from "@/lib/n8n/webhook";

interface PhotoStageInput {
  tempItemId: string;
  photos: Array<{ publicUrl: string; storagePath: string; order: number }>;
  condition: string;
  conditionNotes?: string;
  instructions?: string;
}

interface N8nResponse {
  data: {
    metadata: {
      title?: string;
      authors?: string;
      isbn?: string;
      isbn13?: string;
      publisher?: string;
      publishedDate?: string;
      edition?: string;
      printingNumber?: string;
      pages?: string;
      format?: string;
      coverUrl?: string;
    };
    listing: {
      seoTitle?: string;
      htmlDescription?: string;
      conditionSummary?: string;
    };
    lookupSource?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
        { status: 401 },
      );
    }

    const body: PhotoStageInput = await request.json();

    if (!body.photos || body.photos.length === 0) {
      return NextResponse.json(
        { error: { message: "At least one photo is required", code: "NO_PHOTOS" } },
        { status: 400 },
      );
    }
    if (!body.condition) {
      return NextResponse.json(
        { error: { message: "Condition is required", code: "NO_CONDITION" } },
        { status: 400 },
      );
    }
    if (!body.tempItemId) {
      return NextResponse.json(
        { error: { message: "tempItemId is required", code: "NO_TEMP_ID" } },
        { status: 400 },
      );
    }

    const n8nResult = await callN8nWebhook<N8nResponse>(
      "books/photo-stage",
      {
        imageUrls: body.photos.map(p => p.publicUrl),
        condition: body.condition,
        conditionNotes: body.conditionNotes || "",
        instructions: body.instructions || "",
      },
      { timeout: 90_000 },
    );

    const metadata = n8nResult.data.metadata || {};
    const listing = n8nResult.data.listing || {};

    const title = metadata.title || "";
    if (!title) {
      return NextResponse.json(
        {
          error: {
            message: "Couldn't identify the book from these photos. Add a title in the instructions field and try again.",
            code: "NO_TITLE",
          },
        },
        { status: 422 },
      );
    }

    const isbn = metadata.isbn13 || metadata.isbn || null;
    const authorsArray = metadata.authors
      ? metadata.authors.split(/,\s*/).filter(Boolean)
      : null;

    let catalogId: string | null = null;
    if (isbn) {
      const { data: existingBook } = await supabase
        .from("books_catalog")
        .select("id")
        .eq("user_id", user.id)
        .eq("isbn", isbn)
        .maybeSingle();
      if (existingBook) catalogId = existingBook.id;
    }

    if (!catalogId) {
      const { data: newBook, error: catalogError } = await supabase
        .from("books_catalog")
        .insert({
          user_id: user.id,
          isbn,
          title,
          authors: authorsArray,
          publisher: metadata.publisher || null,
          published_date: metadata.publishedDate || null,
          page_count: metadata.pages ? Number(metadata.pages) : null,
          cover_url: metadata.coverUrl || null,
          language: "en",
        })
        .select("id")
        .single();
      if (catalogError) throw catalogError;
      catalogId = newBook.id;
    }

    const { data: inventoryItem, error: invError } = await supabase
      .from("inventory_items")
      .insert({
        id: body.tempItemId,
        user_id: user.id,
        book_id: catalogId,
        condition: body.condition,
        condition_notes: body.conditionNotes || null,
        listing_title: listing.seoTitle || null,
        listing_description: listing.htmlDescription || null,
        listing_condition_notes: listing.conditionSummary || null,
        acquired_date: new Date().toISOString().split("T")[0],
        status: "staged",
      })
      .select("*")
      .single();
    if (invError) throw invError;

    const imageRows = body.photos.map((p, i) => ({
      user_id: user.id,
      inventory_item_id: inventoryItem.id,
      storage_path: p.storagePath,
      public_url: p.publicUrl,
      display_order: p.order,
      is_primary: i === 0,
    }));
    const { error: imagesError } = await supabase
      .from("item_images")
      .insert(imageRows);
    if (imagesError) throw imagesError;

    const { data: fullItem } = await supabase
      .from("inventory_items")
      .select("*, books_catalog(*), item_images(*), sources(name, type)")
      .eq("id", inventoryItem.id)
      .single();

    return NextResponse.json({ data: fullItem }, { status: 201 });
  } catch (error) {
    console.error("[PHOTO_STAGE]", error);
    if (error instanceof N8nWebhookError) {
      return NextResponse.json(
        { error: { message: `AI workflow error: ${error.message}`, code: "N8N_ERROR" } },
        { status: error.statusCode >= 500 ? 502 : error.statusCode },
      );
    }
    return NextResponse.json(
      { error: { message: "Failed to stage book", code: "STAGE_FAILED" } },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/books/photo-stage/route.ts
git commit -m "feat: add photo-stage API route for multi-photo AI intake"
```

---

## Task 7: Create PhotoIntakeForm Component

**Files:**
- Create: `src/components/features/photo-intake-form.tsx`

This is the new Photo + AI tab content. Drag-drop zone, thumbnail grid with reorder, condition dropdown, condition notes, instructions, stage button.

- [ ] **Step 1: Create the component**

```typescript
// src/components/features/photo-intake-form.tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ImagePlus, X, Loader2, Sparkles } from "lucide-react";
import { uploadBookPhotos } from "@/lib/storage/upload-book-images";

interface PhotoIntakeFormProps {
  onClose: () => void;
  onStaged: () => void;
}

interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

const CONDITIONS = ["Brand New", "Like New", "Very Good", "Good", "Acceptable"] as const;

function uuid(): string {
  return crypto.randomUUID();
}

function SortableThumb({ photo, onRemove }: { photo: PendingPhoto; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="relative aspect-square overflow-hidden rounded-lg bg-white/5 cursor-move">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
      <button type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(photo.id)}
        className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white hover:bg-danger">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function PhotoIntakeForm({ onClose, onStaged }: PhotoIntakeFormProps) {
  const router = useRouter();
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [condition, setCondition] = useState<typeof CONDITIONS[number]>("Good");
  const [conditionNotes, setConditionNotes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const newPhotos = Array.from(fileList)
      .filter(f => ["image/jpeg", "image/png", "image/webp"].includes(f.type))
      .map(f => ({ id: uuid(), file: f, previewUrl: URL.createObjectURL(f) }));
    setPhotos(prev => [...prev, ...newPhotos]);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  function handleRemove(id: string) {
    setPhotos(prev => {
      const target = prev.find(p => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPhotos(prev => {
        const oldIndex = prev.findIndex(p => p.id === active.id);
        const newIndex = prev.findIndex(p => p.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  async function handleStage() {
    if (photos.length === 0 || submitting) return;
    setSubmitting(true);
    setError("");
    setStatus("Uploading photos...");

    const tempItemId = uuid();

    try {
      const uploaded = await uploadBookPhotos(
        photos.map(p => p.file),
        tempItemId,
        (progress) => setStatus(`Uploading ${progress.completed + 1} of ${progress.total}...`),
      );

      setStatus("Analyzing photos and generating listing...");
      const res = await fetch("/api/books/photo-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempItemId,
          photos: uploaded,
          condition,
          conditionNotes,
          instructions,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Staging failed");
        setSubmitting(false);
        setStatus("");
        return;
      }
      onStaged();
      router.push(`/staging/${json.data.id}`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      setSubmitting(false);
      setStatus("");
    }
  }

  const canSubmit = photos.length > 0 && !submitting;

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
      />

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-12 text-sm transition-all ${
            dragOver
              ? "border-accent bg-accent/10 text-text-primary"
              : "border-white/20 bg-white/5 text-text-muted hover:border-accent/40 hover:bg-accent/5"
          }`}
        >
          <ImagePlus className="h-10 w-10 opacity-60" />
          <span className="font-medium">Drag photos here or click to browse</span>
          <span className="text-xs opacity-60">JPEG, PNG, or WebP</span>
        </button>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-3 transition-all ${
            dragOver ? "border-accent bg-accent/10" : "border-white/10"
          }`}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={photos.map(p => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {photos.map(photo => (
                  <SortableThumb key={photo.id} photo={photo} onRemove={handleRemove} />
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5 text-text-muted hover:border-accent/40 hover:bg-accent/5"
                >
                  <ImagePlus className="h-6 w-6" />
                </button>
              </div>
            </SortableContext>
          </DndContext>
          <p className="mt-2 text-xs text-text-muted">
            Drag thumbnails to reorder. First photo will be the primary listing image.
          </p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-muted">Condition</label>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as typeof CONDITIONS[number])}
          disabled={submitting}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-muted">Condition notes</label>
        <textarea
          value={conditionNotes}
          onChange={(e) => setConditionNotes(e.target.value)}
          disabled={submitting}
          rows={2}
          placeholder="Describe wear, markings, defects..."
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-muted">Additional instructions</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          disabled={submitting}
          rows={2}
          placeholder="e.g. Bundle of 3 books, first edition, give it an Aeldern Note, not a book..."
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent focus:outline-none"
        />
      </div>

      {status && (
        <div className="flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm text-accent">
          <Loader2 className="h-4 w-4 animate-spin" />
          {status}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Button onClick={handleStage} disabled={!canSubmit} loading={submitting} className="w-full">
        <Sparkles className="mr-2 h-4 w-4" />
        Stage Book
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/photo-intake-form.tsx
git commit -m "feat: add PhotoIntakeForm component with drag-drop and reorder"
```

---

## Task 8: Wire PhotoIntakeForm into AddBookModal

**Files:**
- Modify: `src/components/features/add-book-modal.tsx`

Replace the current "photo" mode in the modal with the new PhotoIntakeForm. Rename the tab label from "Photo Lookup" to "Photo + AI" and make it the default.

- [ ] **Step 1: Update add-book-modal.tsx**

```typescript
// Add import at top
import { PhotoIntakeForm } from "@/components/features/photo-intake-form";
import { Sparkles } from "lucide-react"; // if not already imported

// Change default mode and tab order:
// const [mode, setMode] = useState<"isbn" | "manual" | "photo">("isbn");
// BECOMES:
const [mode, setMode] = useState<"photo" | "isbn" | "manual">("photo");

// Reorder tab buttons in JSX: Photo + AI first, then ISBN Lookup, then Manual Entry
// Update Photo tab label and icon:
<button
  onClick={() => { setMode("photo"); setError(""); setLookupResult(null); }}
  className={`...`}
>
  <Sparkles className="mr-2 inline h-4 w-4" />
  Photo + AI
</button>

// Replace the entire photo mode JSX block (currently lines 276-380) with:
{mode === "photo" && (
  <PhotoIntakeForm onClose={handleClose} onStaged={onBookAdded} />
)}
```

Delete the old photo-related state (`photoSearching`, `photoPreview`, `fileInputRef` for photo, `handlePhotoLookup` function).

- [ ] **Step 2: Run type-check**

```bash
cd C:/Users/MBC/Codebases/business-infrastructure/scryvault-n8n
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/add-book-modal.tsx
git commit -m "feat: wire PhotoIntakeForm into AddBookModal as default tab"
```

---

## Task 9: End-to-End Test the Intake Flow

**Files:**
- None (manual test)

- [ ] **Step 1: Start the dev server**

```bash
# Kill anything on port 3000 first
netstat -ano | grep ":3000 " | grep LISTEN
# Kill PID if found: taskkill //F //PID <pid>
cd C:/Users/MBC/Codebases/business-infrastructure/scryvault-n8n
rm -f .next/dev/lock
npm run dev
```

Open http://localhost:3000/staging and click "Add Book."

- [ ] **Step 2: Test with a real book photo set**

Drag in 2-4 photos of a book (front cover, copyright page, spine). Select "Good" condition. Add condition notes: "light shelf wear." Leave instructions blank. Click "Stage Book."

Expected:
- Status updates: "Uploading 1 of 4..." → "Analyzing photos and generating listing..."
- Redirects to `/staging/<new-item-id>` within 10-30 seconds
- Detail page shows the book with extracted title, author, ISBN, publisher
- All uploaded photos appear in the Photos gallery with the first one marked Primary
- Listing Content section shows the generated SEO title and HTML description

- [ ] **Step 3: Test the failure case**

Try with an unrelated photo (e.g., a screenshot). Expected: error "Couldn't identify the book from these photos. Add a title in the instructions field and try again."

- [ ] **Step 4: Test the instructions override**

Try the same unrelated photo but in instructions type: "This is a bundle of 3 books: Title A, Title B, Title C by various authors." Expected: Gemini uses the instructions and creates a bundle listing.

- [ ] **Step 5: No commit needed for manual testing**

---

## Task 10: Add Drag-to-Reorder to ImageUploader

**Files:**
- Modify: `src/components/features/image-uploader.tsx`
- Modify: `src/app/api/images/[id]/route.ts` (add display_order PATCH support)

- [ ] **Step 1: Update PATCH /api/images/[id] to accept display_order**

Read the current file first:

```bash
cat src/app/api/images/[id]/route.ts
```

Add display_order handling to the existing PATCH handler. The existing handler only accepts `is_primary: true`. Add logic so that if `display_order` is a number, update it:

```typescript
// In the PATCH handler, after parsing body:
if (typeof body.display_order === "number") {
  const { data, error } = await supabase
    .from("item_images")
    .update({ display_order: body.display_order })
    .eq("id", imageId)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw error;
  return NextResponse.json({ data });
}

// ... existing is_primary logic below
```

- [ ] **Step 2: Add drag-to-reorder to ImageUploader**

Wrap the existing image grid in DndContext/SortableContext from @dnd-kit. When order changes, PATCH each affected image's display_order.

```typescript
// Add imports at top of image-uploader.tsx:
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Extract the single image rendering into a SortableImage component that uses useSortable({ id: img.id })
// Wrap the grid in DndContext/SortableContext
// On drag end: call arrayMove, then PATCH the display_order of each image that moved
```

Implementation details (replace the existing image grid block):

```typescript
function SortableImage({ img, uploading, busyImageId, onSetPrimary, onDelete }: {
  img: ItemImage;
  uploading: boolean;
  busyImageId: string | null;
  onSetPrimary: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: img.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="group relative aspect-square overflow-hidden rounded-lg bg-white/5">
      <div {...attributes} {...listeners} className="absolute inset-0 cursor-move" />
      <Image src={img.public_url} alt={`Photo ${img.display_order + 1}`} fill sizes="..." className="object-cover pointer-events-none" />
      {/* existing overlay with set-primary and delete buttons, add onPointerDown={e => e.stopPropagation()} to each button */}
    </div>
  );
}

// In the main component, add sensors and drag end handler:
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);

async function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const oldIndex = images.findIndex(i => i.id === active.id);
  const newIndex = images.findIndex(i => i.id === over.id);
  const reordered = arrayMove(images, oldIndex, newIndex).map((img, i) => ({ ...img, display_order: i }));
  onImagesChange(reordered);
  await Promise.all(
    reordered.map(img =>
      fetch(`/api/images/${img.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_order: img.display_order }),
      })
    ),
  );
}

// Wrap the grid:
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={images.map(i => i.id)} strategy={rectSortingStrategy}>
    {/* grid map */}
  </SortableContext>
</DndContext>
```

- [ ] **Step 3: Add drag-drop upload to ImageUploader**

Add drop zone handler on the wrapper div:

```typescript
const [dragOver, setDragOver] = useState(false);

async function handleDrop(e: React.DragEvent) {
  e.preventDefault();
  setDragOver(false);
  if (!e.dataTransfer.files?.length) return;
  // Call the existing upload logic with the dropped files
  const fileList = e.dataTransfer.files;
  // Create a fake event object to reuse handleFileSelect
  const fakeEvent = { target: { files: fileList, value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>;
  await handleFileSelect(fakeEvent);
}

// Wrap the existing grid/empty-state with onDragOver/onDragLeave/onDrop
```

- [ ] **Step 4: Run type-check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Manual test**

Open a staged item's detail page. Drag files from the file explorer onto the photo grid. Expected: photos upload. Drag an uploaded photo to reorder. Expected: order persists after page refresh.

- [ ] **Step 6: Commit**

```bash
git add src/components/features/image-uploader.tsx src/app/api/images/[id]/route.ts
git commit -m "feat: add drag-drop upload and drag-to-reorder to ImageUploader"
```

---

## Task 11: Fix Cover Image Display on Detail Page

**Files:**
- Modify: `src/app/(dashboard)/staging/[id]/page.tsx`

The detail page's Book Details section currently displays the primary item_image as the cover. When Open Library provided a cover_url on the books_catalog record, prefer that instead (it's the actual book cover, not a photo of the copyright page).

- [ ] **Step 1: Find the cover image reference in the detail page**

```bash
grep -n "cover_url\|coverUrl\|BookCover" src/app/\(dashboard\)/staging/\[id\]/page.tsx
```

- [ ] **Step 2: Update the Book Details cover img src**

Change from: (wherever it displays `item_images[0].public_url` in the Book Details card)
To: `item.books_catalog?.cover_url || item.item_images?.find(i => i.is_primary)?.public_url || item.item_images?.[0]?.public_url`

This prefers Open Library's cover, falls back to the user's primary photo, falls back to the first photo.

- [ ] **Step 3: Run type-check and manual test**

```bash
npx tsc --noEmit
```

Open a staged item with an ISBN and verify the cover image shows Open Library's cover, not the copyright page photo.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/staging/\[id\]/page.tsx
git commit -m "fix: prefer Open Library cover_url for Book Details display"
```

---

## Task 12: Remove Old Photo Lookup Route and Helpers

**Files:**
- Delete: `src/app/api/books/photo-lookup/route.ts`
- Delete: old photo-lookup-related code from `src/components/features/add-book-modal.tsx` (if any remains)

- [ ] **Step 1: Verify nothing else imports the old route**

```bash
grep -r "books/photo-lookup" src/ --include="*.ts" --include="*.tsx"
```

Expected: no results (or only this file itself).

- [ ] **Step 2: Delete the old route**

```bash
rm src/app/api/books/photo-lookup/route.ts
```

- [ ] **Step 3: Delete old n8n workflow (UTIL_Photo_Lookup_Webhook)**

```python
# C:/Users/MBC/scripts/delete_old_photo_lookup.py
import urllib.request, os
n8n_key = os.environ['N8N_API_KEY']
n8n_url = os.environ['N8N_API_URL']
wf_id = 'AfibhJp7MP0PQUWL'  # UTIL_Photo_Lookup_Webhook
req = urllib.request.Request(f'{n8n_url}/workflows/{wf_id}', headers={'X-N8N-API-KEY': n8n_key}, method='DELETE')
try:
    with urllib.request.urlopen(req) as resp:
        print('Deleted')
except Exception as e:
    print(f'Error: {e}')
```

Run it. Expected: "Deleted" or confirmation.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old photo-lookup route and workflow (superseded by photo-stage)"
```

---

## Self-Review Notes

**Spec coverage:**
- Photo drop zone with drag-drop → Task 7
- Condition dropdown (Brand New/Like New/Very Good/Good/Acceptable) → Task 7
- Condition notes → Task 7
- Additional instructions (escape hatch for bundles, non-books) → Task 7
- Stage Book button → Task 7
- Photos uploaded before records created → Tasks 4, 5
- Gemini Vision with Aeldern Tomes template → Task 1
- Open Library enrichment → Task 1 (Merge Results node)
- Creates books_catalog + inventory_items + item_images → Task 6
- Redirects to detail page pre-filled → Task 7 (router.push)
- Drag-to-reorder in ImageUploader → Task 10
- Drag-to-upload in ImageUploader → Task 10
- Cover image prefers books_catalog.cover_url → Task 11
- ISBN Lookup and Manual Entry tabs kept as fallbacks → Task 8 (reorder only, not modified)
- Instructions field handles bundles/non-books → handled by system prompt in Task 1

**Known risks:**
- Gemini 2.5 Flash Vision requires publicly accessible URLs for `fileData.fileUri`. Supabase Storage public URLs work. If Supabase bucket has RLS issues, switch to inlineData with base64 (fallback).
- The Aeldern Tomes template is long; may need iteration on the prompt after first tests.
- Open Library coverage is incomplete; some ISBNs won't return data. Best-effort by design.
