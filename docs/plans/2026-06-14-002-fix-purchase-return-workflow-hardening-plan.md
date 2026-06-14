---
title: "fix: Purchase Return Workflow — UI Hardening & Gap Closure"
type: fix
status: active
date: 2026-06-14
origin: purchasing-code-review.md (AI code review, 2026-06-14)
---

# fix: Purchase Return Workflow — UI Hardening & Gap Closure

## Overview

The purchase return server actions (`voidPurchase`, `partialReturnPurchase` in
`src/actions/purchase-actions.ts`) are solid: Decimal.js math, stock underflow guards,
GL double-entry, audit logs, and idempotency checks all verified. The gaps are entirely
in the **UI layer** across three files. This plan closes all of them.

No schema changes. No new server actions. No new routes. Pure defensive UI hardening.

---

## Problem Frame

A code review of the return workflow surfaces **5 critical UI gaps** and **3 type-safety
quality issues**. The critical gaps can cause:

- **Wrong refund amount displayed** to the user before submission (float precision)
- **Double deduction** of supplier balance + stock (missing `PARTIAL_RETURN` guard)
- **Broken UX** when trying to partial-return a fully-returned invoice (missing guard)
- **Inaccessible partial return** from the supplier ledger surface (missing button)

### Affected Files

| File | Surface |
|------|---------|
| `src/components/logs/PartialReturnPurchaseDialog.tsx` | Partial return dialog (Logs page) |
| `src/components/logs/PurchaseLog.tsx` | Purchase log table (Logs page) |
| `src/components/inventory/SupplierHistoryTable.tsx` | Supplier ledger (Supplier detail page) |

---

## Gaps Inventory

### 🔴 Critical

| ID | File | Lines | Issue | Risk |
|----|------|-------|-------|------|
| C1 | `PartialReturnPurchaseDialog.tsx` | 69–72 | `totalToReturn` accumulator uses native JS float multiply (`Number(item.unitCost) * qty`) | Displayed refund amount is wrong for fractional costs. The value is also passed to `onReturnDone` callback for UI state update, so the invoice total shown after return is incorrect. Server is safe (Decimal.js used server-side), but UI misinforms the operator. |
| C2 | `SupplierHistoryTable.tsx` | 533–551 | No partial return button on INVOICE rows — only full void (Trash) exists | Partial returns (the "standard procedure" per workflow doc) are inaccessible from the supplier ledger. Operators must navigate to Logs page to initiate them. |
| C3 | `SupplierHistoryTable.tsx` | 536 | Void button guard: `['VOIDED', 'CANCELLED', 'RETURNED']` — missing `PARTIAL_RETURN` and `RETURN` | A `PARTIAL_RETURN` invoice can be full-voided again from this screen, triggering a second `voidPurchase` call → double supplier balance deduction + double stock decrement. |
| C4 | `PurchaseLog.tsx` | 507 | Partial return button guard: `!['VOIDED', 'CANCELLED'].includes(inv.status) && !inv.isReturn` — missing `RETURNED` | A fully-returned invoice shows the RotateCcw button. Server rejects with "Already returned", but UX is jarring and invites confusion. |
| C5 | `SupplierHistoryTable.tsx` | 82, 84–87 | `settings` state typed as `any`; `getStoreSettings()` result narrowed with `as any` | Silent error swallow; settings may be `undefined` during `handlePrint`, causing the A4 template to render with nulls. |

### 🟡 Quality

| ID | File | Lines | Issue |
|----|------|-------|-------|
| Q1 | `PartialReturnPurchaseDialog.tsx` | 25 | `onReturnDone` callback has `any[]` for `returnedItems` and `updatedItems` parameters |
| Q2 | `PurchaseLog.tsx` | 61 | `partialReturnPurchase` state typed as `any` instead of `PurchaseInvoiceWithItems \| null` |
| Q3 | `SupplierHistoryTable.tsx` | 82 | `settings` state typed as `any` |

---

## Decision Log

**D1 — Use `Decimal.js` for `totalToReturn` in the dialog only; do not change `onReturnDone` signature's number types.**
Rationale: The existing callback contract expects `number` for `returnedAmount` and `newTotal`. Changing that would require updates in `PurchaseLog.tsx` and potentially `ReturnCart.tsx`. The fix is to compute with Decimal and call `.toNumber()` only at the boundary — consistent with how the rest of the codebase handles this.

**D2 — Add partial return button to `SupplierHistoryTable` by importing and mounting `PartialReturnPurchaseDialog` directly.**
Rationale: The dialog is already self-contained and generic. Duplicating it or creating a wrapper would be unnecessary indirection. The component just needs `purchase`, `isOpen`, `onClose`, and `onReturnDone` props.

**D3 — `onReturnDone` in `SupplierHistoryTable` calls `router.refresh()` instead of mutating local state.**
Rationale: The supplier ledger computes a running balance server-side. Unlike `PurchaseLog`, there is no local state to optimistically update for balance recalculation. `router.refresh()` is the correct pattern for this RSC-driven page.

**D4 — `settings` type uses the inferred return type of `getStoreSettings` rather than a hand-written interface.**
Rationale: Avoids drift. Extract `StoreSettings` type from the action's return shape if needed, or use `Awaited<ReturnType<typeof getStoreSettings>>['data']`.

---

## Implementation Units

### Unit A — `PartialReturnPurchaseDialog.tsx`: Decimal.js + Type Safety

**Files:** `src/components/logs/PartialReturnPurchaseDialog.tsx`

**Changes:**

1. Import `Decimal` from `'decimal.js'`
2. Rewrite `totalToReturn` computation:
   - Replace the `reduce` using `Number(item.unitCost) * qty` with `Decimal.plus()` accumulation
   - Expose `.toNumber()` only at the render boundary (for the displayed label) and at the `onReturnDone` call
3. Replace `any` on `items.find(...)` and `items.map(...)` iterators with `PurchaseItem` from `@/types/purchasing`
4. Type `onReturnDone`'s `returnedItems` param as `PurchaseItem[]` (or the narrowed shape used internally)

**Test scenarios:**
- Unit cost = 10.1, qty = 3 → `totalToReturn` = 30.3 (not 30.299999...)
- Unit cost = 0.1, qty = 10 → `totalToReturn` = 1.0 (not 0.9999999...)
- Mixed items: two items selected, totals accumulate correctly without float drift
- Confirm button disabled when `totalToReturn.isZero()`

---

### Unit B — `PurchaseLog.tsx`: RETURNED Guard + Type Safety

**Files:** `src/components/logs/PurchaseLog.tsx`

**Changes:**

1. Add `'RETURNED'` to the partial return button's disabled status list:
   ```
   // Before:
   !['VOIDED', 'CANCELLED'].includes(inv.status) && !inv.isReturn
   // After:
   !['VOIDED', 'CANCELLED', 'RETURNED'].includes(inv.status) && !inv.isReturn
   ```
2. Change `partialReturnPurchase` state type from `any` to `PurchaseInvoiceWithItems | null`
   - Import `PurchaseInvoiceWithItems` from `@/types/purchasing` (already used in `PartialReturnPurchaseDialog`)

**Test scenarios:**
- Invoice with status `RETURNED` → partial return button (RotateCcw) is **not** rendered
- Invoice with status `PARTIAL_RETURN` → partial return button **is** rendered (still returnable)
- Invoice with `isReturn: true` → partial return button **not** rendered
- Invoice with status `PAID` → partial return button **is** rendered
- Invoice with status `VOIDED` → partial return button **not** rendered

---

### Unit C — `SupplierHistoryTable.tsx`: Void Guard + Partial Return Button + Type Fix

**Files:** `src/components/inventory/SupplierHistoryTable.tsx`

**Changes:**

1. **Fix void guard (C3):** Extend disabled status check to include `'PARTIAL_RETURN'` and `'RETURN'`:
   ```
   disabled={['VOIDED', 'CANCELLED', 'RETURNED', 'PARTIAL_RETURN', 'RETURN'].includes(tx.status)}
   ```
   - The matching `className` disabled-state condition must be updated to the same list.

2. **Add partial return button (C2):**
   - Add state: `partialReturnTx: Transaction | null`
   - For INVOICE rows where the void button is enabled (status not in the voided/returned set), render a secondary `RotateCcw` button beside the Trash button
   - The button sets `partialReturnTx` to the row's transaction and opens `PartialReturnPurchaseDialog`
   - `PartialReturnPurchaseDialog` needs a `purchase` prop of type `PurchaseInvoiceWithItems` — the `Transaction` interface in this file does not carry full `items[].product.stocks`. The transaction's `id` must be used to reconstruct the shape, or the component must be passed the minimum required props.
   - **Resolution:** Pass only `{ id: tx.id, warehouseId: undefined, items: tx.items.map(...) }` — the dialog reads `item.product?.stocks` for stock-in-warehouse calculation. The `Transaction.items` interface has `{ name, sku, category, quantity, unitCost }` but not `product.stocks`. Two options:
     - **Option A (preferred):** Extend `Transaction.items` in this file to include `product?: { stocks?: { warehouseId: string; quantity: number }[] }` and pass it through from the server query in the page
     - **Option B (fallback):** Adapt the dialog to handle missing `product.stocks` gracefully (defaults to `availableQty = invoiceQty` for display; server enforces the real cap)
   - Implement Option A: update the `items` include in `src/app/(routes)/inventory/suppliers/[id]/page.tsx` to include `product.stocks` on items

3. **`onReturnDone` handler:**
   - Call `router.refresh()` (router is already imported) to rehydrate the running balance from the server
   - No local state mutation needed (running balance is computed server-side)

4. **Fix `settings` type (C5/Q3):**
   - Type `settings` as `Awaited<ReturnType<typeof getStoreSettings>>['data'] | null`
   - Remove implicit `as any` usage on the `getStoreSettings` result

5. **Import `PartialReturnPurchaseDialog`** from `@/components/logs/PartialReturnPurchaseDialog`

**Test scenarios:**
- INVOICE row with status `PARTIAL_RETURN` → void button (Trash) **disabled** ✓, partial return button (RotateCcw) **enabled** ✓
- INVOICE row with status `RETURNED` → both Trash and RotateCcw **disabled** ✓
- INVOICE row with status `PAID` (active) → Trash **enabled** ✓, RotateCcw **enabled** ✓
- PAYMENT row → neither Trash for partial return, only Trash for void
- Partial return from supplier ledger → `router.refresh()` called → running balance updates ✓
- `RTN-` prefixed invoice row → both buttons disabled ✓

---

### Unit D — Page Query: Add `product.stocks` to Supplier Detail

**Files:** `src/app/(routes)/inventory/suppliers/[id]/page.tsx`

**Changes:**

1. In the `purchaseInvoice.findMany` query, extend the `items.include.product` select to include:
   ```
   stocks: { select: { warehouseId: true, quantity: true } }
   ```
2. Propagate through the `transactions` mapping to include `stocks` in the item shape

> This unblocks Unit C's Option A: the dialog can now show accurate stock-capped available quantities from the supplier ledger, consistent with how the Logs page dialog works.

**Test scenarios:**
- Supplier with purchases → items in dialog show correct available qty (capped by actual warehouse stock)
- Product with 5 purchased, 3 sold → partial return dialog shows max 2, not 5

---

## Sequencing

```
Unit D  →  Unit C  →  Unit A  →  Unit B
(query)    (table)    (dialog)   (log)
```

Units A and B have no dependency on each other and can be done in parallel. Units C and D
must be done together (C depends on D's query extension).

---

## Verification Plan

### Automated

```bash
npx tsc --noEmit
npx vitest run
```

Expected: 0 errors, 78/78 tests passing (no test changes required — all units are UI-layer with no server-action changes).

### Manual Checklist

| Scenario | Expected |
|----------|----------|
| `/logs` → RETURNED invoice → RotateCcw button | Hidden |
| `/logs` → PARTIAL_RETURN invoice → RotateCcw button | Visible |
| `/logs` → PAID invoice → trigger partial return → enter qty 0.1 × 10 | Displayed total = 1.00, not 0.999... |
| `/inventory/suppliers/[id]` → INVOICE row (PAID) | Both RotateCcw and Trash visible |
| `/inventory/suppliers/[id]` → INVOICE row (PARTIAL_RETURN) | Trash disabled, RotateCcw visible |
| `/inventory/suppliers/[id]` → INVOICE row (RETURNED) | Both disabled |
| `/inventory/suppliers/[id]` → partial return confirmed | Running balance updates (page refreshes) |
| `/inventory/suppliers/[id]` → RTN- prefixed row | Both disabled |

---

## Risk Register

### 🔴 High — C3: Double Supplier Balance Deduction (Pre-fix)

**Trigger:** Operator opens supplier ledger, finds a `PARTIAL_RETURN` invoice, clicks Trash.
**Impact:** `voidPurchase` runs on an invoice that has already had stock and balance partially reversed. Result: second full deduction of supplier balance + second stock decrement. Financial records become corrupted. Requires manual DB correction.
**Post-fix likelihood:** Zero — Trash button disabled for all `PARTIAL_RETURN` / `RETURN` statuses.
**Pre-fix likelihood:** High (button is visually active and there is no warning).

---

### 🔴 High — C1: Float Display Misinforms Operator (Pre-fix)

**Trigger:** Any partial return involving unit costs with fractional values (e.g., 10.10, 33.33).
**Impact:** Displayed refund total is incorrect (e.g., 30.299999... instead of 30.30). The value flows into `onReturnDone` and updates the UI invoice total with the same drift. Operator may accept a visually wrong amount without realising it. The server records the correct amount (Decimal.js server-side), creating a visible UI/DB mismatch.
**Post-fix likelihood:** Zero.
**Pre-fix likelihood:** Certain for any unit cost with ≥ 2 decimal places.

---

### 🟡 Medium — Unit C Integration Complexity: `Transaction` → `PurchaseInvoiceWithItems` shape mismatch

**Trigger:** `PartialReturnPurchaseDialog` expects `product.stocks` on items for stock-cap calculation. `SupplierHistoryTable`'s `Transaction` interface does not carry that field.
**Impact if not handled:** Dialog defaults to showing `invoiceQty` as available (no stock cap), which may show higher available quantities than actually exist. The server enforces the real cap and will reject over-return, but the operator may be confused by a quantity they set that then fails server-side validation.
**Mitigation:** Unit D extends the DB query and propagates `product.stocks`. This is the primary mitigation. If for any reason Unit D is blocked, Unit C must fall back to Option B (graceful null handling + server enforcement).
**Residual risk after fix:** Low — server always enforces the floor.

---

### 🟡 Medium — `router.refresh()` latency in Supplier Ledger after Partial Return

**Trigger:** `router.refresh()` is called after a successful partial return from the supplier ledger. On a slow connection or large transaction set, the page may take 1–3 seconds to reload.
**Impact:** UX gap — no loading indicator during the refresh cycle. Operator may click again thinking the action failed.
**Mitigation:** Add a `isReturning` boolean state; disable the RotateCcw button after trigger and show a `Loader2` spinner until refresh completes.
**Plan status:** Noted. Implementer should include this as part of Unit C.

---

### 🟢 Low — `getStoreSettings()` silent null in print template (C5)

**Trigger:** `getStoreSettings()` fails or returns without `data`. Currently caught by `if (res.success)` but `settings` stays `null` and the A4 template receives nulls for store name, logo, etc.
**Impact:** Print output has missing store name/address. Does not crash — the template renders with placeholder text.
**Post-fix:** Explicit typing eliminates silent `any` cast; the issue is surfaced at compile time. Runtime behaviour is unchanged — template already handles null gracefully.

---

## Success Ratio

| Unit | Complexity | Regression Risk | Confidence | Notes |
|------|-----------|----------------|------------|-------|
| **A** — Decimal fix in dialog | Low | Zero | **99%** | Pure math swap. No component shape change. |
| **B** — RETURNED guard in log | Low | Zero | **99%** | One-line status array addition. Additive only. |
| **C** — Supplier table hardening | Medium | Low | **92%** | New state + dialog import + query shape dependency on Unit D. Risk is in prop-shape alignment. |
| **D** — DB query extension | Low–Medium | Very Low | **96%** | Adding a `stocks` select to an existing include. Propagation through the mapping is mechanical. |
| **Overall** | Low–Medium | **Low** | **~95%** | All changes are additive/defensive. No server-action or schema modifications. |

### What could break the 5%

- `PurchaseInvoiceWithItems` type does not perfectly match the shape constructed from `Transaction` in Unit C → TypeScript errors. **Resolution:** Cast to a minimal interface covering only the props the dialog uses.
- The `items.include.product.stocks` Prisma include causes a query timeout on suppliers with 500+ invoices (each with multiple items). **Resolution:** Already capped at 500 invoices in the existing query. If performance degrades, add `take: 50` to `items` or load stocks lazily.

---

## Execution Workflow

```
START
  │
  ├─ [Track 1: Data Layer]
  │     Unit D: Extend product.stocks into supplier page query
  │     └─ Verify: TypeScript compiles, supplier page loads with stocks on items
  │
  └─ [Track 2: UI Layer — parallel with Track 1]
        Unit A: Decimal.js in PartialReturnPurchaseDialog
        Unit B: RETURNED guard + type fix in PurchaseLog
        └─ Verify: tsc + vitest green
  │
  ├─ [Merge point — both tracks done]
  │
  Unit C: SupplierHistoryTable hardening
    ├─ Step C.1: Fix void guard (PARTIAL_RETURN + RETURN added)
    ├─ Step C.2: Add partialReturnTx state + RotateCcw button
    ├─ Step C.3: Wire PartialReturnPurchaseDialog
    ├─ Step C.4: onReturnDone → router.refresh() + isReturning spinner
    └─ Step C.5: Fix settings type
  │
  └─ VERIFY
        npx tsc --noEmit        → 0 errors
        npx vitest run          → 78/78 ✅
        Manual checklist        → 8/8 scenarios pass
        └─ DONE
```

**Estimated effort:** 1.5–2 hours for a focused implementation pass.

---

## UX / UI Audit

### Current State — Operator Experience Gaps

#### Gap 1: No visual distinction between `PARTIAL_RETURN` and `RETURNED` in `SupplierHistoryTable`

Both statuses show the same INVOICE row type indicator with the same `فاتورة شراء` label (or `مرتجع شراء` only if the reference starts with `RTN-`). An operator cannot tell at a glance how much of an invoice has been returned vs. the full amount.

**Recommended UX addition (outside this plan's scope but noted):**
- Add a `PARTIAL_RETURN` badge in the description cell alongside the `مرتجع شراء` label
- Show a mini progress bar or fraction `(2/5 وحدة مُرجَّعة)` per row

#### Gap 2: No feedback between partial return confirmation and `router.refresh()` completing

After the operator confirms a partial return in the dialog, the dialog closes but the table still shows the old balance for 1–2 seconds until `router.refresh()` completes. Without a loading indicator, this looks like nothing happened.

**Fix (included in Unit C):** `isReturning` state → disable button, show `Loader2` spinner on the row until refresh resolves.

#### Gap 3: Void button (Trash) in `SupplierHistoryTable` has no reason prompt

`PurchaseLog.tsx` uses `<ReasonDialog>` before calling `voidPurchase`, giving the audit log a reason string. `SupplierHistoryTable.tsx` calls `voidPurchase` directly with `reason: "Manual void from history"` — a hardcoded string.

**Risk:** Audit logs from the supplier ledger surface are always recorded as `"Manual void from history"` regardless of actual reason. This is an auditing gap.
**Recommendation (future work):** Add `<ReasonDialog>` to `SupplierHistoryTable` before invoking `voidPurchase`. Not blocking this plan but flagged.

#### Gap 4: Dialog header does not show invoice number in `PartialReturnPurchaseDialog`

The dialog shows `#${purchase.id.slice(0, 8).toUpperCase()}` — a UUID prefix — not the human-readable `invoiceNumber` (e.g., `PO-2024-0045`). This makes it hard for the operator to confirm they opened the right invoice.

**Fix (outside this plan's scope — trivial follow-up):**
```tsx
// Change:
#{purchase.id.slice(0, 8).toUpperCase()}
// To:
{purchase.invoiceNumber || `#${purchase.id.slice(0, 8).toUpperCase()}`}
```

#### Gap 5: `SupplierHistoryTable` action column is too narrow for two buttons

Currently one Trash button. Adding RotateCcw beside it needs space. The column must either grow or the two buttons must be placed in a compact `flex gap-1` container. Without this, the buttons will overflow.

**Fix (included in Unit C):** Use `flex gap-1 justify-center` wrapper inside the actions `<td>` — matches how `PurchaseLog.tsx` handles its multi-button action column.

---

### Design Consistency Check

| Element | `PurchaseLog.tsx` | `SupplierHistoryTable.tsx` | Consistent after fix? |
|---------|------------------|--------------------------|---------------------|
| Partial return button | RotateCcw, orange, ghost | RotateCcw, orange, ghost (to add) | ✅ |
| Void button | Trash, rose, ghost | Trash, red, rounded-lg | ⚠️ Minor variant diff — acceptable |
| Disabled state | opacity + `cursor-not-allowed` | `cursor-not-allowed` class | ✅ |
| Reason dialog before void | ✅ `<ReasonDialog>` | ❌ Hardcoded — future work | ❌ Noted |
| Post-action refresh | `router.refresh()` | `router.refresh()` (to add) | ✅ |

---

## Outstanding Gaps (Out of Scope — Future Work)

These were identified during the audit but are explicitly **excluded from this plan** to keep scope tight:

| # | Gap | Priority |
|---|-----|----------|
| F1 | `SupplierHistoryTable` void has no `<ReasonDialog>` → audit log reason is always hardcoded | Medium |
| F2 | `PartialReturnPurchaseDialog` shows UUID prefix in header instead of invoice number | Low |
| F3 | No visual `PARTIAL_RETURN` badge / progress indicator on supplier ledger rows | Low |
| F4 | `PurchaseLog.tsx` `exportToExcel` is a stub (`toast.info` only) — not implemented | Medium |
| F5 | `ReturnCart.tsx` (locale-based return flow) duplicates partial return logic — deduplication opportunity | Low |
| F6 | Supplier ledger running balance uses native JS float arithmetic (`currentBalance += tx.amount`) → rounding error accumulates over 100+ transactions | High (separate hardening sprint) |
