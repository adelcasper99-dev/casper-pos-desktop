عملنا ايه فى الخطه دى # 🛸 Casper ERP & POS: Project Architecture & Financial Memory

This document serves as the "Source of Truth" for critical architectural decisions, financial logic, and system integrity protocols established for the Casper POS & ERP system.

## 🧠 Documented Solutions & Knowledge Base
*   **Knowledge Store**: `docs/solutions/` contains detailed documentation of past problems, fixes, and best practices.
*   **Protocol**: Before implementing new features or debugging complex issues, agents should search `docs/solutions/` for relevant context.
*   **Structure**: Docs are organized by category (e.g., `ui-bugs`, `workflow-issues`, `best-practices`) and include YAML frontmatter for discoverability.

---

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
*   **[NEW] Headless Default**: To maximize throughput, the system defaults to "Headless Printing" (Directly to hardware without a preview modal) when printers are already configured.


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
### 🛡️ [NEW] System Maintenance & Safety
*   **Database Reset Protocol**: 
    -   **Action**: `resetDatabase()` deletes all **Transactional Data** (Sales, Tickets, Payments, Shifts, Logs) but **Preserves Master Data** (Products, Users, Customers, Suppliers, Branches).
    -   **Logic**: Resets all inventory quantities and balances (Treasury, Customer, Supplier) to 0.
    -   **Safety**: Uses a single atomic transaction with a 30s timeout guard. Only accessible to Super Admins.

### 🛡️ [NEW] Unified Accounting Core
*   **Automatic Journaling**: Inherited Odoo-style double-entry bookkeeping.
*   **Service**: `AutoJournalService` automatically generates balanced debits/credits for:
    -   Customer Payments (Cash → AR).
    -   Maintenance Distributions (Revenue/Commission/Profit splits).
    -   Supplier Payments (AP → Cash).
    -   Stock Wastage (Expense → Inventory).
*   **Consistency**: All financial entries are "Branch-Aware" and use the central GL mapping defined in `accounting-mappings.ts`.

---

## 🔄 9. Formalized Workflows

### 🛸 Sales Return Workflow (Arabic)
1.  **Selection**: Located in Logs > Sales.
2.  **Full Refund**: Mark as VOIDED/CANCELLED. All profit and commission reversed.
3.  **Partial Refund**: Select specific items. Prompt for "Good" or "Damaged".
4.  **Financial Impact**: Automatic journal reversal + stock re-entry (or wastage if damaged).

### 🛸 Purchase Return Workflow
1.  **Standard Procedure**: Use "Partial Return" for returning stock to suppliers.
2.  **Stock Impact**: Decrements warehouse stock and supplier balance.
3.  **Document ID**: Generates an `RTN-P` prefixed document for tracking.

---

## 🌐 10. Multi-Device Connectivity

### Dynamic IP Detection
*   **Logic**: The system uses `os.networkInterfaces()` to detect the local IPv4 address during bootup.
*   **Purpose**: Allows secondary devices (iPads, Android Tablets) to connect to the Windows master terminal hosting the database and hardware bridge without manual configuration.
*   **Port Mapping**:
    -   **POS UI**: Port 3000.
    -   **Hardware Bridge**: Port 4040 (Network Printing).

---

## 🔄 11. Bi-directional Synchronization (V2 - Pull Mechanism)

### 🛸 Delta-based Pull Architecture
*   **Rule**: The local POS database MUST periodically pull master data (Products, Categories, Models, Settings) from the cloud to ensure enterprise-wide consistency.
*   **Delta Pull**: To minimize bandwidth and payload, the synchronizer uses a `since` timestamp. It only fetches records where `updatedAt >= lastPullTimestamp`.
*   **Checkpointing**: The client stores a `lastPullTimestamp` in `syncMetadata` after every successful pull to mark the baseline for the next cycle.

### 🛡️ Sync Hardening & Observability
*   **Heartbeat Backoff**: `SyncService` implements a linear backoff (up to 5 minutes) if the cloud is unreachable, preventing "request storms" during network outages.
*   **Decoupled Sync**: The Pull phase is decoupled from the Push queue. Terminals will check for HQ price updates even if no local sales are pending.
*   **In-Cart Price Locking**: The POS Cart (`useCartStore`) captures and "locks" the price at the moment an item is added. Background pulls to the catalog do **not** affect active transactions, ensuring pricing consistency for customers at the counter.
*   **Refined Reporting**: `SyncService` aggregates "soft failures" from individual operations. High-level logs now report exact item failure counts (e.g., "3 sales failed") instead of generic promise rejections.

### 🔒 Sync Security & UI
*   **Manual Override**: A "Force Catalog Sync" button allows cashiers to bypass the 30s heartbeat for immediate updates after an HQ price change.
*   **Live Status Indicator**: A dedicated section in the POS status bar shows the catalog state (`Catalog OK`, `Syncing...`) and the timestamp of the last successful master data pull.
*   **Payload Protection**: All pull endpoints are protected by the `x-sync-secret` header and restricted by a matching `SYNC_SECRET` environment variable.

---

### 🛡️ [NEW] E-Wallet Module & Isolated Commission Accounting
*   **Module Objective**: Manage digital treasury movements (Vodafone Cash, InstaPay) independently of core sales.
*   **Atomic Accounting**: Implements a 3-line journal entry within `prisma.$transaction`:
    1.  **Digital Leg**: Movement in the digital treasury (e.g., charge 1000 EGP).
    2.  **Physical Leg**: Balancing movement in the cash safe (e.g., receive 1005 EGP).
    3.  **Revenue Leg**: Isolated recording of the 5 EGP commission in **GL Account 4500 (E-Wallet Commission Revenue)**.
*   **Shift Z-Report Sync**: Wallet transactions automatically update `totalCashSales` and `totalWalletSales` in the active `Shift` record to ensure zero variance during cashier reconciliation.
*   **Replay Protection**: Mandatory `idempotencyKey` generation in the UI to prevent double-processing during network lag.

### 🏗️ [NEW] Domain Type Centralization Protocol
*   **Problem**: Local interface duplication causes "Two different types with this name exist" build failures during schema updates.
*   **Protocol**: All shared entities (Treasury, Sale, Ticket, Product) MUST be defined in centralized files within `src/types/`.
*   **Rule**: Component-level "Shadow Types" are strictly forbidden for core domain entities. Components MUST import from `@/types/[domain].ts` to ensure build-time synchronization with backend actions.

---

---

## 🛡️ 12. Headless Printing & Workflow Automation

### 🛸 Headless Printing Logic (Silent Mode)
*   **Rule**: If the "Speed Print" (Direct Print) toggle is enabled, the system bypasses the preview modal for immediate hardware handoff.
*   **Printer Verification**: The system uses `checkPrinterAndRedirect` to verify printer availability BEFORE attempting a silent print.
*   **Automatic Redirection**: If a required printer (Thermal or Label) is unconfigured, the system automatically redirects the user to the Store Settings page with a warning notification, preventing silent failures.

### 🛡️ Manual Preview Override (Shift + Click)
*   **Protocol**: Users can ALWAYS bypass silent printing by holding the **Shift** key while clicking any print button.
*   **Behavior**: This force-opens the `TicketPrintOptionsModal` (Preview Modal), allowing users to change printers, select specific copies, or view the layout before printing.
*   **UI Guidance**: A persistent localized hint `(Shift + Click) للمعاينة اليدوية` is displayed near print controls and inside the modal.

### 🌍 Workflow Localization & UX
*   **RTL Optimization**: All print hints and automated messages are fully localized in `ar.json`.
*   **Interactive Feedback**: Buttons change state to "Printing..." (جاري التحقق...) with loading spinners during the headless handoff to provide immediate feedback despite the lack of a modal.

*Created: April 2, 2026*
*Last Update: April 23, 2026 (Startup Performance Optimization, Headless Printing, Shift+Click Override & UI Localization)*

---

## 🚀 13. Boot Performance & Initialization Protocols

### ⚡ [NEW] Electron Startup Optimization (SQL Batching & Versioning)
*   **Rule**: The Electron main process MUST NOT block the UI with redundant schema checks.
*   **Technique (Schema Versioning)**: Utilize `PRAGMA user_version` to track the current database state. On boot, the app checks this version and skips all 120+ `prePatchStatements` instantly if the version matches.
*   **Protocol**: Whenever new schema patches are added to `electron/main.js`, the target `user_version` MUST be incremented.
*   **Live Progress (IPC)**: Initialization tasks (Migrations, Server Start) MUST emit real-time status updates via the `boot-status` IPC channel.
*   **UI Feedback**: The splash screen (`splash.html`) MUST listen for these events and display a progress indicator (e.g., "Optimizing Database (45/123)...") to provide immediate user feedback.

### 🛡️ [NEW] Optimized Backend Seeding
*   **Rule**: Database seeding during initialization MUST use batched operations to prevent "Request Storms".
*   **Implementation**: Use `createMany` combined with a pre-fetch `Set` of existing keys. This reduces dozens of sequential `findUnique` + `create` calls into just two atomic operations (Fetch + Batch Create).
*   **Redundancy**: Core integrity checks (`PRAGMA integrity_check`) should be executed during the server runtime (`db-init.ts`) but removed from the main Electron boot sequence to minimize blocking latency.
