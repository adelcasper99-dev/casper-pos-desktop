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

### Decimal-Only Financial Math & Precision Hardrails
*   **Rule**: **NEVER USE FLOATS** for monetary calculations (Prices, Taxes, Salaries, COGS).
*   **Tool**: All calculations MUST use `Decimal.js`.
*   **Validation Hardening**: Use `z.union([z.string(), z.number()])` in Zod schemas for financial inputs. Avoid `z.coerce.number()` as it prematurely casts to JS floats.
*   **Serialization Integrity**: Always convert `Decimal` fields to `.toString()` when returning data from server actions to client components to prevent precision loss during JSON serialization.
*   **Calculation Logic**: Strictly avoid `.toNumber()` in intermediate steps or KPIs. Keep values as `Decimal` or `String` until the final display.

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
    -   **Ledger Mapping Guard**: When the `AccountingEngine` writes double-entry entries, the transaction `idempotencyKey` MUST be explicitly mapped in the `JournalEntry` Prisma create payload within `transaction-factory.ts` to ensure database-level uniqueness cascades down to the ledger.

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
*   **Modal Layering Strategy**: 
    -   Standard Modals (`GlassModal`): `z-index: 100`.
    -   Alerts/Confirmations (`ConfirmationModal`): `z-index: 200`.
    -   This hierarchy ensures critical confirmations always appear above active editor windows.

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

### 🛡️ [NEW] Central Print Guard Authorization (Auto-Print Control)
*   **Rule**: Component-level direct checks on raw store settings like `settings?.autoPrintTicket === true` are strictly forbidden.
*   **Protocol**: All printing entry points (e.g., Ticket Creation, Checkout, Payment, Page-Load triggers) MUST authorize auto-print actions via the central helper `shouldAutoPrint(settings, context)` in `src/lib/print-guard.ts`.
*   **Rationale**: Centralizing this logic ensures consistent behavior, handles loading states safely without race conditions, and provides a unified interface for resolving setting hierarchy (e.g., globally disabled printing override).

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
### 🛡️ [NEW] User Identity Linking Pattern
*   **Protocol**: Link employee accounts (Users) to existing customer profiles (Customers) via phone numbers.
*   **Workflow**:
    1.  Detect match during User creation/update.
    2.  Trigger `PHONE_IN_USE` error with metadata (`usedBy: 'CUSTOMER'`).
    3.  Prompt user with `ConfirmationModal` (variant: `warning`).
    4.  Retry with `confirmLink: true` to execute atomic transaction link.
*   **Atomicity**: Linking must occur within a `prisma.$transaction` using `tx.customer.updateMany({ where: { phone }, data: { linkedEmployeeId: userId } })`.
*   **Normalization**: Always clean phone numbers using `.trim().replace(/\s+/g, '')` before any database operation.

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

*Created: April 2, 2026*
*Last Update: June 22, 2026 (Partners, Equity & Balance Sheet Architecture, Accounting Fixes)*

---

## 🛡️ 12. Advanced Performance & Financial Hardening

### 🛡️ [NEW] Financial Performance & Scalability
*   **Bulk Aggregation Protocol**: High-level dashboards (HR, Finance, Inventory) MUST use database-level aggregation (`groupBy`, `_sum`, `_count`) rather than in-memory iteration. This ensures $O(1)$ performance scaling and prevents Node.js event-loop blocking.
*   **Mode-Aware Salary Proration**: All payroll and budget forecasting MUST use the centralized `calculateProratedBase` utility with explicit modes:
    -   `accrued`: For earned-to-date payroll calculations (realized cost).
    -   `projected`: For full-month budget expectations (expected cost).
*   **Batch Safety Caps**: High-volume operations (Synchronization, Linking, Bulk Exports) MUST implement `take` limits (e.g., `100` for Master Data, `1000` for Transactions) to ensure memory safety in production environments.
*   **Arithmetic Precision**: `Decimal.js` is the mandatory engine for all multi-step financial logic. Intermediate values must never be cast to `number` until the final display layer.

### 🛡️ [NEW] Strict Schema-to-Code Parity
*   **Protocol**: All shared interfaces (e.g., `PurchaseInvoice`, `PurchaseItem`) MUST maintain 1:1 field parity with the Prisma schema. Renaming properties in the backend (e.g., `invoiceId` -> `purchaseInvoiceId`) must be immediately reflected in the centralized domain types.
*   **Domain Alignment**: The `PurchaseItem` interface is the canonical type for all goods-receipt logic, replacing ad-hoc `any` arrays to ensure compile-time safety for tax and subtotal calculations.

### 🛡️ [NEW] UI Financial Precision & Strict TypeScript Integrity
*   **Defensive Decimal Validation**: All user-provided string inputs mapped to financial values must be parsed with `Decimal.js` inside a `try/catch` block before checking bounds (`<= 0`). This prevents unhandled `[DecimalError]` crashes if non-numeric inputs bypass frontend limits.
*   **Null-Coalescing in React Aggregations**: `.reduce()` methods in React components that calculate totals (e.g., `totalOwed`, `totalCredit`) must always use strict null-coalescing (`c.balance ?? 0`) inside `new Decimal()` constructors to prevent `String(null)` execution failures.
*   **Explicit State Interfaces vs. `any`**: Component `useState` hooks must explicitly map to Prisma payload interfaces (e.g., `StockWithProduct[]`, `CustomerWithBalance[]`) rather than `any[]`. This guarantees that components will fail safely at compile-time (`npx tsc`) if backend relation structures or schemas change, preventing silent runtime masking.

---

## 💰 13. Partners, Equity & Balance Sheet Architecture

### 🛡️ [NEW] Server Action Isolation (Module Boundaries)
*   **Protocol**: High-level financial reporting and database aggregations (e.g., Balance Sheets, Profit Distributions) MUST run entirely in Next.js Server Actions or dedicated server-side modules.
*   **Constraint**: Never import or invoke Prisma query clients or server files in Client Components. Doing so exposes Prisma runtime internals to webpack, causing build failures like:
    `Module not found: Can't resolve 'async_hooks'`
*   **Implementation**: All data fetching and P&L aggregations must be encapsulated in Server Actions (`balance-sheet-action.ts`, `partners.ts`), and components must load reports asynchronously via transitions or hooks.

### 💰 [NEW] Partners & Equity Accounting
*   **Double-Entry Capital Rules**: All movements in equity accounts (Partner Capital & Current Accounts) must follow double-entry debit/credit rules:
    -   **Capital Deposit (DEPOSIT)**: `DEBIT` Cash/Bank (`1000`/`1010`), `CREDIT` Partner Capital Account (`300x` range).
    -   **Partner Drawings (DRAWING)**: `DEBIT` Partner Current Account (`320x` range), `CREDIT` Cash/Bank (`1000`/`1010`).
    -   **Profit Distribution (DISTRIBUTION)**: `DEBIT` Retained Earnings P&L Account (`3300`), `CREDIT` Partner Current Account (`320x` range).
*   **Proportion Guardrail**: Profit distribution must strictly enforce `sharePercent` sum equality: the sum of active partner share percentages MUST equal exactly `100.00%` (`Decimal.js` precision).
*   **Idempotency & Overlap Prevention**: Partner profit distributions require a composite index `@@index([periodFrom, periodTo])` in the database to optimize overlap verification queries. To avoid duplicate payouts, distributions generate an `idempotencyKey` using the date range of the distribution period.
*   **[NEW] GL Account Range Guards**: Dynamic GL code generation for new partners must strictly enforce range limits (e.g., `3001` to `3099`). The system must validate availability and throw a descriptive error when the range is exhausted, preventing out-of-bounds chart of accounts pollution.
*   **[NEW] Session Integrity for Transactions**: Actions processing partner transactions MUST extract and propagate the `branchId` from the active user session (`getSession()`) into the underlying financial records (e.g., `JournalEntry`), ensuring transactions are properly attributed to the active branch and preventing orphaned records.

### 🛡️ [NEW] Permission Mapping & Migration Consistency
*   **Standard Role Seeding**: When adding new permissions (e.g., `PARTNERS_VIEW`, `PARTNERS_MANAGE`, `PARTNERS_TRANSACTIONS`), they must be added to default seed configurations in `src/actions/roles.ts`.
*   **Database Backfill**: Adding default roles in code only affects *new* installations. For existing databases, a migration/patch script (e.g., `scripts/patch-partner-permissions.ts`) must be created and executed to query and append the new permission keys to active users/roles.

---

## 🖨️ 14. Print System Hardening & Hardware Fault Tolerance

### 🛡️ [NEW] Strict IPC Boundary Validation (Zod Guarding)
*   **Rule**: Every IPC channel payload entering the Electron main process from the renderer MUST be Zod-validated.
*   **Implementation**: Use `safeHandle(channel, handler, schema)` in `electron/main.js`. If a client sends malformed arguments, the wrapper catches it early and returns a structured `{ success: false, error: ... }` object, preventing main-process crashes or prototype injection attempts.

### 🛡️ [NEW] Cash Drawer Decoupling (Fault Isolation)
*   **Rule**: The physical cash drawer kick must operate independently of the receipt printing pipeline.
*   **Implementation**: 
    -   Exposed independent `hardware:kick-drawer` IPC and `/api/drawer/kick` HTTP endpoints.
    -   UI checkout flows invoke receipt printing and cash drawer kicking concurrently using `Promise.allSettled`.
    -   **Result**: Hardware failures (e.g., printer out of paper, paper jams, offline bridge) do NOT abort the transaction completion, block the database write, or crash the UI.

### 🛡️ [NEW] Persistent SQLite Print Queue & Crash Recovery
*   **Rule**: High-priority POS print jobs (receipts, orders, barcodes) must survive application crashes, system restarts, and printer connection drops.
*   **Implementation**:
    -   Jobs are logged into a local SQLite database (`print-queue.db` running in WAL mode) at `userData/print-queue/` before hardware dispatch.
    -   **Backoff & Jitter**: Failed print attempts trigger an exponential retry backoff (`2000 * 2^attempt` milliseconds) with $\pm 10\%$ random jitter, preventing print service request storms.
    -   **Crash Recovery**: On boot (`app.whenReady`), the system auto-recovers any stuck `PROCESSING` jobs from a previous session back to `PENDING` for clean re-execution.

### 🛡️ [NEW] Shift-Aware Native Updates
*   **Rule**: Silent/automatic application updates must NEVER interrupt cashiers during active retail shifts.
*   **Implementation**:
    -   On `update-downloaded`, the auto-updater queries the local DB (via Prisma) to check if any user shift is currently `OPEN`.
    -   If an active shift exists, the update is deferred. A non-blocking warning banner is shown in the UI (`UpdateBanner.tsx`), allowing cashiers to trigger the installation manually at their convenience, or forcing it on next application boot.

### 🛡️ [NEW] Encrypted Node Configuration (`safeStorage`)
*   **Rule**: Bridge URLs, printer IPs, and node endpoints stored locally on the terminal must be protected from extraction.
*   **Implementation**:
    -   Use `electron.safeStorage` to encrypt configuration keys on the filesystem.
    -   Renderer processes query config via the main process (`app:get-config`), ensuring raw IPs and settings are decrypted only in memory when the API layer dispatches requests.

### 🛡️ [NEW] Database Provider Lock
*   **Rule**: The main Next.js/Prisma schema MUST be pinned to `provider = "postgresql"` in staging/production to protect exact Decimal field math and ensure proper connection pooling.
*   **Implementation**:
    -   A git pre-commit hook (`.git/hooks/pre-commit`) blocks commits containing a provider change in `prisma/schema.prisma`. Any deviation from `"postgresql"` (e.g., testing locally with `sqlite`) prevents commit execution with an error diagnostic.

---

## 🔒 15. Multi-Tenant Isolation Architecture & Data Boundaries

### 🏢 [NEW] Row-Level Security (RLS) via Middleware & Context
*   **Rule**: The Casper system operates as a multi-tenant environment. A user from Tenant A MUST NEVER be able to read, mutate, or intercept data belonging to Tenant B.
*   **Implementation**:
    -   **Context Injection (`Prisma Client Extension`)**: We utilize a custom Prisma extension (`prisma-tenant-extension.ts`) that intercepts all database operations (`findFirst`, `findMany`, `create`, `update`, etc.).
    -   **Execution Scope**: Endpoints handling isolated data must wrap operations inside `runWithTenant(tenantId, async () => { ... })`. This context is managed using Node's `AsyncLocalStorage` to ensure it flows flawlessly through deeply nested logic and background workers without explicit prop drilling.
    -   **PostgreSQL Enforcement (`secureTransaction`)**: When using PostgreSQL, `secureTransaction` executes `SELECT set_config('app.current_tenant_id', $1, true)` before running queries inside the `$transaction`. This secures against PgBouncer session variable leakage and guarantees robust separation.
    
### 🛸 [NEW] Offline Sync Payload Validation
*   **Rule**: Sync payloads (e.g., `offline-sale`, `offline-ticket`) originated from desktop terminals must be rejected if the payload's `tenantId` does not match the `tenantId` encoded in the `x-license-jwt`.
*   **Safety Net**: Even if a malicious actor alters the payload, `secureTransaction` and `runWithTenant` enforce operations solely on the `tenantId` derived cryptographically from the signed server license (`verifyServerLicense`).
*   **Idempotency & Isolation**: Offline Sync mechanisms maintain atomic transactions where both sequences (like offline ticket numbering) and idempotency locks are bound strictly to the `tenantId` context.
