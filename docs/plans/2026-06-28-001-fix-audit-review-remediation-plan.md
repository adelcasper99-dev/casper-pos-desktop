---
title: "fix: Audit branch code review remediation — blind close, sync guard, financial reversal"
date: 2026-06-28
status: active
origin: code_review.md
---

# fix: Audit Branch Code-Review Remediation (v2 - Adversarial Hardened)

## Problem Frame

The `/ce-code-review` pass on `feat/blind-close` surfaced **2 P0 blockers** and **4 P1 defects** that must be resolved before this branch is merged. The most critical is a financial-control bypass: the blind-close discrepancy guard (`SH-01`) can be defeated by pressing CLOSE SHIFT twice because `acceptDiscrepancy` is set to `true` silently in state.

An adversarial review of the initial plan identified additional gaps: hardcoded monetary tolerances lacking business sign-off, UX traps where cashiers can't correct typos without losing modal state, type safety violations (`any` casts), and downstream reporting risks from adding FKs to VOID entries. This updated plan addresses all of them.

---

## Scope

**In scope:**
- P0-1: Blind-close discrepancy confirmation UX (persistent banner + checkbox + editable input)
- P0-2: Audit log enriched with cash/card variance on accepted override
- P1-1: Cash/card variance tolerance set to strict zero pending business sign-off
- P1-2: `offlineDB.isOpen()` → `offlineDB.isOpen`
- P1-3: `tx` and `whereClause` correctly typed in `FinancialReversalService`
- P1-4: Verify all `rateLimit` callers check `result.success`
- P2-1 / GAP-5: `ShiftPromptModal` & `ShiftStatusIndicator` — stop converting Decimal back to float before sending to server
- P2-2 / GAP-2: Add `CloseShiftResult` discriminated union to enforce type safety on discrepancy payloads
- P2-5 / GAP-4: VOID contra-entries inherit FK links + audit ticket queries for duplicate lines
- GAP-3: Modal `onClose` handler ensures robust state reset
- P3-3: Remove dead commented-out ticket-check block
- P3-4: Fix "Explus" → "Surplus" typo

**Out of scope:**
- P2-3 (`TechnicianPerformance` migration) — dedicated schema sprint
- P2-4 (`repairPayments onDelete: SetNull`) — already handled

---

## Implementation Units

### [ ] Unit 1 — P1-2: Fix Dexie `isOpen` property call
**File:** `src/lib/sync-service.ts` (line 61)
**Risk:** Low

Change `offlineDB.isOpen()` → `offlineDB.isOpen`. As written, the method call always returns truthy, bypassing the DB-state gate.

---

### [ ] Unit 2 — P1-1 & GAP-1: Strict Zero Tolerance Threshold
**File:** `src/actions/shift-management-actions.ts` (lines 307–318)
**Risk:** Medium

Since EGP 0.05 is a business decision, we default to strict safety:
```ts
const VARIANCE_TOLERANCE_EGP = new Decimal('0.00'); // TODO(Finance): Confirm acceptable variance with owner
```
Change both variance checks to `cashVariance.abs().gt(VARIANCE_TOLERANCE_EGP)`.

---

### [ ] Unit 3 — P0-2 & GAP-6: Enrich discrepancy audit log
**File:** `src/actions/shift-management-actions.ts` (lines 348–366)
**Risk:** Low

Update `auditLog.create` in the discrepancy block:
- Leave `action: "COUNT_DISCREPANCY"` unchanged for backward compatibility (GAP-6), but add a note.
- Add to `newData`: `cashVariance`, `cardVariance`, `expectedCash`, `expectedCard`, `accepted: data.acceptDiscrepancy ?? false`.
- Include `expectedCash` and `expectedCard` in `previousData`.

---

### [ ] Unit 4 — GAP-2: Type Safety for Discrepancy Response
**File:** `src/actions/shift-management-actions.ts`

Export a strongly typed return interface:
```ts
export type CloseShiftResult = 
    | { success: true; shift: any; message?: string }
    | { success: false; code: "DISCREPANCY_DETECTED"; expectedCash: string; expectedCard: string; cashVariance: string; cardVariance: string; message: string; notes: string[] }
    | { success: false; code?: never; message: string; error?: string };
```
Use this to remove the `(result as any)` casts in the client component.

---

### [ ] Unit 5 — P0-1, GAP-3, UX-1, UX-4: Blind-close confirmation UX
**File:** `src/components/shift/ShiftStatusIndicator.tsx`
**Risk:** High

**Behavior adjustments from adversarial review:**
1. Type safety: Use `CloseShiftResult`.
2. Banner Placement (UX-1): Render the discrepancy warning banner **above** the actual cash input field.
3. Editable Input (UX-4): Even when the banner is shown, keep the `actualCash` input editable. If the cashier modifies the input, reset `acceptDiscrepancy` and hide the banner until they submit again.
4. Robust Reset (GAP-3): Update the main `onClose` handler for `GlassModal` (or the `setShowCloseModal(false)` wrapper) to reset `acceptDiscrepancy = false`, `discrepancyMessage = ""`, and `discrepancyDetails = null`.
5. Labels (UX-2): Use separate `<span>` elements with `dir="rtl"` and `dir="ltr"` for the button label to fix mixed-direction rendering.

---

### [ ] Unit 6 — P1-3: Type `tx` and `whereClause` in `FinancialReversalService`
**File:** `src/lib/financial-reversal-service.ts`
**Risk:** Low

Replace `any` with `Prisma.TransactionClient` and `Prisma.JournalEntryWhereInput` across the three main methods.

---

### [ ] Unit 7 — P2-5 & GAP-4: VOID FK inheritance & Query Audit
**Files:** 
- `src/lib/financial-reversal-service.ts`
- `src/actions/tickets/financials.ts` (and other JE query sites)
**Risk:** Medium

1. Pass all non-null FK fields (`ticketId`, `saleId`, etc.) from `entry` into the VOID contra-entry.
2. **Audit:** Ensure that financial summaries fetching `journalEntry` by `ticketId` filter out `reference: { startsWith: 'VOID-' }` if they are summing lines, to prevent double counting. (If they just list the ledger, showing both is correct — verify the behavior).

---

### [ ] Unit 8 — P1-4: Verify `rateLimit` call sites
**Risk:** Low (Verification only)

The adversarial review confirmed all 3 production callers (`auth.ts:24`, `pos.ts:57`, `technician-payroll-actions.ts:171`) already correctly use `if (!limit.success)`. Just run a quick grep to double-check no others slipped in.

---

### [ ] Unit 9 — P2-1 & GAP-5: Decimal precision loss in client inputs
**Files:** 
- `src/components/shift/ShiftPromptModal.tsx`
- `src/components/shift/ShiftStatusIndicator.tsx` (line 98)

Both files run `new Decimal(amount).toNumber()`. Change the server actions (`openShift`, `closeShift`) to accept `number | string` (or just `string` for raw precision), and pass the raw `startCash` and `actualCash` strings directly to the server. If changing the action signature is risky, document the precision loss explicitly with a `// ponytail: ...` comment.

---

### [ ] Unit 10 — P3 cosmetic fixes
**Files:**
- `ShiftStatusIndicator.tsx`: "Explus" → "Surplus"
- `shift-management-actions.ts`: Remove dead commented-out ticket-check block.

---

## Sequencing & Verification

```
Unit 1 (isOpen)        ──→ Run `npm run test` (Sync suite)
Unit 6 (types)         ──→ Run `npx tsc --noEmit` to ensure no transaction type mismatch
Unit 7 (VOID FKs)      ──→ Proceed after Unit 6 TS check passes
Unit 2,3,4 (Backend)   ──→ Must land before Unit 5 (Frontend UX)
Unit 5 (UI banner)     ──→ Test UX paths (typo correction vs explicit accept)
Unit 9 (Decimal)       ──→ Standalone
Unit 8, 10             ──→ Cleanup
```

**UX Test Cases (Unit 5):**
1. Cashier enters `490` instead of `500`. Clicks close.
2. Banner appears. Cashier realizes typo.
3. Cashier deletes `490`, types `500`. Banner disappears automatically.
4. Cashier clicks close. Shift closes normally without discrepancy.
