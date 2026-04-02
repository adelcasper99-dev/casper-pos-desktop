# 🗓️ Session Memory — April 2, 2026

This document lists the specific modifications and fixes made during the session of **April 2, 2026**, focused on technician financials and refund integrity.

## 💰 1. Technician Financial Fixes (The "Ozza" Audit)

### 🧩 Mismatch in Reversal Types
*   **Issue**: `fullTicketReturn` was creating transactions of type `MAINTENANCE_COMMISSION` with negative amounts, while the salary aggregator expected `MAINTENANCE_COMMISSION_REVERSAL` with positive amounts. This caused "Ghost Deductions" (virtual + physical).
*   **Fix**: Standardized all commission clawbacks to use `MAINTENANCE_COMMISSION_REVERSAL`.
*   **Files**: 
    - `src/actions/ticket-actions.ts`
    - `src/actions/hr-profile.ts`
    - `src/lib/salary-utils.ts`

### 📊 Absolute Value Summation
*   **Issue**: Mixing negative and positive values in the same category (`totalBonuses`) was causing arithmetic drift.
*   **Fix**: Updated `calculateNetDue` to sum category impacts using absolute values and correctly move reversals to `totalDeductions`.
*   **Files**: `src/lib/salary-utils.ts`

### 👁️ UI Masking Removal
*   **Issue**: The ledger UI was using `Math.abs()` on all amounts, hiding whether a value was a debit or credit.
*   **Fix**: Removed `Math.abs()` and implemented color-coding (Red for Negative/Deduction, Green for Positive/Addition).
*   **Files**: `src/components/hr/EmployeeProfileClient.tsx`

### 🧮 Decimal Math Enforcement
*   **Issue**: `Math.round()` was still being used for some commission UI display and calculations, risking floating-point errors against the `Decimal.js` standard.
*   **Fix**: Completely eradicated `Math.round` from commission loops. `commission-validation.ts` now exclusively uses decoupled `decimal.js` logic avoiding Prisma Decimal type collisions.
*   **Files**: `src/actions/hr-profile.ts`, `src/lib/commission-validation.ts`

### 🧠 The Amnesia Bug (`commissionClawback`)
*   **Issue**: During `fullTicketReturn`, `commissionAmount` was zeroed out, but the system forgot to save the reversed amount into `commissionClawback`. This broke the payroll engine's ability to locate how much was reversed.
*   **Fix**: Bound `originalCommission` to `commissionClawback` before the zero-out operation directly inside the `ticket` update.
*   **Files**: `src/actions/ticket-actions.ts`

### 🔄 Virtual Entries Sync & Deduplication
*   **Issue**: `salary-utils.ts` had a global deduplication check (`hasCommissionInLedger`), causing ONE paid commission to silently block ALL other virtual commissions. Additionally, `hr-profile.ts` virtual entries didn't sum `excessLoss` correctly with `clawback` to match payroll reality.
*   **Fix**: Switched to a strict `Per-Ticket` (`referenceId`) deduplication logic. Aligned `hr-profile.ts` exact mathematical virtual entry with `salary-utils.ts` to ensure HR UI transparently mirrors actual salary outcomes.
*   **Files**: `src/lib/salary-utils.ts`, `src/actions/hr-profile.ts`

---

## 📦 2. Full Refund Hardening (Profit-First Loss)

### 🛡️ Profit-First Loss Absorption
*   **Logic**: Hardware loss from damaged parts is now "absorbed" by the technician's commission FIRST. Only the excess loss is distributed based on "Responsibility" (Tech/Center/Split).
*   **Reasoning**: Prevents the center from bearing 100% of the cost for technician-error-related hardware damage.
*   **Files**: `src/actions/ticket-actions.ts`

### 🏗️ Damaged Part Tracking
*   **UI Update**: The `ReturnInitiationModal` now allows managers to mark specific parts as "Damaged".
*   **Inventory Update**: Damaged parts return to stock as `isDamaged: true`.
*   **Files**: 
    - `src/components/tickets/wizard/ReturnInitiationModal.tsx`
    - `src/components/tickets/WorkflowActions.tsx`

---

## 🏗️ 3. Type System Updates

### 🏷️ Workflow Ticket Extension
*   **Update**: Added `parts: TicketPart[]` and `TicketPart` interface to the `WorkflowTicket` type definition to support the new refund UI.
*   **Files**: `src/types/ticket.ts`

---
*Status: All changes verified and merged into main codebase.*
