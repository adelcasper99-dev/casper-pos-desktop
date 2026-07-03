---
status: active
type: feat
created: 2026-07-02
deepened: 2026-07-02
---

# Sync-Aware Master Data (Models & Categories)

Casper ERP uses an Offline-First architecture. We are decoupling product names into 'Model' and 'Category' Master Data. Creating these entities offline creates a massive risk of UUID collisions, duplicate entries upon sync, and complex merge scenarios. The implementation MUST prioritize Sync Integrity, Data Normalization, and Performant Async Fetching.

## Source Document
Provided by Principal Distributed Systems Architect via prompt payload, and hardened via Ironclad Review.

## Scope & Success Criteria
- Implement strict normalization (Title Case, trim spaces, collapse multiple spaces) for Master Data strings.
- Sync engine must resolve offline creation collisions using an `ID_OVERRIDE` strategy.
- Support Master Data merge via a `MERGE_MASTER_DATA` global sync event and a `MasterDataTombstone` for race condition mitigation.
- Async performant fetching of master data on frontend via `AsyncCreatableSelect` with visual differentiation for new items.
- Safe data migration backfill for existing items.

## Key Decisions (Architectural)
- **ID_OVERRIDE Strategy:** The Cloud is the ultimate Source of Truth for Master Data IDs. Local nodes must yield and override their local UUIDs upon conflict.
- **Dependency Sorting in Sync:** The sync engine payload processing must guarantee Master Data events (Models/Categories) are processed *before* transactional events (like PurchaseInvoice) so overrides happen safely.
- **Same-Payload Translation Map:** The Cloud Sync Receiver must maintain an in-memory `translationMap` during a sync loop to translate IDs on the fly for subsequent records in the same payload.
- **Master Data Tombstone:** To prevent Ghost ID race conditions when merges happen in the cloud before offline nodes sync, a Tombstone table will auto-translate hard-deleted IDs in incoming payloads.
- **Normalization over DB Collation:** Never trust case-insensitive DB collation for deduplication across distributed nodes; ALWAYS use the application-level normalization utility before the DB layer.

## Implementation Units

- [ ] **Unit 1: Schema Updates & Normalization Pipeline**
  - Add `MasterDataTombstone` table to `schema.prisma` (`fromId`, `toId`, `entityType`).
  - Create `normalizeMasterDataName` utility in `src/shared/utils/string.ts`.
  - Rules: trim leading/trailing, replace double spaces, Capitalize first letter of each word (Title Case).
  - Apply this utility to all `Category` and `Model` creation paths (`findOrCreate`).

- [ ] **Unit 2: Sync Engine Conflict Resolution (ID_OVERRIDE)**
  - Update Cloud Sync Receiver to intercept `Model` and `Category` creation payloads.
  - Check existence by `normalizedName` in Cloud Postgres.
  - If the name exists but with a different UUID, reject insert, log `ID_OVERRIDE` in response, and add `[LocalID -> CloudID]` to a payload-scoped in-memory `translationMap`.
  - Pass all foreign keys of subsequent records in the same payload through this `translationMap` to mutate them before insertion.
  - Update Local Sync Client to listen for `ID_OVERRIDE`. It must execute raw SQL `UPDATE`s on child tables (e.g., `Product`) FIRST, then update the parent `Model` table, avoiding SQLite constraint locks.

- [ ] **Unit 3: Distributed Merge Operation & Tombstone**
  - Create an Admin API `/api/admin/master-data/merge` to merge Model A into Model B.
  - Cloud execution: Update all foreign keys (Products, Purchases, Tickets) from Model A to Model B, log `A -> B` to `MasterDataTombstone`, then hard-delete Model A.
  - Emit a global `MERGE_MASTER_DATA` Sync Event to all offline branches.
  - In Cloud Sync Receiver, add a check: if a payload references a missing `modelId`, query the `MasterDataTombstone` and auto-translate it to prevent race-condition crashes (Ghost IDs).
  - Add listener in the Local Sync Client to execute the identical cascade update and delete in local SQLite.

- [ ] **Unit 4: Performance Async Fetching & UI Enhancements**
  - Create `/api/models?search=query` and `/api/categories?search=query` GET endpoints. *Normalize the incoming query* on the backend before fuzzy matching.
  - Implement a reusable `react-select/async-creatable` wrapper component in the frontend.
  - Render a prominent `(New)` badge next to the "Create [Model Name]" option in the dropdown.
  - Replace static dropdowns in Add Product and Purchase Invoice with the new component (300ms debounce).
  - Add Try/Catch around offline DB creation to show a human-readable toast if local storage is full.

- [ ] **Unit 5: Safe Data Migration (Backfill)**
  - Write a one-off script `scripts/backfill-master-data.ts`.
  - Extract distinct model names from existing Products.
  - Run them through `normalizeMasterDataName()`.
  - Insert into `Model` table, and backfill the `modelId` on existing products.
  - Ensure these initial UUIDs are seeded in Cloud Postgres and trigger a pull to Local SQLite databases during the next sync cycle.

## Open Questions / Verification

> [!WARNING]
> **Active Offline Branches**
> Are there any active Offline branches with unsynced data containing plain-text models right now? We must ensure all branches force-sync BEFORE we run the Unit 5 migration script in Production. Otherwise, old unsynced strings might recreate orphans when they finally sync.

## Testing Checklist
- [ ] Unit: `normalizeMasterDataName` with edge cases (" iphone   17 ", "IPHONE 17", "   ").
- [ ] Integration: Sync Engine same-payload translation (create Model + Product offline, assert Cloud uses Cloud UUID).
- [ ] Integration: Ghost ID scenario (merge Model A->B online, sync offline Product referencing A, assert it saves with B).
- [ ] Edge case: Local SQLite `ID_OVERRIDE` on a Model that has 5 associated Products (assert no FK crash).
