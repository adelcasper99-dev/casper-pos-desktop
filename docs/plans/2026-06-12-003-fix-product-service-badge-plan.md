---
title: "fix: Product Service Badge — Mapping trackStock to Frontend"
status: active
created: 2026-06-12
sequence: 2026-06-12-003
type: fix
origin: user-bug-report
---

# fix: Product Service Badge

## Problem Frame

In the inventory management page (`/inventory`) and purchasing page (`/purchasing`), physical products that have stock tracking enabled (e.g., `trackStock: true`) are incorrectly rendered with the "خدمة" (service) badge and the infinity icon `(∞)` instead of their actual numerical stock level.

This happens because the initial server-side queries map the `Product` database objects to client-friendly objects but omit the `trackStock`, `isBundle`, and `itemType` fields. On initial page load (before queries refetch), these fields are `undefined`, causing the frontend rendering logic (`p.trackStock ?` in `ProductsTab.tsx`) to fall back to the service badge. Furthermore, when editing a product, the "Track Stock" toggle appears unchecked by default due to this missing field, creating a data-override hazard on save.

---

## Scope

**In scope:**
- Include `trackStock`, `isBundle`, and `itemType` in the initial server-side mapped product lists for both inventory and purchasing page routes.

**Out of scope:**
- Modifying database schemas.
- Changing POS page product mapping (which already properly maps `trackStock` and `isBundle`).

---

## Gap Analysis

| Finding | Risk if Skipped | Priority | Closure Measure |
|---------|----------------|----------|-----------------|
| `trackStock` missing in SSR inventory product mapping | Physical products display as services on load; edit modal defaults toggle to unchecked, risking accidental deactivation of stock tracking on save | P0 | Add `trackStock: p.trackStock` to `src/app/(routes)/inventory/page.tsx` mapping |
| `isBundle` missing in SSR inventory product mapping | Bundles aren't correctly identified on initial server render | P1 | Add `isBundle: p.isBundle` to `src/app/(routes)/inventory/page.tsx` mapping |
| `itemType` missing in SSR inventory product mapping | Product types are incomplete in client components | P2 | Add `itemType: p.itemType` to `src/app/(routes)/inventory/page.tsx` mapping |
| `trackStock`/`isBundle`/`itemType` missing in purchasing mapping | Search dropdowns or lists in purchasing might not identify services/bundles correctly | P1 | Add same mappings to `src/app/(routes)/purchasing/page.tsx` mapping |

---

## Risks

| Risk | Likelihood | Impact | Resolved? | Mitigation |
|------|------------|--------|-----------|------------|
| Type definition mismatch in mapped client objects | Low | Medium | ✅ Resolved | Checked with `npx tsc --noEmit`. Next.js routes and component props are typed flexibly enough to accept these fields without compilation errors. |
| Overwriting custom user changes to products | Low | High | ✅ Resolved | Adding `trackStock` to the mapped object ensures the edit modal populates the correct current state from the database, preventing accidental de-activation on save. |

---

## UI/UX Considerations

1. **State Preservation in Modals:** When opening the Edit Product modal for a physical product, the "Track Stock" checkbox is now correctly checked, preventing the user from accidentally turning off stock tracking and breaking inventory integrity when they save unrelated changes (like category or model).
2. **Accurate Stock Status:** Physical products display their numerical stock level (e.g., `1` or `15.000`) instead of the blue "خدمة (∞)" badge on page load, eliminating cashier/manager confusion between actual services (labor/repairs) and physical inventoried assets.
3. **Zebra Table Alignment:** Re-mapping these values preserves the exact structure of the columns, ensuring no layout shifts or empty columns.

---

## Proposed Changes

### Routes

#### [MODIFY] [page.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/page.tsx)
- Map `trackStock: p.trackStock`, `isBundle: p.isBundle`, and `itemType: p.itemType` in the initial product list mapping.

#### [MODIFY] [page.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/purchasing/page.tsx)
- Map `trackStock: p.trackStock`, `isBundle: p.isBundle`, and `itemType: p.itemType` in the initial product list mapping.

---

## Implementation Units

### Unit 1 — Map trackStock, isBundle, and itemType in Inventory Page
**File:** `src/app/(routes)/inventory/page.tsx`
- [x] Add `trackStock: p.trackStock`, `isBundle: p.isBundle`, and `itemType: p.itemType` to the `products` mapping array inside `InventoryPage`.

### Unit 2 — Map trackStock, isBundle, and itemType in Purchasing Page
**File:** `src/app/(routes)/purchasing/page.tsx`
- [x] Add `trackStock: p.trackStock`, `isBundle: p.isBundle`, and `itemType: p.itemType` to the `products` mapping array inside `PurchasingPage`.

---

## Workflow

### Sequencing
```
PRE-FLIGHT:
  Verify baseline error count using `npx tsc --noEmit`.

PHASE 1 — Server Page Mapping Update:
  Unit 1: Update src/app/(routes)/inventory/page.tsx
  Unit 2: Update src/app/(routes)/purchasing/page.tsx

POST-FLIGHT:
  Run `npx tsc --noEmit` to confirm no regressions.
  Perform manual validation of the inventory layout and edit modal.
```

---

## Test Scenarios

### Client Component Data Completeness
- Verify that `trackStock` is true for physical products on initial server-side load and false for service items.
- Verify that the edit product modal correctly checks the "Track Stock" toggle on initial open without manual refetch.

---

## Verification Plan

### Automated Tests
- Run TypeScript compiler:
  ```powershell
  npx tsc --noEmit
  ```

### Manual Verification
1. Open the Inventory page (`/inventory`).
2. Verify that physical products (like "jojoj - kpk - lk", SKU C-01) display their numerical stock level (e.g. `1` or `1.00`) instead of the blue "خدمة" badge.
3. Verify that the "Track Stock" toggle in the Edit Modal for that product is checked.

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Omitted critical stock-tracking fields in page mappings | 2 routes | 0 routes |
| Correct rendering of physical stock on load | 0% | 100% |
| Edit Modal trackStock status consistency | Incorrect | 100% Correct |

---

## Estimated Success Ratio

| Category | Confidence | Rationale / Mitigation |
|----------|------------|------------------------|
| Correct frontend rendering | 100% | Directly leverages `p.trackStock` rendering block in ProductsTab.tsx |
| Modal state integrity | 100% | Populated automatically on initial edit state |
| Type safety compilation | 100% | Validated via TypeScript tsc with zero errors |
| **Overall** | **100%** | Straightforward, zero-dependency data-flow fix |
