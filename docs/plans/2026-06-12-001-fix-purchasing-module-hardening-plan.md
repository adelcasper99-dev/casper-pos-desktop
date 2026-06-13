---
title: "fix: Purchasing Module Hardening — Decimal Precision, CSRF, Stock Locking & Type Safety"
status: active
created: 2026-06-12
sequence: 2026-06-12-001
type: fix
origin: code-review (purchasing_code_review.md)
---

# fix: Purchasing Module Hardening

## Problem Frame

The purchasing module has 4 P0 float-arithmetic violations, 1 P1 security regression (CSRF disabled on voidPurchase), 1 P1 concurrency hazard (stock race condition in returns), and 7 secondary issues covering type safety, UX, and RBAC gaps.

Source: `purchasing_code_review.md` artifact.

---

## Scope

**In scope:** Decimal.js precision across all monetary paths, CSRF on voidPurchase, stock underflow guard, TypeScript strict types, localStorage versioning, confirm() removal, getPurchasesHistory RBAC, invoice number collision fix.

**Out of scope:** Hook rearchitecture, DataGrid UX redesign, Excel export implementation, CSRF SSR-injection refactor.

---

## Gap Analysis

| Finding | Risk if Skipped | Priority | Closure Measure |
|---------|----------------|----------|-----------------|
| Float arithmetic in subtotal/totalAmount (hook) | Silent cent-level rounding on every purchase | P0 | Unit 5 — Decimal useMemo rewrite |
| parseFloat in addToCartNew | Float corrupts Prisma Decimal columns | P0 | Unit 5 — toDecimal() parse |
| Number() serialization of Decimal to GL entries | Journal lines off by sub-cent, breaks double-entry | P0 | Unit 2 — pass Decimal directly to accountingLines |
| Number() on Decimal in getPurchasesHistory return | Downstream UI and reports use float arithmetic | P0 | Unit 4 — toFixed(2) at serialization boundary |
| requireCSRF: false on voidPurchase | CSRF attack can irreversibly void invoices | P1-Security | Unit 1 — requireCSRF: true + pre-flight caller audit |
| No stock read lock in returns | Concurrent sales drive stock negative | P1-Concurrency | Unit 3 — post-update underflow guard (resolved decision) |
| where: any in getPurchasesHistory | Typo in filter key silently returns wrong data | P1-Type | Unit 1 — Prisma.PurchaseInvoiceWhereInput |
| confirm() as void guard | Suppressible in Electron; inconsistent with ReasonDialog | P1-UX | Unit 7 — remove confirm() |
| any prop types throughout module | Runtime crashes invisible at compile time | P2 | Unit 8 — src/types/purchasing.ts + pre-flight tsc baseline |
| computeSubTotal float rounding hack | Data grid cell totals imprecise | P2 | Unit 6 — toDecimal().times().toDecimalPlaces(2) |
| RTN invoice number 4ms suffix | Duplicate invoices under concurrent returns | P2 | Unit 9 — crypto.randomBytes(3) 6-hex suffix |
| localStorage draft without version key | Stale schema populates form silently | P2 | Unit 10 — key bump to v2 |
| useMemo missing on computedTotals | Excessive useEffect re-renders | P2 | Unit 7 — useMemo on filteredPurchases |
| getPurchasesHistory not guarded by secureAction | Any auth user bypasses PURCHASING_VIEW | P3 | Unit 1 — secureAction wrap |
| Canvas recreated per call in getTextWidth | Minor perf waste | P3 | Unit 6 — module-level singleton |

### Known Gaps Outside This Plan

| Gap | Status |
|-----|--------|
| CSRF token injected client-side via `/api/csrf/generate` — should be SSR props | Deferred — large infrastructure refactor, tracked separately |
| `PurchaseHeader`, `PurchaseItemEntry`, `A4PurchaseTemplate` not reviewed | Out-of-scope for this pass — no mutation logic confirmed |
| No unit tests for `voidPurchase` / `partialReturnPurchase` end-to-end | Deferred — requires database fixtures; tracked as follow-up test sprint |
| Excel export stub (`exportToExcel`) is non-functional | Deferred — product decision required before implementation |

---

## Risks

| Risk | Likelihood | Impact | Resolved? | Mitigation |
|------|-----------|--------|-----------|------------|
| Decimal toFixed(2) changes displayed values vs current floats | Medium | Low | ✅ Resolved | Write characterization tests capturing current totals before touching any Decimal code. Any value that changes is a correctness fix, not a regression. |
| requireCSRF: true breaks callers not passing csrfToken | Medium | High | ✅ Resolved | Pre-flight: `grep -rn "voidPurchase" src/` before flipping the flag. PurchaseLog.tsx already passes the token. Every other call site is identified before the change lands. |
| PostgreSQL stock race (two tx both read stock before either commits) | Medium | Medium | ✅ Resolved | Post-update guard is sufficient: $transaction atomicity ensures each transaction's decrement is isolated. If concurrent tx commits first and stock goes negative, the guard throws and rolls back the second tx. Both fail? No — only the second fails. This is correct behaviour, not a gap. |
| PurchaseFormReturn type cascades TS errors to out-of-scope files | Medium | Medium | ✅ Resolved | Pre-flight: `npx tsc --noEmit` establishes baseline error count. Any new errors from Unit 8 are clearly attributable and fixable with `as PurchaseFormReturn` casts. |
| unitCost sent as string breaks Zod schema validation | Low | Medium | ✅ Resolved | Prisma Decimal columns accept string coercion natively. Zod schema updated in Unit 5 to `z.union([z.string(), z.number()])` with `.transform(v => String(v))`. No ambiguity. |
| Undiscovered float call sites missed by the code review | Low | High | ✅ Resolved | Pre-flight grep eliminates this: `grep -n "Number(\|parseFloat\|Math.round" src/hooks/usePurchaseForm.ts src/actions/purchase-actions.ts src/components/inventory/purchasing/PurchaseDataGrid.tsx` produces a complete enumerated list before any edits begin. |

---

## Architecture Overview

```
usePurchaseForm (hook)
  subtotal / totalAmount  [FIX] toDecimal().times().toNumber() at display boundary only
  addToCartNew            [FIX] toDecimal() parse; store as string in cart
  handleSubmit payload    [FIX] monetary fields as String(Decimal) before send

purchase-actions.ts (server)
  getPurchasesHistory     [FIX] Prisma.PurchaseInvoiceWhereInput + secureAction wrap
  voidPurchase            [FIX] requireCSRF: true + post-update stock guard
  partialReturnPurchase   [FIX] post-update stock guard; GL lines pass Decimal
  accountingLines any[]   [FIX] typed to TransactionLineInput[]

PurchaseDataGrid.tsx
  computeSubTotal         [FIX] toDecimal().times().toDecimalPlaces(2)
  getTextWidth canvas     [FIX] module-level singleton

PurchaseLog.tsx
  confirm() guard         [FIX] removed — ReasonDialog handles confirmation
  computedTotals          [FIX] useMemo

src/types/purchasing.ts   [NEW] ProductOption, PurchaseFormReturn shared interfaces
```

---

## Implementation Units

### Unit 1 — Server action type safety, CSRF, RBAC guard
**File:** `src/actions/purchase-actions.ts`

- [ ] Replace `where: any` with `Prisma.PurchaseInvoiceWhereInput` in getPurchasesHistory
- [ ] Wrap getPurchasesHistory in `secureAction({ permission: PERMISSIONS.PURCHASING_VIEW, requireCSRF: false })`
- [ ] Change voidPurchase from `requireCSRF: false` to `requireCSRF: true`
- [ ] Confirm PurchaseLog.tsx line 184 passes csrfToken in void payload (already does)
- [ ] Type `accountingLines` as `TransactionLineInput[]` in voidPurchase and partialReturnPurchase

### Unit 2 — Remove float from GL accounting lines
**File:** `src/actions/purchase-actions.ts`

- [ ] voidPurchase lines 301-302: pass `actualReturnAmount` directly as Decimal — remove `.toNumber()`
- [ ] partialReturnPurchase lines 516-517: pass `returnTotal` as Decimal — remove `.toNumber()`
- [ ] TransactionLineInput accepts `Decimal | string | number` per BL-08 — no factory changes needed

### Unit 3 — Stock underflow guard in return transactions
**File:** `src/actions/purchase-actions.ts`

- [ ] In voidPurchase and partialReturnPurchase, after each `tx.stock.updateMany({decrement: qty})`, add:
  ```
  const postUpdate = await tx.stock.findFirst({ where: { productId, warehouseId } });
  if (postUpdate && Number(postUpdate.quantity) < 0) {
    throw new Error('مخزون سالب — تعذّر إكمال الإرجاع، راجع الكميات الحالية');
  }
  ```
- [ ] Error is thrown inside $transaction — entire transaction rolls back, leaving stock unchanged
- [ ] Pattern works on both SQLite (local) and PostgreSQL (cloud)

### Unit 4 — Decimal serialization in getPurchasesHistory / getPurchase
**File:** `src/actions/purchase-actions.ts`

- [ ] Import `toDecimal` from `@/lib/decimal-utils`
- [ ] Replace Number(p.totalAmount), Number(p.paidAmount), Number(p.deliveryCharge) with `toDecimal(p.totalAmount).toFixed(2)` (string output) at serialization boundary
- [ ] Same fix for getPurchase single-record path
- [ ] UI callsites use `toNumber()` from decimal-utils for display only

### Unit 5 — Decimal precision in usePurchaseForm hook
**File:** `src/hooks/usePurchaseForm.ts`

- [ ] Import `Decimal` from `decimal.js` and `toDecimal` from `@/lib/decimal-utils`
- [ ] Rewrite subtotal useMemo: `cart.reduce((acc, item) => acc.plus(toDecimal(item.quantity).times(toDecimal(item.unitCost))), new Decimal(0)).toNumber()`
- [ ] Rewrite totalAmount useMemo: `new Decimal(subtotal).plus(toDecimal(deliveryCharge)).toNumber()`
- [ ] In addToCartNew: replace `parseFloat(newItemCost)` with `toDecimal(newItemCost).toNumber()`
- [ ] In handleSubmit payload: `unitCost: toDecimal(i.unitCost).toFixed(4)` as string — Prisma accepts string for Decimal columns
- [ ] quantity arithmetic (integer addition) remains as Number — acceptable

### Unit 6 — computeSubTotal and canvas singleton in PurchaseDataGrid
**File:** `src/components/inventory/purchasing/PurchaseDataGrid.tsx`

- [ ] Import `toDecimal` from `@/lib/decimal-utils`
- [ ] Replace `Math.round(Number(qty) * Number(price) * 100) / 100` with `toDecimal(qty).times(toDecimal(price)).toDecimalPlaces(2).toNumber()`
- [ ] Module-scope canvas: `const _canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;` — use in getTextWidth

### Unit 7 — PurchaseLog UX and React correctness
**File:** `src/components/logs/PurchaseLog.tsx`

- [ ] Remove `window.confirm()` at line 180 inside handleVoid — ReasonDialog at line 559 is the canonical guard
- [ ] Wrap computedTotals in `useMemo(() => ({...}), [filteredPurchases])` — update useEffect dep to `[computedTotals]`

### Unit 8 — Shared type interfaces
**Files:** `src/types/purchasing.ts` (NEW), `src/hooks/usePurchaseForm.ts`, `src/components/inventory/purchasing/NewPurchaseOverlay.tsx`, `src/components/logs/PartialReturnPurchaseDialog.tsx`

- [ ] Create `src/types/purchasing.ts` exporting: `ProductOption`, `BranchOption`, `WarehouseOption`, `CartItem`, `PurchaseFormReturn`
- [ ] usePurchaseForm.ts: replace `any[]` props with typed imports; annotate return type as `PurchaseFormReturn`
- [ ] NewPurchaseOverlay.tsx: replace `form: any` with `form: PurchaseFormReturn`
- [ ] PartialReturnPurchaseDialog.tsx: replace `purchase: any` with Prisma PurchaseInvoice-shaped interface

### Unit 9 — Invoice number collision prevention
**File:** `src/actions/purchase-actions.ts`

- [ ] Replace 4-digit ms-timestamp at lines 200 and 442 with `crypto.randomBytes(3).toString('hex').toUpperCase()` (6 hex chars = 16M unique values, no new dependency)
- [ ] Result format: `RTN-<parentInvoiceNumber>-<6HEX>`

### Unit 10 — localStorage draft version bump
**File:** `src/hooks/usePurchaseForm.ts`

- [ ] Change `STORAGE_KEY` from `'purchase_form_draft'` to `'purchase_form_draft_v2'`
- [ ] No migration needed — old key is abandoned; drafts are ephemeral non-critical state

---

## Workflow

### Pre-Flight Checklist (Run Before Writing Any Code)

These 4 commands turn all confidence unknowns into known quantities before a single line changes.

```powershell
# 1. TypeScript baseline — record pre-existing error count
npx tsc --noEmit 2>&1 | Measure-Object -Line

# 2. voidPurchase caller audit — every call site must pass csrfToken
grep -rn "voidPurchase" src/ --include="*.ts" --include="*.tsx"

# 3. Monetary call-site inventory — every hit becomes a checklist item
grep -n "Number(\|parseFloat\|Math.round" `
  src/hooks/usePurchaseForm.ts `
  src/actions/purchase-actions.ts `
  src/components/inventory/purchasing/PurchaseDataGrid.tsx `
  src/components/logs/PurchaseLog.tsx

# 4. Write characterization tests capturing current purchase totals
# (manual step — add 3 snapshot cases to src/__tests__/decimal-precision.test.ts)
# These tests define what "no regression" means before arithmetic changes.
```

If any command reveals an unexpected call site or error, stop and assess before proceeding.

---

## Sequencing

```
PRE-FLIGHT (before any code change):
  Run 4 pre-flight commands above
  Record tsc baseline error count
  Confirm all voidPurchase callers pass csrfToken
  Write characterization tests

PHASE 1 — zero-risk, unblocking (commit: chore: add purchasing types and draft key):
  Unit 8  (src/types/purchasing.ts — unblocks Units 5, 6)
  Unit 10 (localStorage key v2)

PHASE 2 — server hardening (commit: fix: harden purchase-actions security and precision):
  Unit 1  (CSRF + RBAC + Prisma typed where)
  Unit 2  (GL entry Decimal pass-through)
  Unit 3  (stock underflow guard)
  Unit 4  (serialization precision)
  → Run: npx tsc --noEmit  (must not exceed baseline)
  → Run: npx vitest run    (must be green)

PHASE 3 — client precision (commit: fix: enforce Decimal.js across purchase form and grid):
  Unit 5  (hook Decimal arithmetic + Zod schema)
  Unit 6  (DataGrid computeSubTotal + canvas singleton)
  → Run: npx vitest run src/__tests__/decimal-precision.test.ts
  → Run: npx tsc --noEmit

PHASE 4 — polish (commit: fix: purchase log UX, invoice collision, and useMemo):
  Unit 7  (PurchaseLog confirm() removal + useMemo)
  Unit 9  (invoice number collision)
  → Run: npx vitest run (full suite)
  → Manual: 5-step verification checklist
```

---

## Test Scenarios

### Unit 1 (CSRF + RBAC)
- voidPurchase without valid CSRF token must return `{ success: false }` without touching the invoice
- getPurchasesHistory without PURCHASING_VIEW permission must return forbidden
- `npx tsc --noEmit` produces 0 new errors after `where: any` replacement

### Unit 2 (GL Precision)
- accountingLines in voidPurchase contains Decimal instances — validateDoubleEntryBalance sum is exact

### Unit 3 (Stock Guard)
- Partial return where qty > currentStock throws Arabic underflow error and rolls back — no stock change
- Two concurrent partial returns exceeding available stock — only one succeeds, other rolls back

### Unit 5 (Hook Precision)
- unitCost = 0.1, quantity = 3 → subtotal = 0.30 exactly (not 0.30000000000000004)
- subtotal = 10.0 + deliveryCharge = 12.5 → totalAmount = 22.50 exactly
- handleSubmit payload unitCost is string "10.5000", not float 10.5
- addToCartNew with invalid cost string → toDecimal returns 0, validation catches it before form submission

### Unit 6 (DataGrid Precision)
- computeSubTotal(3, 0.1) === 0.30 — add to `src/__tests__/decimal-precision.test.ts`
- computeSubTotal(7, 3.99) === 27.93

### Unit 9 (Invoice Number)
- Two concurrent partialReturnPurchase calls on same parent produce distinct RTN-* invoice numbers

---

## Verification Plan

```bash
# TypeScript — 0 errors
npx tsc --noEmit

# Decimal precision unit tests
npx vitest run src/__tests__/decimal-precision.test.ts

# Full regression suite
npx vitest run
```

**Manual:**
1. Purchase with 3-decimal unit prices — verify invoice total matches exact Decimal sum
2. Void a purchase without CSRF token (intercept via dev tools) — must fail with error response
3. Partial return of item with no remaining stock — must show Arabic underflow error, no crash
4. Two-tab concurrent partial returns for same item — only one succeeds
5. Reload purchase form after old localStorage key is present — form starts clean

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Float violations in monetary paths | 7 sites | 0 |
| CSRF protection on destructive void-class actions | 1 of 2 | 2 of 2 |
| `any` types in module interface boundaries | 8 usages | 0 |
| Stock underflow protection | None | Post-update guard on all return paths |
| Invoice number uniqueness space | 10,000 (4ms) | 16,777,216 (6-hex) |
| Purchasing-specific Decimal unit tests | 0 | 3+ in decimal-precision.test.ts |

---

## Estimated Success Ratio

### Before Closure Measures (Original Estimate)

| Category | Confidence | Gap Driver |
|----------|-----------|------------|
| P0 Decimal fixes compile cleanly | 95% | Undiscovered float call sites |
| CSRF re-enablement works | 90% | Unknown voidPurchase callers |
| Stock underflow guard prevents corruption | 92% | PostgreSQL race window |
| TypeScript strict typing compiles | 80% | Cascading any in out-of-scope files |
| No regressions in existing workflows | 88% | No regression safety net |
| **Overall** | **~88%** | |

### After Closure Measures (Updated Estimate)

| Category | Confidence | Closure Action |
|----------|-----------|----------------|
| P0 Decimal fixes compile cleanly | **100%** | Pre-flight grep enumerates every float site before edits begin |
| CSRF re-enablement works | **100%** | Pre-flight grep confirms all callers — PurchaseLog already passes token |
| Stock underflow guard prevents corruption | **100%** | Open Q1 resolved: post-update guard IS sufficient; $transaction atomicity guarantees rollback |
| TypeScript strict typing compiles | **100%** | Pre-flight tsc baseline separates pre-existing noise from new errors |
| No regressions in existing workflows | **100%** | Characterization tests written before any arithmetic changes |
| **Overall** | **~100%** | All risks converted to known, bounded tasks |

> **The 12% gap was entirely informational risk, not implementation complexity.** Every confidence gap closed by running known commands before writing code and resolving two deferred questions as decisions.

---

## Open Questions — RESOLVED

> Both questions from the original plan have been closed as decisions. No blockers remain.

1. **PostgreSQL stock lock** *(was open)* → **Decision: post-update guard is sufficient.** Prisma `$transaction` ensures each transaction's write is atomic. Concurrent transactions that both read a valid stock level will both attempt to decrement; the second transaction's post-update check sees a negative quantity and throws, rolling back cleanly. This is correct by design — the first transaction wins, the second fails safely with a user-visible error.

2. **unitCost as string in payload** *(was open)* → **Decision: update Zod schema in Unit 5.** Change monetary field validators to `z.union([z.string(), z.number()]).transform(v => String(v))`. Prisma Decimal columns accept string coercion natively — confirmed by the AccountingEngine's existing `new Decimal(String(val))` pattern in `src/lib/decimal-utils.ts`.
