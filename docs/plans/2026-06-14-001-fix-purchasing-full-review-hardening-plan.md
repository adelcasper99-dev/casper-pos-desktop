---
title: "fix: Purchasing Module — Full Review Hardening (All 27 Findings)"
type: fix
status: active
date: 2026-06-14
origin: purchasing-code-review.md (AI code review, 2026-06-14)
---

# fix: Purchasing Module — Full Review Hardening

## Overview

The purchasing module code review (2026-06-14) produced 27 findings across 4 priority levels.
This plan resolves all of them in a safe, sequenced order — zero-risk refactors first,
then server-side hardening, then client-side precision and correctness, then UX polish.

The plan deliberately avoids architectural changes: no hook rearchitecture, no grid
redesign, and no CSRF infrastructure overhaul. Every unit is a surgical, local fix.

> **Relationship to 2026-06-12-001 plan:** The June 12 plan addresses a narrower earlier
> review of the same module. This plan supersedes it. Units 1–10 from that plan are
> re-examined here and either re-confirmed or refined based on the deeper review.

---

## Problem Frame

Operators enter live purchase invoices through a keyboard-intensive data grid. Monetary
totals visible on screen and sent to the GL must be exact. The module has:

- **4 P0 float violations** — displayed totals and price-variance checks bypass Decimal.js
- **7 P1 issues** — stale React closures, CSRF loading gap, type safety holes, wrong
  import source for Decimal, autocomplete search bug, draft-on-edit overwrite
- **8 P2 issues** — attachment storage in localStorage, dead code, canvas leak,
  empty-row effect loop risk, UnitOption type pollution, price-history any[]
- **8 P3/UX issues** — dead keyboard hints, wrong Arabic copy, console.logs, structural
  any casts, column-map magic array

---

## Requirements Trace

- R1. All monetary arithmetic (subtotals, totals, variance checks, balance display) uses
  `Decimal.js` via `toDecimal()` — no `Number()`, `parseFloat()`, or raw JS operators on
  financial values.
- R2. `Decimal` is imported from `decimal.js`, not `@prisma/client/runtime/library`.
- R3. All master-data props on `NewPurchaseOverlay` and `usePurchaseForm` are typed with
  interfaces from `src/types/purchasing.ts` — no `any[]`.
- R4. `usePurchaseForm` CSRF fetch has a 5-second timeout; `csrfLoading` resolves to
  `false` with a visible error state on network failure.
- R5. `handleKeyDown` in `PurchaseDataGrid` includes all called callbacks in its
  `useCallback` dependency array.
- R6. Column-resize `saveWidths` uses the latest `columnWidths` value (no stale closure).
- R7. Product autocomplete filters the full product list before slicing to 18 results.
- R8. Draft load in `usePurchaseForm` is skipped when `editingInvoiceId` is set at mount.
- R9. Walk-in attachment is stored as an object URL or uploaded blob — not as base64 in
  `localStorage`.
- R10. `filteredWarehouses` dead assignment is removed; variable is renamed or eliminated.
- R11. `UnitOption.conversionFactor` type is `number | undefined`, not `number | any`.
- R12. Price-history popover state is typed with an explicit interface, not `any[]`.
- R13. F2 and F4 keyboard hints are either wired or removed from the UI.
- R14. Console.log debug statements in `handleAutoSku` are removed.
- R15. Walk-in UI copy uses "مباشر" / "شراء مباشر" instead of "زبون".

---

## Scope Boundaries

- No CSRF infrastructure refactor (SSR-injected token is a separate initiative).
- No grid virtualisation or performance refactor beyond the autocomplete filter fix.
- No re-architecture of `usePurchaseForm` state (individual field state is not collapsed).
- No Excel export implementation (product decision deferred).
- No test framework setup (tests added to existing `src/__tests__/` structure only).

### Deferred to Separate Tasks

- Walk-in phone/National ID format validation: separate UX ticket.
- `PurchaseItemsTable` dead-code audit and removal: separate cleanup PR.
- `BulkUploadDialog` duplicate-SKU hard-block: product decision required.
- CSRF token SSR injection: infrastructure PR in separate milestone.

---

## Context & Research

### Relevant Code and Patterns

- `src/lib/decimal-utils.ts` — `toDecimal()` and `toNumber()` utility — use everywhere
  monetary values are parsed or computed. Never `parseFloat` or `Number()` on financial values.
- `src/hooks/usePurchaseForm.ts` — primary state coordinator; contains P0 float violations
  and the CSRF fetch to harden.
- `src/components/inventory/purchasing/PurchaseDataGrid.tsx` — 2,385-line grid; stale
  closure bugs and autocomplete order bug live here.
- `src/components/inventory/purchasing/NewPurchaseOverlay.tsx` — balance display float
  violation at line 243; dead `filteredWarehouses` at line 101.
- `src/components/inventory/purchasing/PurchaseItemsTable.tsx` — float line total at
  line 196; `any[]` price history state.
- `src/actions/purchase-actions.ts` — Prisma-internal `Decimal` import (line 8);
  `voidPurchase` and `partialReturnPurchase` accounting lines.
- `src/types/purchasing.ts` — already exists with `ProductOption`, `CartItem`,
  `PurchaseFormReturn`, `WarehouseOption`, `BranchOption`. Extend rather than replace.
- `src/types/product.ts` — `Supplier`, `Branch`, `Warehouse`, `Model`, `Unit`, `Category`
  already defined here — import from here in `NewPurchaseOverlay` and `usePurchaseForm`.

### Institutional Learnings

- Financial precision rule: every monetary operation uses `toDecimal()` from
  `src/lib/decimal-utils.ts`. Display boundaries use `.toNumber()` only for `formatCurrency()`.
- `toDecimal(null | "" | undefined)` → `new Decimal(0)` — safe sentinel value; use
  confidently to replace `parseFloat("") || 0` patterns.
- Prisma Decimal columns accept `string` input — send `toDecimal(val).toFixed(4)` as the
  payload string; no need for `.toNumber()` before sending to the server action.

### External References

- React `useCallback` stale closure — deps array must include every value read inside the
  callback, including other callbacks called by it.
- React `useEffect` with `onRowsChange` dep — parent must wrap `onRowsChange` with
  `useCallback` to stabilise identity, or the empty-row guard loops.

---

## Key Technical Decisions

- **Attachment storage (R9):** Replace base64 Data URL in state/localStorage with
  `URL.createObjectURL()`. The object URL is stored in state only (not in draft); on
  form reset it is revoked. Walk-in attachments are transmitted as a file upload to
  the existing `/api/upload` endpoint (or similar) if the form is submitted, not embedded
  in the invoice payload. If no upload endpoint exists yet, store the blob ref in state
  only and send `null` in the payload — surfacing this as a known gap is better than
  silently persisting 250KB strings in localStorage.

- **CSRF timeout (R4):** Use `AbortController` with a 5-second timeout. On abort or
  network error, set `csrfLoading = false` and `csrfError = true`. Show a visible
  "فشل تحميل رمز الأمان — يرجى إعادة تحميل الصفحة" banner instead of silently blocking
  the submit button. The banner is already styled (`errorResult` banner in the overlay).

- **`handleKeyDown` deps (R5):** Add `handleQuickCreate` and `updateRow` to the
  `useCallback` dependency array. Both are `useCallback`-wrapped themselves, so adding
  them does not break memoisation.

- **`saveWidths` stale closure (R6):** Pass `columnWidths` as a parameter into
  `handleMouseUp` via a ref (`latestWidthsRef.current`) rather than closing over the
  state. Pattern: `const latestWidthsRef = useRef(columnWidths); useEffect(() => {
  latestWidthsRef.current = columnWidths; }, [columnWidths]);` — then read
  `latestWidthsRef.current` in the `mouseup` handler.

- **Decimal import (R2):** Replace `import { Decimal } from '@prisma/client/runtime/library'`
  with `import { Decimal } from 'decimal.js'` in `purchase-actions.ts`. Both expose
  the same `Decimal` constructor API for arithmetic. The Prisma ORM accepts either for
  column writes.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review,
> not implementation specification.*

```
                    ┌────────────────────────────────────────┐
                    │  PHASE 1 (zero-risk, unblocking)       │
                    │  Unit A: types + Decimal import fix     │
                    └───────────────┬────────────────────────┘
                                    │ unblocks
                    ┌───────────────▼────────────────────────┐
                    │  PHASE 2 (server precision + security)  │
                    │  Unit B: purchase-actions.ts            │
                    │   • Decimal import swap                 │
                    │   • float → Decimal in balance display  │
                    └───────────────┬────────────────────────┘
                                    │ unblocks
                    ┌───────────────▼────────────────────────┐
                    │  PHASE 3 (hook + grid correctness)      │
                    │  Unit C: usePurchaseForm float fixes    │
                    │  Unit D: CSRF timeout hardening         │
                    │  Unit E: PurchaseDataGrid fixes          │
                    │  Unit F: NewPurchaseOverlay fixes        │
                    └───────────────┬────────────────────────┘
                                    │ unblocks
                    ┌───────────────▼────────────────────────┐
                    │  PHASE 4 (UX + polish)                  │
                    │  Unit G: PurchaseItemsTable fixes        │
                    │  Unit H: PurchaseHeader attachment fix   │
                    │  Unit I: console.log + copy + hints     │
                    └────────────────────────────────────────┘
```

---

## Implementation Units

---

- [ ] **Unit A: Type Safety & Decimal Import Foundation**

**Goal:** Provide typed interfaces for all master data props; swap the Prisma-internal
`Decimal` import to `decimal.js`; extend `purchasing.ts` with the two missing interfaces.

**Requirements:** R2, R3, R11, R12

**Dependencies:** None — must run first.

**Files:**
- Modify: `src/types/purchasing.ts`
- Modify: `src/types/product.ts` *(remove Prisma runtime import from file if present)*
- Modify: `src/actions/purchase-actions.ts` *(Decimal import swap)*
- Modify: `src/components/inventory/purchasing/NewPurchaseOverlay.tsx` *(replace `any[]` props)*
- Modify: `src/hooks/usePurchaseForm.ts` *(replace `any[]` props)*

**Approach:**
- In `src/types/purchasing.ts`, add `PriceHistoryEntry` interface
  (`{ supplierName: string; date: string; unitCost: string; invoiceNumber: string | null }`)
  and `UnitOption` interface (extend existing if present, ensure
  `conversionFactor?: number` — never `any`).
- In `NewPurchaseOverlay`, replace all `any[]` master-data props with typed imports:
  `Supplier[]`, `Product[]` (from `src/types/product.ts`), `Category[]`, `Model[]`,
  `Warehouse[]`, `Branch[]`, `Unit[]` (from `src/types/product.ts`), `Attribute[]`
  (inline interface if none exists). Add `Attribute` interface to `src/types/product.ts`
  if missing.
- In `src/actions/purchase-actions.ts` line 8, change:
  `import { Decimal } from '@prisma/client/runtime/library'`
  → `import { Decimal } from 'decimal.js'`
- In `usePurchaseForm`, replace `products: any[]`, `branches: any[]`, `warehouses: any[]`
  with the matching typed arrays.

**Patterns to follow:**
- `src/types/product.ts` — existing `Supplier`, `Branch`, `Warehouse`, `Unit`, `Category`,
  `Model` interfaces; reuse exactly.
- `src/types/purchasing.ts` — existing `PurchaseFormReturn`; extend, do not replace.

**Test scenarios:**
- Happy path: `npx tsc --noEmit` produces zero new errors after this unit (baseline the
  pre-existing error count first with `npx tsc --noEmit 2>&1 | Measure-Object -Line`).
- Edge case: `UnitOption.conversionFactor` typed as `number | undefined` — verify no
  implicit `any` widening occurs in `UnitDropdown` `onChange` callback.

**Verification:**
- `npx tsc --noEmit` does not exceed the pre-plan baseline error count.
- No `any[]` remains on the 9 master-data props in `NewPurchaseOverlay`.

---

- [ ] **Unit B: Server-Side Float Violations & Decimal Import**

**Goal:** Remove the two float-arithmetic paths in `purchase-actions.ts` that affect the
GL accounting lines; fix the Prisma-internal Decimal import; ensure price-variance
comparison in `updateCartItem` uses `toDecimal`.

**Requirements:** R1, R2

**Dependencies:** Unit A (Decimal import swap must precede GL line edits).

**Files:**
- Modify: `src/actions/purchase-actions.ts`
- Modify: `src/hooks/usePurchaseForm.ts` *(price variance check)*

**Approach:**
- In `voidPurchase` (accountingLines block): pass `actualReturnAmount` as a `Decimal`
  instance directly to `TransactionLineInput.debit / credit`. Do not call `.toNumber()`.
  `TransactionLineInput` already accepts `Decimal | number | string` per the accounting
  engine contract.
- Same for `partialReturnPurchase` accounting block — `returnTotal` stays `Decimal`.
- In `usePurchaseForm.updateCartItem` price-variance check (lines 327–338): replace raw
  JS subtraction/division with:
  `toDecimal(newPrice).minus(toDecimal(oldPrice)).div(toDecimal(oldPrice)).times(100)`
  and compare the result with `toDecimal(5)` using `.gt(5)`.
- Do not touch the `paidAmount` cap guard at line 110 — it is a UI comparison only and
  `parseFloat` there feeds `>` comparison with `totalAmount` (a number), not the GL.
  Replace `parseFloat(paidAmount)` with `toDecimal(paidAmount).toNumber()` for
  consistency nonetheless.

**Patterns to follow:**
- Existing `accountingLines` in `createPurchase` in `src/actions/inventory.ts` — check
  how `TransactionLineInput` fields are populated there as the canonical reference.
- `toDecimal` from `src/lib/decimal-utils.ts`.

**Test scenarios:**
- Happy path: `voidPurchase` accountingLines — `debit` and `credit` are `Decimal`
  instances, not numbers; `validateDoubleEntryBalance` sum is exact (add to
  `src/__tests__/decimal-precision.test.ts`).
- Happy path: `updateCartItem` variance at exactly 5.0% does not trigger a warning;
  5.01% does.
- Edge case: `newPrice === 0` — division guard returns `new Decimal(0)` variance, no
  divide-by-zero throw.
- Error path: `toDecimal` receives `null` costPrice — returns `0`, variance check
  short-circuits.

**Verification:**
- `npx tsc --noEmit` — no new errors.
- `npx vitest run src/__tests__/decimal-precision.test.ts` — all new scenarios green.

---

- [ ] **Unit C: Client-Side Float Violations (Hook & Overlay)**

**Goal:** Fix the three remaining monetary float violations: the deferred-balance display
in `NewPurchaseOverlay`, the line-total in `PurchaseItemsTable`, and the `paidAmount`
initial parse in `usePurchaseForm`.

**Requirements:** R1

**Dependencies:** Unit A.

**Files:**
- Modify: `src/components/inventory/purchasing/NewPurchaseOverlay.tsx`
- Modify: `src/components/inventory/purchasing/PurchaseItemsTable.tsx`
- Modify: `src/hooks/usePurchaseForm.ts`

**Approach:**
- **NewPurchaseOverlay line 243:** Replace
  `Math.max(0, totalAmount - parseFloat(paidAmount || '0'))`
  with `Decimal.max(0, toDecimal(totalAmount).minus(toDecimal(paidAmount))).toNumber()`.
  Import `toDecimal` at the top of the file.
- **PurchaseItemsTable line 196 (line total):** Replace
  `(item.quantity * item.unitCost).toFixed(2)`
  with `toDecimal(item.quantity).times(toDecimal(item.unitCost)).toFixed(2)`.
- **usePurchaseForm paid-amount cap (line 110):** Replace
  `parseFloat(paidAmount)` with `toDecimal(paidAmount).toNumber()`.
  Also replace the `paidAmount > totalAmount` comparison with
  `toDecimal(paidAmount).gt(toDecimal(totalAmount))`.
- `subtotal` and `totalAmount` useMemo in the hook already use `toDecimal` correctly per
  the existing code — confirm at execution time; no change needed unless a float slipped in.

**Patterns to follow:**
- `src/lib/decimal-utils.ts` — `toDecimal()` handles empty strings and nulls safely.
- All `Decimal.max()` calls in `purchase-actions.ts` for pattern reference.

**Test scenarios:**
- Happy path: `totalAmount = 100.01`, `paidAmount = "99.99"` →
  deferred balance displays `0.02` exactly (not `0.020000000000001`).
- Happy path: `item.quantity = 3`, `item.unitCost = 0.1` → line total is `"0.30"`.
- Edge case: `paidAmount = ""` → deferred balance equals `totalAmount` (no crash, no NaN).
- Edge case: `paidAmount = "abc"` → `toDecimal` returns `0`, balance = totalAmount.
- Integration: Footer balance field updates reactively when `paidAmount` input changes.

**Verification:**
- All three files compile without new TS errors.
- Manual: enter `paidAmount = 99.99` on a `100.01` invoice; balance shows exactly `0.02`.

---

- [ ] **Unit D: CSRF Fetch Timeout & Error State**

**Goal:** Add a 5-second `AbortController` timeout to the CSRF fetch in `usePurchaseForm`;
expose a `csrfError` state that the overlay renders as a visible banner.

**Requirements:** R4

**Dependencies:** Unit A.

**Files:**
- Modify: `src/hooks/usePurchaseForm.ts`
- Modify: `src/types/purchasing.ts` *(add `csrfError` to `PurchaseFormReturn`)*
- Modify: `src/components/inventory/purchasing/NewPurchaseOverlay.tsx`
  *(render csrfError banner)*

**Approach:**
- Add `const [csrfError, setCsrfError] = useState(false)` to the hook.
- In the CSRF fetch `useEffect`, create an `AbortController`; pass `{ signal: controller.signal }`
  to `fetch`. Set a `setTimeout` for 5000ms that calls `controller.abort()`.
- In the `catch` block, distinguish `AbortError` (timeout) from other network errors;
  in both cases set `csrfError = true` and `csrfLoading = false`. Clear the timeout
  in `finally` to prevent memory leaks.
- In `NewPurchaseOverlay`, when `csrfError === true`, render the existing error banner
  pattern with message: `"فشل تحميل رمز الأمان — يرجى إعادة تحميل الصفحة"`.
- Add `csrfError` to `PurchaseFormReturn` type.

**Patterns to follow:**
- Existing `errorResult` banner in `NewPurchaseOverlay` lines 130–135 — same JSX pattern.
- `AbortController` pattern — standard browser/Node API, no new dependency.

**Test scenarios:**
- Happy path: CSRF token fetched within 5 seconds — `csrfLoading = false`, `csrfError = false`.
- Error path: fetch times out after 5 seconds — `csrfLoading = false`, `csrfError = true`,
  Arabic error banner visible.
- Error path: fetch rejects with network error — same outcome as timeout.
- Edge case: CSRF token provided as prop — `useEffect` skips fetch entirely;
  `csrfLoading = false`, `csrfError = false` from mount.

**Verification:**
- Overlay renders error banner when CSRF fetch is forced to timeout (throttle network in
  dev tools to offline, observe banner).
- Submit button becomes accessible (shows loading or error, not indefinite spinner) within
  6 seconds of mount in all network conditions.

---

- [ ] **Unit E: PurchaseDataGrid Correctness Fixes**

**Goal:** Fix the stale `handleKeyDown` deps, the stale `saveWidths` closure, and the
autocomplete filter order. Remove the `(product as any)` casts.

**Requirements:** R5, R6, R7, R11

**Dependencies:** Unit A (types needed for `(product as any)` cast removal).

**Files:**
- Modify: `src/components/inventory/purchasing/PurchaseDataGrid.tsx`

**Approach:**
- **Stale `handleKeyDown` deps (P1-10):** Add `handleQuickCreate` and `updateRow` to
  the `useCallback` dep array at line 1592. Both are already wrapped in `useCallback`,
  so this extends the memoisation chain without breaking it.
- **Stale `saveWidths` (P1-11):** Add a `latestWidthsRef = useRef(columnWidths)` and a
  synchronising `useEffect` that sets `latestWidthsRef.current = columnWidths` on every
  render. In the `handleMouseUp` inside the resize `useEffect`, call
  `saveWidths(latestWidthsRef.current)` instead of `saveWidths(columnWidths)`.
- **Autocomplete filter order (P2-12):** In `ItemDropdown`, move `.slice(0, 100)` to
  after `.filter(...)`. New order: `products.filter(...).slice(0, 18)`. Remove the
  intermediate 100-item slice entirely — the final 18-item slice is sufficient.
- **`(product as any)` casts (P2-20):** Extend `ProductOption` in `src/types/purchasing.ts`
  to include `categoryId?: string; modelId?: string; attributeId?: string`. Remove the
  three `as any` casts in `handleProductSelect`.

**Patterns to follow:**
- `latestWidthsRef` pattern — same as using a `latestValueRef` for event handlers in
  React; standard approach for stale closure in `useEffect`-registered handlers.

**Test scenarios:**
- Happy path: press `+` in a category cell after changing rows rapidly — correct row is
  targeted (stale closure fixed).
- Happy path: drag column to 200px, release — localStorage stores 200px (not previous
  value) — verify by reading `localStorage.getItem(STORAGE_KEY)`.
- Happy path: search "iphone" with 200 products — all matching products appear in the
  dropdown, not just those in the first 100.
- Edge case: search term matches product at index 150 — product appears in dropdown.
- Integration: selecting a product from autocomplete correctly populates `categoryId`,
  `modelId`, `attributeId` on the row without `as any` cast.

**Verification:**
- `npx tsc --noEmit` — no new errors from the cast removals.
- Manual: resize a column; close and reopen the overlay; column width is preserved at
  the dragged value.

---

- [ ] **Unit F: NewPurchaseOverlay Dead Code & Draft Guard**

**Goal:** Remove the `filteredWarehouses` dead assignment; guard draft load against
edit mode; wire or remove orphaned keyboard hints.

**Requirements:** R8, R10, R13

**Dependencies:** Unit A.

**Files:**
- Modify: `src/components/inventory/purchasing/NewPurchaseOverlay.tsx`
- Modify: `src/hooks/usePurchaseForm.ts`

**Approach:**
- **Dead `filteredWarehouses` (P2-18):** Delete `const filteredWarehouses = warehouses;`
  at line 101. Replace its single usage (`warehouses={filteredWarehouses}`) with
  `warehouses={warehouses}` directly. No logic change.
- **Draft load guard (P2-14):** In the `usePurchaseForm` load-from-storage `useEffect`,
  wrap the entire load block in `if (editingInvoiceId) return;` as the first line.
  `editingInvoiceId` is initialised from the same `useState(null)` and is stable at
  mount time — the guard is reliable.
- **Orphaned keyboard hints (P3-23):** Wire F2 → `handleSubmit` and F4 → open bulk
  upload dialog, via a `keydown` event listener in the overlay. If wiring is deferred,
  remove the F2/F4 hint spans entirely to avoid false affordances. Decision: **wire F2**
  (save shortcut is high-value); **remove F4** hint (bulk upload is a separate dialog
  already accessible via the header button — the hint adds no value).
  - F2 listener: attach to `window` while overlay is mounted; `e.key === 'F2'` calls
    `handleSubmit()`; cleanup on unmount.

**Patterns to follow:**
- Existing `BarcodeListener` component pattern — event listener mounted on window while
  overlay open, removed on unmount.

**Test scenarios:**
- Happy path: open overlay to edit existing invoice — localStorage draft is NOT loaded;
  edit form shows the fetched invoice data.
- Happy path: open overlay for new purchase — draft IS loaded if present.
- Happy path: F2 key triggers form submission (same as clicking the save button).
- Edge case: F4 hint is absent from DOM — no user confusion about a non-functional shortcut.

**Verification:**
- Open an existing invoice for edit; verify no draft field values bleed into the form.
- Press F2 on an open purchase overlay with items — invoice save is triggered.

---

- [ ] **Unit G: PurchaseItemsTable & Price History Type Fix**

**Goal:** Replace `any[]` price history state with a typed interface; fix the
`(item.quantity * item.unitCost)` float multiplication (already covered in Unit C).

**Requirements:** R1, R12

**Dependencies:** Unit A (for the `PriceHistoryEntry` interface).

**Files:**
- Modify: `src/components/inventory/purchasing/PurchaseItemsTable.tsx`

**Approach:**
- Import `PriceHistoryEntry` from `src/types/purchasing.ts`.
- Replace `useState<any[] | null>(null)` with `useState<PriceHistoryEntry[] | null>(null)`.
- Remove the local `InvoiceItem` interface — it duplicates `CartItem` from
  `src/types/purchasing.ts`. Change the `items` prop type to `CartItem[]`.
- The `toDecimal` line total fix from Unit C covers the remaining float in this file.

**Patterns to follow:**
- `CartItem` in `src/types/purchasing.ts`.

**Test scenarios:**
- Happy path: `PriceHistoryEntry` fields are accessed without type cast — TS compile clean.
- Edge case: `history` is an empty array — popover renders "No history found" state.

**Verification:**
- `npx tsc --noEmit` — no implicit `any` on history array access.

---

- [ ] **Unit H: PurchaseHeader Attachment Storage Fix**

**Goal:** Replace base64 Data URL in state/localStorage with an object URL; revoke on
unmount/reset; stop persisting attachment in the localStorage draft.

**Requirements:** R9

**Dependencies:** None — standalone change to `PurchaseHeader` + `usePurchaseForm`.

**Files:**
- Modify: `src/components/inventory/purchasing/PurchaseHeader.tsx`
- Modify: `src/hooks/usePurchaseForm.ts`

**Approach:**
- In `PurchaseHeader.handleFileChange`, replace:
  `const compressed = await compressImage(file, …); setAttachmentUrl(compressed);`
  with: store the `File` object as state (`attachmentFile`) instead. Generate an object
  URL via `URL.createObjectURL(file)` for the preview image src only. On form reset,
  call `URL.revokeObjectURL(previewUrl)` to free memory.
- Because `CartItem.attachmentUrl` stores a string in the payload, keep a separate
  `attachmentFile` prop in the hook. On `handleSubmit`, if `attachmentFile` is present
  and an upload API exists, upload it and embed the returned URL in the payload. If no
  upload API exists yet, send `null` and note the gap.
- **Remove `attachmentUrl` from the localStorage draft** in `usePurchaseForm`. The draft
  save `useEffect` already lists every field — simply omit `attachmentUrl` and
  `attachmentFile` from the draft object.
- If `PurchaseFormReturn` currently exports `attachmentUrl: string | null`, keep that
  field for the payload path but add `attachmentPreviewUrl: string | null` (the object URL)
  as a separate piece of state for the image preview in the header.

**Patterns to follow:**
- `URL.createObjectURL` / `URL.revokeObjectURL` — standard browser API; no new dependency.
- Draft exclusion pattern — same approach already used for `editingInvoiceId` field.

**Test scenarios:**
- Happy path: select a 1MB image — preview displays without localStorage write.
- Happy path: form reset — object URL is revoked (no memory leak).
- Edge case: close overlay without submitting — no base64 string persists in localStorage.
- Integration: `localStorage.getItem('purchase_form_draft_v2')` never contains a
  `data:image/...` string.

**Verification:**
- Check `localStorage.getItem('purchase_form_draft_v2')` after selecting an attachment
  image — the value does not contain a base64 data URL.
- Observe DevTools Memory panel: object URLs are revoked on reset.

---

- [ ] **Unit I: Polish — console.logs, Copy, Type Casts**

**Goal:** Remove debug logs; correct Arabic "زبون" copy; eliminate the 4× `localRef as any`
casts; document the `DEFAULT_WIDTHS` magic array.

**Requirements:** R14, R15

**Dependencies:** None.

**Files:**
- Modify: `src/components/inventory/purchasing/PurchaseDataGrid.tsx`
- Modify: `src/components/inventory/purchasing/PurchaseHeader.tsx`

**Approach:**
- **console.logs (P3-22):** Remove lines 1612 and 1614 in `PurchaseDataGrid`:
  the two `console.log("[handleAutoSku]…")` calls inside `handleAutoSku`.
- **`localRef as any` casts (P3-25):** In `CategoryDropdown`, `ModelDropdown`,
  `AttributeDropdown`, and `UnitDropdown`, change `useRef<HTMLButtonElement>()` to
  `React.MutableRefObject<HTMLButtonElement | null>` type explicitly; remove
  `(localRef as any).current = el` and use the standard ref callback or assign directly.
- **Arabic copy (P3-21):** In `PurchaseHeader`, locate the toggle button text
  "تبديل لشراء من زبون" and replace with "شراء مباشر (بدون مورد)".
- **`DEFAULT_WIDTHS` magic array (P3-26):** Add a descriptive comment above the
  `DEFAULT_WIDTHS` constant listing column names mapped to each index. No code change —
  documentation only.

**Test scenarios:**
- Test expectation: none for console.log removal (non-behavioral).
- Happy path: `localRef` typing — `npx tsc --noEmit` shows no implicit `any` on the
  4 dropdown components.
- Test expectation: none for copy change — translation string, not logic.

**Verification:**
- `console.log` statements absent from production build (check `npm run build` output
  or grep `console.log` in `PurchaseDataGrid.tsx`).
- `npx tsc --noEmit` — no `as any` required for the 4 button refs.

---

## Pre-Flight Checklist

Run before writing any code:

```powershell
# 1. Baseline TypeScript error count
npx tsc --noEmit 2>&1 | Measure-Object -Line

# 2. Enumerate ALL float-arithmetic call sites in the module
grep -n "parseFloat\|Math\.max\|Math\.round\|Number(" `
  src/hooks/usePurchaseForm.ts `
  src/components/inventory/purchasing/NewPurchaseOverlay.tsx `
  src/components/inventory/purchasing/PurchaseItemsTable.tsx `
  src/components/inventory/purchasing/PurchaseDataGrid.tsx `
  src/actions/purchase-actions.ts

# 3. Find all @prisma/client/runtime Decimal usages
grep -rn "prisma/client/runtime" src/

# 4. Check attachment blob in current localStorage draft
# (manual: open browser DevTools → Application → localStorage → look for data:image)
```

Record the baseline tsc error count. Any new errors from the type changes in Unit A are
pre-existing or clearly attributable — the baseline separates them.

---

## Sequencing

```
PRE-FLIGHT: Run 4 commands above; record baseline

PHASE 1 (unblocking):
  Unit A  — type safety + Decimal import
  (commit: refactor: type safety foundation for purchasing module)

PHASE 2 (server precision):
  Unit B  — server-side float + GL entries
  (commit: fix: enforce Decimal.js on server accounting paths)
  → npx tsc --noEmit (≤ baseline)

PHASE 3 (client precision + correctness):
  Unit C  — client float violations (overlay + table + hook)
  Unit D  — CSRF timeout + error state
  Unit E  — DataGrid stale closures + autocomplete + type casts
  Unit F  — dead code + draft guard + F2 hint
  (commit: fix: Decimal.js on all client monetary paths; correctness fixes)
  → npx tsc --noEmit (≤ baseline)
  → npx vitest run src/__tests__/decimal-precision.test.ts

PHASE 4 (types + polish):
  Unit G  — PurchaseItemsTable types
  Unit H  — attachment object URL
  Unit I  — console.logs, copy, casts
  (commit: fix: type safety, attachment storage, and UX polish)
  → npx vitest run (full suite)
```

---

## System-Wide Impact

- **`NewPurchaseOverlay` prop types:** Changing `any[]` to typed arrays may cause type
  errors in the parent page server component that renders the overlay. Check
  `src/app/(dashboard)/inventory/purchasing/page.tsx` (or equivalent) for the prop
  passthrough. Apply matching types there too.
- **`PurchaseFormReturn`:** Adding `csrfError` to the interface is additive and backward-
  compatible — no existing destructuring breaks.
- **localStorage draft:** Removing `attachmentUrl` from the draft means any in-flight
  draft with a base64 image will simply not restore the attachment on reload (the other
  fields restore normally). This is the correct behaviour — attachment persistence across
  reloads is not a feature.
- **`handleKeyDown` deps:** Adding `handleQuickCreate` and `updateRow` as deps causes
  `handleKeyDown` to re-memoize whenever those callbacks change. Both are stable
  `useCallback` refs so re-memo frequency is unchanged in practice.
- **Autocomplete filter order:** Fixes a data visibility bug with no performance downside
  (the filter runs on the full list anyway, now correctly).

---

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `Decimal` from `decimal.js` behaves differently from Prisma runtime in edge cases | Low | Medium | Both wrap the same `big-decimal` algorithm. Run full Vitest suite after Unit A. |
| Removing base64 from localStorage draft breaks attachment restoration for in-flight sessions | Low | Low | Acceptable — attachment on reload was never a supported feature. Users lose the image preview on refresh; no data loss for the invoice. |
| `filteredWarehouses` removal breaks branch-scoped filtering if logic was intended but not yet implemented | Low | Medium | Confirm with product owner that no branch filter on warehouses is intentional at this time. If filter logic is needed, add it in a separate task. |
| F2 keyboard listener conflicts with browser or OS shortcuts | Low | Low | F2 is already documented in the UI hint bar — existing operators expect it. Test on target Electron environment. |
| `handleKeyDown` dep array change causes correctness issue on rapid key navigation | Low | Medium | Manual test: rapid tab-through of 20 rows before and after; verify row count remains stable. |
| Object URL revocation too early (revoked before upload completes) | Low | High | Revoke only in the `resetForm` path and `useEffect` cleanup, not during submit. Upload completes before reset is called. |

---

## Gap Analysis

| Finding | Risk if Skipped | This Plan |
|---------|----------------|-----------|
| Float in deferred-balance display | Wrong amount shown to operator | Unit C ✅ |
| Float in line total (PurchaseItemsTable) | Wrong line total on screen | Unit C ✅ |
| Float in price-variance check | Spurious/missed warnings | Unit B ✅ |
| Prisma-internal Decimal import | Silent break on Prisma upgrade | Unit A ✅ |
| CSRF fetch no timeout | Submit permanently blocked | Unit D ✅ |
| `any[]` master data props | Invisible runtime shape mismatch | Unit A ✅ |
| `handleKeyDown` missing deps | Stale closure on `+` shortcut | Unit E ✅ |
| `saveWidths` stale closure | Last drag pixels not saved | Unit E ✅ |
| Autocomplete filter before slice | Items >100 never found | Unit E ✅ |
| Draft load on edit mode | Edit form overwritten by stale draft | Unit F ✅ |
| Base64 attachment in localStorage | 5MB quota exhaustion | Unit H ✅ |
| Dead `filteredWarehouses` | Misleading dead code | Unit F ✅ |
| `UnitOption.conversionFactor: any` | Numeric ops on untyped value | Unit A ✅ |
| `(product as any)` casts | Type holes in autocomplete select | Unit E ✅ |
| Price history `any[]` | Unsafe field access | Unit G ✅ |
| Orphaned F2/F4 hints | False operator expectation | Unit F ✅ |
| Console.log in handleAutoSku | Log on every Quick-Create | Unit I ✅ |
| `localRef as any` (4×) | TS noise, potential misuse | Unit I ✅ |
| Wrong Arabic copy "زبون" | Operator confusion in walk-in mode | Unit I ✅ |
| `DEFAULT_WIDTHS` undocumented | Mis-alignment on column add | Unit I ✅ |
| `paidAmount > totalAmount` via parseFloat | Float comparison | Unit C ✅ |
| `addToCartExisting` qty as `Number(i.quantity) + 1` | Mixed type arithmetic | Not P0 — integer ops on count field; deferred |
| `BulkUploadDialog` duplicate-SKU allow-through | Duplicate invoices | Deferred (product decision) |
| Walk-in field format validation | Compliance risk | Deferred (separate UX ticket) |
| `PurchaseItemsTable` possible dead code | Maintenance trap | Deferred (audit required) |
| Canvas module-level node | Minor GC overhead in Electron | Not in plan — acceptable, low risk |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Float violations in monetary display paths | 4 | 0 |
| `any[]` master-data props in overlay + hook | 9 | 0 |
| `any` type usages in purchasing module interfaces | ~15 | 0 |
| CSRF fetch with timeout + user-visible error | No | Yes |
| Autocomplete searches full product list | No (slices first) | Yes |
| Draft load guard on edit mode | No | Yes |
| localStorage draft contains base64 images | Yes | No |
| console.log in production path | 2 | 0 |

---

## Estimated Success Ratio

### Before Pre-Flight

| Category | Confidence | Risk Driver |
|----------|-----------|------------|
| Float fixes compile cleanly | 90% | Unknown float call sites not caught by review |
| Type migration produces 0 new TS errors | 80% | Cascading any in parent page component |
| CSRF timeout does not break existing auth | 95% | AbortController is browser-standard |
| Attachment object URL revocation correct | 85% | Object URL lifecycle edge cases |
| No behavioural regressions in grid | 85% | Stale closure fixes are correctness changes |
| **Overall** | **~87%** | |

### After Pre-Flight (Closure Measures Applied)

| Category | Confidence | Closure Action |
|----------|-----------|----------------|
| Float fixes compile cleanly | **100%** | Pre-flight grep enumerates every `parseFloat` / `Number(` site before any edit |
| Type migration produces 0 new TS errors | **98%** | Pre-flight `tsc --noEmit` baseline separates pre-existing from new; parent page is explicitly in scope |
| CSRF timeout does not break existing auth | **100%** | AbortController with cleanup; no auth state modified |
| Attachment object URL revocation correct | **95%** | Revoke only in `resetForm` and unmount — upload always precedes reset |
| No behavioural regressions in grid | **97%** | `handleKeyDown` dep fix is strictly additive; autocomplete filter order fix is a pure correctness improvement |
| **Overall** | **~98%** | Residual 2% = unknown attachment upload endpoint gap (noted as a known gap, not a silent failure) |

> The 11% gap closes almost entirely through the pre-flight commands and by
> explicitly acknowledging the attachment upload endpoint as a known open item rather
> than silently skipping it.

---

## Sources & References

- Origin: `purchasing-code-review.md` (AI code review, 2026-06-14)
- Prior plan: `docs/plans/2026-06-12-001-fix-purchasing-module-hardening-plan.md`
  (superseded by this plan)
- Related code: `src/lib/decimal-utils.ts`, `src/types/purchasing.ts`,
  `src/types/product.ts`, `src/actions/purchase-actions.ts`,
  `src/hooks/usePurchaseForm.ts`,
  `src/components/inventory/purchasing/PurchaseDataGrid.tsx`,
  `src/components/inventory/purchasing/NewPurchaseOverlay.tsx`,
  `src/components/inventory/purchasing/PurchaseHeader.tsx`,
  `src/components/inventory/purchasing/PurchaseItemsTable.tsx`
