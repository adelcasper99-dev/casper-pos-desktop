---
title: "fix: Architecture Audit Hardening — 33 Findings Resolution"
date: 2026-06-27
updated: 2026-06-28
status: active
priority: critical
origin: casper_audit_report.md (2026-06-27 deep audit)
adversarial_review: plan_adversarial_review.md (2026-06-28, 14 gaps corrected)
---

# fix: Architecture Audit Hardening — 33 Findings Resolution

## Problem Frame

A comprehensive deep audit of the Casper POS & ERP codebase surfaced **33 findings** across four severity tiers:
- **4 Critical** — financial integrity blockers (duplicate GL entries, wrong reversal lookup, Float precision, payroll race condition)
- **11 High** — commission accuracy, enum enforcement, phantom COGS, parallel sync FK violations
- **11 Bloat** — dead code, ghost models, inflated Electron bundle
- **7 Missing** — required guards, links, and server-side enforcements

Incorporates all 14 corrections from adversarial review (2026-06-28). Previous success probability: 68%. Revised: ~90%.

---

## Scope Boundaries

**In scope:**
- All files cited in the audit report (schema, actions, lib, components, electron)
- `prisma/schema.prisma` migrations for type corrections
- `package.json` dependency classification

**Out of scope:**
- Adding new features beyond what the audit explicitly requires
- Changing the UI design/layout beyond blind-close server-side enforcement
- `Partner`/`PartnerTransaction` schema — confirmed active feature plan (do not touch)
- `SparePart` module removal — user decision: keep module, fix precision only

---

## Sprint Map

```
Phase 0 (PRE-SPRINT — Mandatory Blockers, no code until all 5 done)
  P0.1  Grep closeShift → confirm exact file path
  P0.2  Audit JournalEntry FK columns in schema.prisma
  P0.3  Verify GL 5300 exists in DEFAULT_ACCOUNTS
  P0.4  [NEW] src/lib/rate-limit.ts — create utility
  P0.5  Add JE balance assertion to recordTicketDistribution()

Sprint 1 (CRITICAL — Financial Integrity)
  S1.1  lossSharePercentage Float → Decimal + NaN pre-clean
  S1.2  AutoJournalService idempotency keys [after P0.5]
  S1.3  FinancialReversalService FK-scoped reversal [after P0.2]
  S1.4  settleTechnicianPayroll race condition fix [after P0.4]

Sprint 2 (HIGH — Schema & Commission Correctness)
  S2.1  Ticket.paymentStatus — Zod enum + PostgreSQL-only CHECK
  S2.2  CommissionRule FIXED type validator alignment
  S2.3  RepairPayment → JournalEntry FK link [after S1.2]
  S2.4  TicketPart phantom COGS correction [after P0.3 + S2.1]

Sprint 3 (HIGH — Sync & Shift Integrity)
  S3.1  SyncService sequential flush + DB-state gating
  S3.2  DLQ escalation audit across all 5 sync modules [after S3.1]
  S3.3  Blind Close: server-side expected cash + confirmation UX [after P0.1]
  S3.4  ShiftPromptModal parseFloat → Decimal

Sprint 4 (CLEANUP — Dead Code & Schema)
  S4.1  SparePart price fields String → Decimal (harden, NOT remove)
  S4.2  [SKIP] Partner/PartnerTransaction — active plan, do not touch
  S4.3  AutoJournalService orphaned methods → @deprecated
  S4.4  Root-level debug/test script purge + .gitignore update
  S4.5  package.json dependency reclassification
  S4.6  [NEW] DeviceMovement — TODO comment (zero src refs, promoted from S5.3)
  S4.7  [NEW] TechnicianPerformance — DROP TABLE (zero src refs, promoted from S5.4)

Sprint 5 (MISSING — Remaining Guards)
  S5.1  StockMovement.branchId non-nullable (corrected search strategy)
  S5.2  Rate limiter — covered by P0.4 + S1.4
```

---

## Phase 0: Pre-Sprint — Mandatory Blockers

> [!CAUTION]
> No Sprint 1 code may be written until all 5 Phase 0 items are resolved. Each is a blocker that causes mid-sprint compile or runtime failure.

### P0.1 — Confirm `closeShift` File Location

**Why:** S3.3 scope depends on this. Could be a Server Action, API route, or inline component — refactor blast radius differs significantly.

**Action:** `grep -r "closeShift\|export.*closeShift" src/ --include="*.ts" --include="*.tsx" -l`

**Deliverable:** Update S3.3 file list with the confirmed exact path before writing any code.

---

### P0.2 — Audit `JournalEntry` FK Columns in Schema

**Why:** S1.3 rewrites the reversal lookup to use typed FK columns (`saleId`, `ticketId`, etc.). If these don't exist on `JournalEntry`, migrations must be added first — a dependency not in the original plan.

**Action:** Open `prisma/schema.prisma`, locate `model JournalEntry`, list all FK columns present. Add any missing ones as a migration before S1.3.

**Deliverable:** Confirmed FK column list; migration authored if needed.

---

### P0.3 — Verify GL 5300 in `DEFAULT_ACCOUNTS`

**Why:** S2.4 routes untracked part costs to GL 5300. If missing, `getAccountId(tx, GL.EXPENSES.OTHER)` throws at runtime on every ticket with a manual part.

**Action:** Search `src/lib/accounting/constants.ts` for code `'5300'` or `GL.EXPENSES.OTHER`.

**Deliverable:** Confirmed it exists, or add `{ code: '5300', name: 'Other Operating Expenses', type: EXPENSE, isSystem: true }` as a pre-step to S2.4.

---

### P0.4 — `[NEW]` Create `src/lib/rate-limit.ts`

**Why:** S1.4 imports `rateLimit()` from this file. It does not exist. Without it, the import fails and rate-limit protection is silently skipped.

**File:** `src/lib/rate-limit.ts`
```typescript
const store = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(
  action: string,
  entityId: string,
  opts: { windowMs: number; max: number }
): Promise<void> {
  const key = `${action}:${entityId}`;
  const now = Date.now();
  const entry = store.get(key);
  if (entry && now < entry.resetAt) {
    if (entry.count >= opts.max) {
      throw new Error(
        `RATE_LIMITED: ${action} for ${entityId}. Retry after ${Math.ceil((entry.resetAt - now) / 1000)}s`
      );
    }
    entry.count++;
  } else {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
  }
}
```
> Per-process, in-memory. Acceptable for single-instance Next.js Server Actions. Replace with Redis if distributed deployment required.

---

### P0.5 — Add JE Balance Assertion to `recordTicketDistribution()`

**Why:** The method creates `DEBIT amount` vs `CREDIT (techBilling + techComm + centerProfit)`. This equality is never asserted. S1.2 would idempotently protect an already-unbalanced entry.

**File:** `src/lib/accounting/auto-journal-service.ts` — inside `recordTicketDistribution()`, before `tx.journalEntry.create()`:
```typescript
const creditSum = techBilling.plus(techComm).plus(centerProfit);
if (!creditSum.equals(amount)) {
  throw new Error(
    `[JE-BALANCE] Ticket ${params.barcode}: debit=${amount.toFixed(4)}, ` +
    `credits=${creditSum.toFixed(4)}, diff=${amount.minus(creditSum).toFixed(4)}`
  );
}
```

---

## Sprint 1: Critical — Financial Integrity

> All four S1 units must be completed and verified before Sprint 2 begins.

### S1.1 — `Technician.lossSharePercentage`: Float → Decimal

**Findings:** #3, #31 | **Risk:** Float drift + NaN blocks Electron startup

**Pre-migration NaN cleanup (run before ALTER COLUMN):**
```sql
UPDATE "Technician"
SET "lossSharePercentage" = 0
WHERE "lossSharePercentage" IS NULL
   OR "lossSharePercentage" != "lossSharePercentage";
```

**Files:**
- `prisma/schema.prisma` — `lossSharePercentage Float @default(0)` → `Decimal @default(0.00)`
- `prisma/migrations/` — two-step: (1) NaN cleanup SQL, (2) `ALTER COLUMN TYPE DECIMAL(10,4) USING ROUND(CAST(...) AS NUMERIC, 4)`
- `src/actions/ticket-actions.ts` — remove `Number(tech.lossSharePercentage)` coercions; consume as `Decimal` directly

**[NEW] Test file:** `src/__tests__/schema/loss-share-migration.test.ts`

**Test scenarios:**
- `lossSharePercentage = 0.3` → `netLoss * 0.3` with no `.00000004` drift
- `lossSharePercentage = 0` → no deduction created
- `lossSharePercentage = NaN` (seeded) → pre-cleanup sets to `0`; migration succeeds
- Rollback → column reverts with values preserved

---

### S1.2 — `AutoJournalService`: idempotencyKey on All Payment Methods

**Findings:** #5, #25 | **Dependency:** P0.5 complete first | **Risk:** Duplicate GL entries on retry

**Files:**
- `src/lib/accounting/auto-journal-service.ts` — add `idempotencyKey` param to `recordTicketDistribution()`, `recordCustomerPayment()`, `recordCustomerReceipt()`, `recordSupplierPayment()`
- `src/actions/ticket-actions.ts` — pass `idempotencyKey: \`TICKET_DIST_${ticketId}\``
- `src/lib/accounting/transaction-factory.ts` — verify key propagates to `journalEntry.create`

**Key scheme:**
```
recordTicketDistribution  → TICKET_DIST_{ticketId}
recordCustomerPayment     → CUST_PAY_{customerTransactionId}
recordCustomerReceipt     → CUST_REC_{customerTransactionId}
recordSupplierPayment     → SUPP_PAY_{supplierPaymentId}
```

**On P2002:** catch → return existing entry as success.

**[NEW] Test file:** `src/__tests__/accounting/auto-journal-idempotency.test.ts`

**Test scenarios:**
- `recordTicketDistribution()` called twice → single GL entry
- `sum(debit) === sum(credit)` on JE after retry
- Every `JournalEntry` has non-null `idempotencyKey`

---

### S1.3 — `FinancialReversalService`: FK-Scoped Reversal Lookup

**Finding:** #6 | **Dependency:** P0.2 complete first | **Risk:** String match voids wrong JE

**Pre-step:** If P0.2 found missing FK columns, add migration before this unit.

**Files:**
- `src/lib/financial-reversal-service.ts` — rewrite `reverseAccountingEntries()` with `entryType` param:
  ```
  SALE      → { saleId: referenceId }
  TICKET    → { ticketId: referenceId }
  EMPLOYEE  → { employeeTransactionId: referenceId }
  SUPPLIER  → { supplierPaymentId: referenceId }
  CUSTOMER  → { customerTransactionId: referenceId }
  EXPENSE   → { expenseId: referenceId }
  ```
- `src/actions/ticket-actions.ts`, `hr.ts`, `hr-profile.ts` — pass correct `entryType` at each call site

**[NEW] Test file:** `src/__tests__/accounting/financial-reversal-service.test.ts`

**Test scenarios:**
- Ticket + Sale sharing same UUID: reversal of Ticket JE does not touch Sale JE
- `fullReversal()` on deleted ticket → only `ticketId`-scoped entries voided
- No matching entry → log warning, do not throw

---

### S1.4 — `settleTechnicianPayroll`: Idempotency Inside Transaction + Rate Limit

**Findings:** #29, #32 | **Dependency:** P0.4 complete first | **Risk:** Concurrent admin race

**Files:**
- `src/lib/rate-limit.ts` — [NEW], created in P0.4
- `src/actions/technician-payroll-actions.ts`:
  1. Add `await rateLimit('SETTLE_TECH_PAYROLL', technicianId, { windowMs: 30000, max: 1 })` at top
  2. Remove pre-transaction `findUnique` idempotency check (lines 167–173)
  3. Inside `$transaction`: `tx.transaction.upsert({ where: { idempotencyKey }, create: { ...data }, update: {} })`
  4. Catch `P2002` → return `{ success: true, alreadySettled: true }`

> **SQLite:** Prisma `upsert` is supported on SQLite — safe for the offline Electron node.

**[NEW] Test file:** `src/__tests__/payroll/technician-payroll-idempotency.test.ts`

**Test scenarios:**
- Two concurrent calls → single treasury deduction, single `EmployeeTransaction`
- Single call → treasury decremented, audit log created
- Rate limit blocks second call within 30 s → user-friendly error, no DB write

---

## Sprint 2: High — Schema & Commission Correctness

### S2.1 — `Ticket.paymentStatus`: Zod Enum + PostgreSQL-Only CHECK

**Findings:** #1, #10, #23 | **Risk:** Case mismatch silently kills commission dispatch

> [!WARNING]
> **SQLite safety:** `ALTER TABLE ADD CONSTRAINT NOT VALID` is PostgreSQL-only. SQLite does not support it. DB-level CHECK targets PostgreSQL cloud only. Enforcement on the offline Electron node is via Zod at the action layer.

**Files:**
- `src/lib/constants.ts` — `export const PaymentStatus = { UNPAID: 'unpaid', PARTIAL: 'partial', PAID: 'paid' } as const`
- `src/lib/validation/ticket.ts` — `z.enum(['unpaid', 'partial', 'paid'])` (primary enforcement — both environments)
- `prisma/migrations/` — PostgreSQL-only migration:
  ```sql
  -- Pre-flight: normalize any bad casing
  UPDATE "Ticket" SET payment_status = LOWER(payment_status)
    WHERE payment_status NOT IN ('unpaid','partial','paid');
  -- Add CHECK (non-locking strategy)
  ALTER TABLE "Ticket"
    ADD CONSTRAINT "chk_payment_status"
    CHECK (payment_status IN ('unpaid','partial','paid')) NOT VALID;
  -- Validate async (background, does not lock table)
  ALTER TABLE "Ticket" VALIDATE CONSTRAINT "chk_payment_status";
  ```
  Wrap in provider check: only execute on `postgresql` datasource.
- `src/actions/ticket-actions.ts` — replace ~20 string literals with `PaymentStatus.*`
- `src/actions/hr-profile.ts`, `hr.ts` — same replacement

**Test scenarios:**
- Insert `paymentStatus = 'Paid'` via Prisma Studio → cloud DB rejects; Zod rejects at action layer
- Commission ledger in `hr-profile.ts` picks up `PaymentStatus.PAID` correctly
- Partial payment → `PaymentStatus.PARTIAL`; full → `PaymentStatus.PAID`

---

### S2.2 — `CommissionRule` FIXED Type: Align Validator with Resolver

**Finding:** #7 | **Risk:** `validateCommissionData()` always throws for FIXED-rule technicians

**Files:**
- `src/lib/commission-validation.ts`:
  - `validateCommissionData()` — add `ruleType` param; when `FIXED`, verify `commissionAmount === fixedValue` (±0.01 tolerance); skip `netProfit * rate` check
  - `formatCommissionBreakdown()` — label `Fixed: ${commissionAmount}` when FIXED

**Test scenarios:**
- FIXED rule, value 500 → `valid: true`
- PERCENTAGE rule → existing behavior unchanged
- Breakdown label reads "Fixed: 500"

---

### S2.3 — `RepairPayment → JournalEntry` FK Link

**Findings:** #9, #24 | **Dependency:** S1.2 complete first

**Files:**
- `prisma/schema.prisma` — add `journalEntryId String? @unique` + relation on `RepairPayment`; back-relation on `JournalEntry`
- `prisma/migrations/` — `ALTER TABLE "RepairPayment" ADD COLUMN "journalEntryId" TEXT UNIQUE`
- `src/actions/ticket-actions.ts` (`processTicketPayment`) — thread `JournalEntry.id` from `AccountingEngine.recordMaintenancePayment()` into `repairPayment.create`
- `src/lib/accounting/transaction-factory.ts` — verify `recordMaintenancePayment()` returns the created `JournalEntry`

**Test scenarios:**
- Full payment → `RepairPayment.journalEntryId` non-null, correct JE
- Each partial → own linked JE
- Refund `RepairPayment` → links to reversal JE

---

### S2.4 — `TicketPart` Manual Parts: Phantom COGS Fix

**Finding:** #11 | **Dependency:** P0.3 (GL 5300 verified) + S2.1 (PaymentStatus in scope)

**Files:**
- `src/actions/ticket-actions.ts` (in `recordMaintenanceCOGS()` path):
  ```typescript
  const trackedCost = parts.filter(p => p.productId != null).reduce(sum, Decimal(0));
  const untrackedCost = parts.filter(p => p.productId == null).reduce(sum, Decimal(0));
  // Only trackedCost → GL 1200 (Inventory credit)
  // untrackedCost → GL 5300 (Other Expenses)
  ```

**Test scenarios:**
- 1 tracked + 1 manual part → GL 1200 credit = tracked cost only; GL 5300 entry for manual cost
- Only manual parts → no inventory credit; GL 5300 expense created
- Only tracked parts → existing behavior unchanged

---

## Sprint 3: High — Sync & Shift Integrity

### S3.1 — `SyncService.syncAll`: Sequential Flush + DB-State Gating

**Findings:** #22, #26 | **Risk:** Returns sync before parent Sale → cloud FK violation

**Files:**
- `src/lib/sync-service.ts` — replace `Promise.allSettled` with sequential `for...of`

**Flush order:** Sales → Tickets → Treasury → Inventory → Returns

**Failure gating — DB-derived (stateless, restart-safe):**
```typescript
// In syncReturns() pre-flight, before any sync attempt:
const orphaned = await db.saleReturn.findFirst({
  where: { syncStatus: 'PENDING', sale: { syncStatus: { not: 'SYNCED' } } }
});
if (orphaned) {
  logger.warn('[Sync] Skipping Returns: parent Sales not yet synced');
  return { skipped: true, reason: 'PARENT_SALE_PENDING' };
}
```
This replaces the original in-memory `salesSyncFailed` flag (which was lost on process crash).

**Performance note:** Sequential sync: total time = `t₁+t₂+t₃+t₄+t₅` vs. old parallel `max(t₁..t₅)`. Document against `SyncWorker` interval to confirm no cycle overlap.

**Test scenarios:**
- Offline Sale + Return → Sale in cloud before Return attempted
- Process crash mid-sync, restart → DB pre-flight correctly skips Returns
- Full success → all 5 modules report 0 failures

---

### S3.2 — DLQ Escalation Audit Across All 5 Sync Modules

**Finding:** #33 | **Dependency:** S3.1 complete first

**Files:**
- `src/lib/sync-service.ts` — audit `syncTickets()`, `syncTreasuryTransactions()`, `syncInventoryMovements()`, `syncReturns()` for `syncAttempts >= 5 → syncStatus = 'ERROR'` pattern; add to any missing modules

**Test scenarios:**
- Ticket with 5 failed syncs → `syncStatus = 'ERROR'`, excluded from future cycles
- Manual reset to `'PENDING'` → retried on next cycle

---

### S3.3 — Blind Close: Server-Side Expected Cash + UX Confirmation Modal

**Findings:** #8, #27 | **Dependency:** P0.1 (closeShift file confirmed) | **Risk:** Cashier inspects expected cash via DevTools

**Files:** *(exact file confirmed in P0.1)*
- `src/actions/[confirmed-closeShift-file].ts` — compute `expectedCash` and `variance` server-side; return in response; reject any client-provided `expectedCash`
- `src/components/shift/ShiftStatusIndicator.tsx` — remove pre-close `expectedCash` computation (lines 286–297)
- `src/components/shift/ShiftManager.tsx` — same
- `src/lib/print-zreport.ts` — consume from closed shift response only

**UX: Intermediate Confirmation Modal (prevents wrong-amount close):**
```
Cashier enters actualCash → Submit (blind)
        ↓
  Server computes variance
        ↓
  Modal: "الفرق: +200 ج.م — تأكيد الإغلاق؟"
   [تأكيد]           [إلغاء — تصحيح المبلغ]
        ↓                      ↓
  Shift finalized        Return to input
```
Cashier sees variance only after submitting — blind close integrity preserved. One correction window before irreversible close.

**Test scenarios:**
- `isBlindClose = true` → no `expectedCash` visible pre-submit
- Post-submit modal shows server-computed variance; cashier can cancel and correct
- Z-Report prints server-computed variance

---

### S3.4 — `ShiftPromptModal`: `parseFloat` → `Decimal`

**Finding:** #4

**Files:**
- `src/components/shift/ShiftPromptModal.tsx`:
  - L52: `parseFloat(startCash)` → `new Decimal(startCash).toNumber()`
  - L197: `parseFloat(startCash) === 0` → `new Decimal(startCash || '0').isZero()`
  - Add `import Decimal from 'decimal.js'`

**Bonus check:** Verify whether `ShiftPromptModal` is still active or superseded by `ShiftStatusIndicator`. If dead/legacy, add to S4.4 deletion list.

---

## Sprint 4: Cleanup — Dead Code & Schema

### S4.1 — `SparePart` Price Fields: String → Decimal

**Finding:** #2 (partial) | **Decision:** Module kept. Only price precision fixed.

**Files:**
- `prisma/schema.prisma` — `costPrice`, `sellPrice`, `price1`, `price2`, `price3` on `SparePart`: `String` → `Decimal?`
- `prisma/migrations/` — per-field:
  ```sql
  UPDATE "SparePart" SET "costPrice" = NULL WHERE "costPrice" = '';
  ALTER TABLE "SparePart"
    ALTER COLUMN "costPrice" TYPE DECIMAL(15,4)
    USING CAST(NULLIF("costPrice", '') AS DECIMAL(15,4));
  ```
- `src/actions/spare-parts.ts` — Zod: `z.string()` → `z.coerce.number()` for price fields
- `src/components/spare-parts/EditPriceDialog.tsx`, `BulkPriceUpdateDialog.tsx`, `AddPartDialog.tsx` — treat prices as numbers

**Test scenarios:**
- `costPrice = '199.99'` → stored as `Decimal(199.99)`
- Bulk update → existing parts retain values after migration
- Empty field → `null`, not empty string

---

### S4.2 — `Partner`/`PartnerTransaction` — SKIP

**Finding:** #13 (reassessed — audit was wrong)
**Decision:** DO NOT TOUCH. `2026-06-22-001-feat-partners-capital-fixed-assets-plan.md` is an active 3-phase feature plan. Removing these models destroys planned schema and conflicts with `JournalEntry.partnerTransactionId` already designed for the feature.

---

### S4.3 — `AutoJournalService`: Mark Orphaned Methods `@deprecated`

**Finding:** #17 (revised — do NOT merge methods)

`recordCustomerReceipt()` and `recordCustomerPayment()` have different GL semantics and zero active callers. Merging them incorrectly would corrupt accounting when future features wire them.

**Files:**
- `src/lib/accounting/auto-journal-service.ts`:
  - Add `/** @deprecated No active callers. Use recordArCollection() for future customer payment flows. */` to both methods
  - Add `recordArCollection()` stub that throws `Error('Not yet implemented')` — documents intended unified entrypoint without deleting existing semantics

---

### S4.4 — Root-Level Debug Script Purge

**Finding:** #18

**Delete from project root:**
```
check-dbs.cjs, check-dbs2.cjs, check-roles.js, check_integrity.js, check_product.ts
debug-ticket.ts, diag-hr.mjs, diagnose-stock.js, dump_wh.cjs
final-test.js, test-*.js, test-*.mjs, test-*.ts (17+ files)
seed-test.js, seed-units-test.js, seed_units.js, scratch.ts, scratch_check_units.js
out.json, out.txt, out3.json, db_debug.json, db_out.json, debug_output.json
diff.txt, stash2.diff, module3.diff, casper-desktop-diff.patch
```

**`.gitignore` additions:**
```gitignore
# Debug artifacts
*.diff
*.patch
out*.json
db_debug.json
debug_output.json
```

---

### S4.5 — `package.json`: Dependency Reclassification

**Findings:** #19, #20

- Move `@prisma/debug` → `devDependencies`
- Investigate `@whiskeysockets/baileys`: if required at Electron runtime → keep in `dependencies` but remove from `asarUnpack`, load lazily. If not → move to `casper-hardware-bridge/package.json`.

---

### S4.6 — `DeviceMovement`: TODO Comment (Promoted from S5.3)

**Finding:** #14 | **Evidence:** Zero references in `src/` — confirmed dead.

**Action:** Add `// TODO(accounting): record inter-branch JE when GL codes for Branch-A/Branch-B inventory confirmed` at the DeviceMovement creation call site. No schema changes.

---

### S4.7 — `TechnicianPerformance`: DROP TABLE (Promoted from S5.4)

**Finding:** #21 | **Evidence:** Zero references in `src/` — confirmed dead. Also contains `avgRepairTime Float` (precision violation).

**Files:**
- `prisma/schema.prisma` — remove `TechnicianPerformance` model block
- `prisma/migrations/` — `DROP TABLE "TechnicianPerformance"`

---

## Sprint 5: Missing Guards

### S5.1 — `StockMovement.branchId`: Non-Nullable Enforcement

**Findings:** #12, #30

> [!WARNING]
> **Corrected search strategy:** Do NOT grep for `stockMovement.create` — returns zero results because movements are created via wrapper functions. Grep for wrapper names instead: `handleReturnedPartStock`, `createStockMovement`, `deductStock`, `addStock`, or similar.

**Files:**
- `prisma/schema.prisma` — `branchId String?` → `String` on `StockMovement`
- `prisma/migrations/`:
  ```sql
  UPDATE "StockMovement" SET "branchId" = '' WHERE "branchId" IS NULL;
  ALTER TABLE "StockMovement" ALTER COLUMN "branchId" SET NOT NULL;
  ```
- Audit all wrapper call sites → ensure `branchId` always passed from user's branch context

**Test scenarios:**
- `StockMovement` created without `branchId` → TypeScript compile error
- Existing rows survive migration with no nulls

---

### S5.2 — Rate Limiter on `settleTechnicianPayroll`

**Finding:** #32
*(Covered by P0.4 + S1.4 — mark complete when S1.4 ships)*

---

## Risk Register

| ID | Risk | Likelihood | Impact | Sprint | Status |
|---|---|---|---|---|---|
| R-01 | `rate-limit.ts` missing → protection silently skipped | ~~High~~ | High | P0.4 | ✅ Resolved in P0.4 |
| R-02 | JE unbalanced → idempotency stamps corrupt entry | ~~High~~ | Critical | P0.5 | ✅ Resolved in P0.5 |
| R-03 | Partner schema removed → destroys active plan | ~~Certain~~ | Critical | S4.2 | ✅ S4.2 is SKIP |
| R-04 | SparePart removal breaks sidebar | N/A | N/A | S4.1 | ✅ Module kept |
| R-05 | SQLite `ADD CONSTRAINT NOT VALID` crash | ~~Certain~~ | High | S2.1 | ✅ PostgreSQL-only; Zod for desktop |
| R-06 | In-memory `salesSyncFailed` lost on restart | ~~Medium~~ | High | S3.1 | ✅ DB-derived pre-flight |
| R-07 | JE FK columns missing → reversal can't be scoped | Medium | High | P0.2+S1.3 | ✅ P0.2 audits first |
| R-08 | GL 5300 missing → runtime throw on manual parts | Medium | Medium | P0.3+S2.4 | ✅ P0.3 verifies/adds |
| R-09 | NaN float blocks Electron S1.1 migration | Low | Critical | S1.1 | ✅ Pre-migration NaN cleanup |
| R-10 | `closeShift` file unknown → wrong scope | Medium | Medium | P0.1+S3.3 | ✅ P0.1 confirms path |
| R-11 | No accounting unit tests → silent regression | High | High | S1–S2 | ✅ [NEW] test files per unit |
| R-12 | Merging receipt/payment methods → GL corruption | ~~Medium~~ | Medium | S4.3 | ✅ Merge cancelled; @deprecated |
| R-13 | `stockMovement.create` grep finds nothing | ~~Certain~~ | Medium | S5.1 | ✅ Corrected to wrapper grep |
| R-14 | PaymentStatus bad casing in prod data → constraint fails | Medium | High | S2.1 | ✅ Pre-flight normalize SQL |

---

## Verification Plan

### Automated
- `tsc --noEmit` — zero type errors after all sprints
- `vitest run` — existing tests pass + new test files per S1.1, S1.2, S1.3, S1.4
- `prisma validate` — schema valid after each migration

### Manual QA Checkpoints
- **Phase 0:** `rate-limit.ts` imports cleanly; JE balance throws on deliberate mismatch
- **Sprint 1:** Double-click payment → single GL entry; concurrent payroll settle → single deduction
- **Sprint 2:** `paymentStatus = 'Paid'` via Prisma Studio → cloud rejects; Zod rejects at action
- **Sprint 3:** Blind close → server confirmation modal → Z-Report prints server-computed variance
- **Sprint 4:** `npm run build` clean; Electron installer size measured (target: >10 MB reduction)
- **Sprint 5:** StockMovement wrapper called without `branchId` → compile error

---

## Sequencing & Dependencies

```
P0.1 → S3.3     (file confirmed before shift close refactor)
P0.2 → S1.3     (FK columns confirmed/added before reversal rewrite)
P0.3 → S2.4     (GL 5300 confirmed/added before phantom COGS fix)
P0.4 → S1.4     (rate-limit.ts exists before payroll action imports it)
P0.5 → S1.2     (balance assertion in place before idempotency stamps it)

S1.1 → S1.2     (both before any accounting action changes)
S1.3 independent within Sprint 1
S1.4 independent within Sprint 1

S2.1 → S2.4     (PaymentStatus const used in COGS cost separation)
S2.3 → after S1.2
S2.2 independent

S3.1 → S3.2
S3.3 → after P0.1

S4.3 → after S1.2  (before touching method signatures)
S4.6, S4.7 independent

S5.1 → after S4
```

---

## Open Questions

1. **S4.5:** Does `electron/whatsappService.js` require `@whiskeysockets/baileys` at Electron runtime? If yes, lazy-load strategy? If no, move to `casper-hardware-bridge/package.json`?
2. **S4.6:** GL codes for Branch-A and Branch-B inventory accounts (needed before implementing `DeviceMovement` JE)?
3. **S3.4 bonus:** Is `ShiftPromptModal` still in active use, or superseded by `ShiftStatusIndicator`? If dead, add to S4.4 deletion list.
