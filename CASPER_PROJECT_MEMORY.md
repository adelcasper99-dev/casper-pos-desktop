عملنا ايه فى الخطه دى # 🛸 Casper ERP & POS: Project Architecture & Financial Memory

This document serves as the "Source of Truth" for critical architectural decisions, financial logic, and system integrity protocols established for the Casper POS & ERP system.

## 💰 1. Financial Integrity & Payroll Protocols

### 💰 [NEW] Financial Integrity: Separate Accounting & Reversals

*   **Principle of Separate Accounting**: Profits (Commissions) and Deductions (Reversals/Losses) must be recorded as **distinct operations**. A deduction should never "zero out" or "flip" the original profit record in the UI; instead, the original profit should remain as a historical record, and the deduction should appear as a separate ledger entry.
*   **"Reverse Only What Was Posted" Rule**:
    - If a commission was **Posted** (Physical Transaction): Create a `MAINTENANCE_COMMISSION_REVERSAL` for the (Original Comm + Hardware Loss Share).
    - If a commission was **Virtual** (Not yet posted): Only create a deduction for the **Hardware Loss Share**. The virtual profit will naturally disappear from the "Earnings" bucket when the ticket status changes to `VOIDED`.
*   **UI Transparency (Technician Ledger)**:
    - The "Maintenance History" table should show the **original intended commission** for all tickets, even if `VOIDED`, to maintain a record of work done.
    - All financial penalties and reversals must be explicitly listed in the **Transactions/Ledger** section, never as "Negative Commissions" in the core service list.
*   **Profit-First Loss Absorption (Ozza Protocol)**:
    - Hardware losses (damaged parts) must be absorbed from the technician's profit *first*. 
    - The `totalTechDeduction` calculation must always follow: `(IsPosted ? OriginalComm : 0) + (ExcessLoss * ResponsibilityShare)`.
    - **Amnesia Bug Prevention**: When voiding a ticket via `fullTicketReturn`, always copy `originalCommission` into the `commissionClawback` column BEFORE setting `commissionAmount` to 0. This ensures payroll correctly tracks how much commission must be virtually (or physically) reversed.
    - **Virtual Sync Rule**: `hr-profile.ts` and `salary-utils.ts` MUST calculate deduction mathematically identically: `totalClawDeduction = clawbackVal + (excessLoss * responsibilityShare)`. Both must read from the per-ticket `referenceId` to avoid global deduplication blocking.

*   **Sequential Invoice Protection**: Ensure 3-retry collision protection for all generated invoice/ticket numbers during heavy sync or concurrent operations.

### Decimal-Only Financial Math
*   **Rule**: **NEVER USE FLOATS** for monetary calculations.
*   **Tool**: All calculations (COGS, Commission, Tax, Payroll) MUST use `Decimal.js`.
*   **Rounding**: Use `Decimal.ROUND_HALF_UP` for final storage.

### Ledger Transparency (No Masking)
*   **Rule**: The Employee Ledger UI must show raw signs from the database.
*   **Logic**: Removing `Math.abs()` from the UI allows managers to detect anomalous negative entries or manual errors immediately.
*   **Status Colors**: 
    -   **Red / Negative**: True deduction or debit.
    -   **Green / Positive**: True addition or credit.

---

## 📦 2. Inventory & Stock Reliability

### Smart Returns (Damaged Tracking)
*   **Rule**: Every "Full Refund" or "Return" operation must prompt the user to mark parts as **Good** or **Damaged**.
*   **Implementation**: 
    -   Good parts return to active stock.
    -   Damaged parts are recorded as `isDamaged: true` and removed from sellable inventory.
*   **Financial Link**: Damaged status directly triggers the "Profit-First" loss absorption in the technician's payroll.

---

## 🔄 3. System Synchronization & Deduplication

### Physical vs. Virtual Transaction Priority
*   **Rule**: System-generated "Virtual Entries" (used for reporting on unpaid work) must always seek a matching "Physical Transaction" (EmployeeTransaction table) via `referenceId` and `type` before appearing.
*   **Types**: Use standardized types like `MAINTENANCE_COMMISSION_REVERSAL` to ensure consistency between the audit log and the salary aggregator.

---

## 🎨 4. Modern UI & UX Standards

### Enterprise Aesthetic
*   **Typography**: Use Google Fonts (Inter/Outfit) exclusively.
*   **Visuals**: High-contrast dark modes, subtle glassmorphism (backdrops), and vibrant but professional accent colors (Cyan for Tech, Rose for Risks).
*   **Feedback**: Always use "Sonner" for toast notifications and sequential action handling.

### RTL/LTR Universality
*   **Rule**: Full support for Arabic (RTL) and English (LTR) using `next-intl`. All structural components must use flex-direction and logical spacing that adapts to the `dir` attribute.

---

## 🛠️ 5. Development & Audit Workflows

### The "Integrity Success Ratio"
*   **Metric**: `(Completed - Voided) / Completed`.
*   **Rule**: High void/return counts should trigger a "Technician Quality Audit."
*   **Log**: Maintain `AUDIT_TRACKING.md` for major schema or treasury logic changes.

---
*Created: April 2, 2026*
*Last Update: Hardening of Full Refund Loss Absorption Logic*
