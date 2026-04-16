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

### 🛸 [NEW] Sequential Invoice & Ticket Protection
*   **Protocol**: Sequential ID generation (e.g., Ticket Barcodes) MUST happen **inside** the database transaction (`prisma.$transaction`).
*   **Logic**: Look up the last record, increment, and create—all in one atomic block. This prevents duplicate sequence numbers during simultaneous sync attempts from multiple desktop terminals.
*   **Retry Logic**: Implement 3-retry collision protection with random jitter if a unique constraint violation occurs during the sequence commit.

### 🕰️ [NEW] Temporal Integrity (Backdating Protocols)
*   **Rule**: Transaction date-integrity MUST NOT rely on server-side `createdAt` default timestamps during sync.
*   **Implementation**: All offline sync API routes (`offline-sale`, `offline-ticket`, etc.) MUST accept a client-side `createdAt` timestamp.
*   **Database mapping**: Both the primary record (e.g., `Sale`) and its side-effects (e.g., `StockMovement`, `Transaction`) MUST use this ingested timestamp to ensure financial and inventory reports match the actual real-world transaction date.

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

### Offline-First Sync & Idempotency
*   **Rule**: Assume the desktop app is offline by default. All transactions must be generated with an `idempotencyKey` locally before hitting the server.
*   **Implementation**: 
    -   Generate `idempotencyKey` via `generateIdempotencyKey(type)` before any network dispatch.
    -   Persist to offline DB (IndexedDB / SQLite) first if offline.
    -   Both Desktop SQLite `Transaction/Sale/JournalEntry` and Cloud PostgreSQL models MUST have an `idempotencyKey String? @unique` constraint.
    -   Server actions (e.g., `addTreasuryTransaction`) and server routes must catch duplicates via `idempotencyKey` and return `{existing: true}` instead of a 500 error or double-billing.

### Universal Sync Worker & Dead Letter Queue (DLQ)
*   **Worker Routine**: The `SyncWorker` must delegate to `SyncService.syncAll()` to ensure ALL offline stores (Sales, Tickets, Treasury, Inventory, Returns) are processed, not just a subset.
*   **Sync Mutex (isSyncing Lock)**: To prevent overlapping sync cycles during high latency or large batch operations, the `SyncWorker` must implement a `isSyncing` boolean lock-gate.
*   **DLQ Protection**: Items that fail to sync repeatedly (e.g., >5 retries) should be flagged as `DEAD_LETTER` locally instead of permanently blocking the queue, allowing human review without stalling other outgoing transactions.

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

## 🖨️ 6. Hardware Bridge & Hybrid Printing Architecture

### ⚡ Hybrid Environment Detection
*   **Rule**: The POS must seamlessly adapt its printing mechanism based on the environment context (Zero-configuration).
*   **Desktop Native (Electron)**: Direct and instantaneous access via Native IPC (`electronAPI`) for Zero-Latency ESC/POS raw operations.
*   **Web / Network Node**: API-based routing to the standalone Windows micro-service (`Casper Hardware Bridge` on port 4040).

### 🌐 Network Routing & Node Targeting
*   **Rule**: Network printing components MUST bypass `localhost` if a master target IP is configured.
*   **Logic**: The `print-service.ts` resolves the `bridgeIpAddress` from the `PrinterRegistry`. If a user connects via an iPad, the POS directs the payload to `http://<Master_IP>:4040/api/print` resolving the localhost trap.
*   **Handling Offline Services**: All fetch requests to the Bridge API use `AbortController` combined with `Promise.race()` to guarantee maximum timeout guardrails (e.g., 15s). Printing processes MUST NOT freeze the UI if a target printer node drops off the network.

---

## 🛡️ 8. System Hardening & Data Integrity Guardrails

### 🛡️ [NEW] Destructive Read Protection
*   **Rule**: Read-only server actions (e.g., `getWarehouses`, `getProducts`) MUST NOT perform silent database mutations under any circumstances.
*   **Protocol**: Extract "Self-Healing" or "Cleanup" logic (like deduplicating phantom warehouses) into explicit, permission-gated admin actions (e.g., `fixDuplicateWarehouses`). This prevents accidental data loss and side-effects during normal UI navigation.

### 🛡️ [NEW] Resilient Stock Reversals
*   **Rule**: When voiding or updating invoices, stock reversals MUST NOT rely on the guaranteed existence of a per-warehouse `Stock` record.
*   **Technique**: Use `tx.stock.updateMany({ where: { productId, warehouseId }, data: { quantity: { decrement: ... } } })`. This prevents transaction aborts (P2025) if a stock record was missing due to historical corruption or incomplete imports, maintaining financial integrity in the main transaction.

### 🛡️ [NEW] Unified Status Convention (Purchases)
*   **Status Mapping**: 
    -   `'CANCELLED'`: The canonical status for a voided/deleted purchase invoice (goods never received or transaction rolled back).
    -   `'RETURNED'`: Specifically reserved for goods sent back to the supplier after receipt.
*   **Guardrails**: All financial calculations (Purchase Logs, Shift Totals) must treat `CANCELLED` and `VOIDED` as inactive/ignored to prevent double-counting.

### 🛡️ [NEW] High-Success Batch Ingestion
*   **Rule**: Bulk CSV imports MUST auto-create secondary dependencies (e.g., Suppliers, Categories) during the pre-processing phase.
*   **Protocol**: This ensures the import process is "resilient" and doesn't hard-fail on single unknown entries while correctly deduplicating via pre-fetched maps.

---
*Created: April 2, 2026*
*Last Update: April 16, 2026 (System Hardening, Data Integrity Guardrails & Destructive Read Protection)*
