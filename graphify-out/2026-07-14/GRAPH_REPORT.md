# Graph Report - casper-pos-desktop  (2026-07-14)

## Corpus Check
- 643 files · ~1,193,015 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 384 nodes · 455 edges · 35 communities (26 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9d14af8d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_inventory.ts|inventory.ts]]
- [[_COMMUNITY_returns-fetchers.ts|returns-fetchers.ts]]
- [[_COMMUNITY_CheckoutModal.tsx|CheckoutModal.tsx]]
- [[_COMMUNITY_sales-actions.ts|sales-actions.ts]]
- [[_COMMUNITY_prisma.ts|prisma.ts]]
- [[_COMMUNITY_WarehouseSettings.tsx|WarehouseSettings.tsx]]
- [[_COMMUNITY_PurchaseLog.tsx|PurchaseLog.tsx]]
- [[_COMMUNITY_SupplierHistoryTable.tsx|SupplierHistoryTable.tsx]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_AutoJournalService|AutoJournalService]]
- [[_COMMUNITY_AccountingEngine|AccountingEngine]]
- [[_COMMUNITY_check-gl.js|check-gl.js]]
- [[_COMMUNITY_CashFlowDashboard.tsx|CashFlowDashboard.tsx]]
- [[_COMMUNITY_getBundleComponents|getBundleComponents]]
- [[_COMMUNITY_db|db]]
- [[_COMMUNITY_PurchaseDataGrid.tsx|PurchaseDataGrid.tsx]]
- [[_COMMUNITY_profit-loss.ts|profit-loss.ts]]
- [[_COMMUNITY_Sidebar.tsx|Sidebar.tsx]]
- [[_COMMUNITY_SyncService|SyncService]]
- [[_COMMUNITY_backfill-floating-records.mjs|backfill-floating-records.mjs]]
- [[_COMMUNITY_CASPER_PROJECT_MEMORY|CASPER_PROJECT_MEMORY.md]]
- [[_COMMUNITY_🛡️ 8. System Hardening & Data Integrity Guardrails|🛡️ 8. System Hardening & Data Integrity Guardrails]]
- [[_COMMUNITY_ticket-actions.ts|ticket-actions.ts]]
- [[_COMMUNITY_Proposed Changes|Proposed Changes]]
- [[_COMMUNITY_reports-actions.ts|reports-actions.ts]]
- [[_COMMUNITY_🔄 11. Bi-directional Synchronization (V2 - Pull Mechanism)|🔄 11. Bi-directional Synchronization (V2 - Pull Mechanism)]]
- [[_COMMUNITY_💰 1. Financial Integrity & Payroll Protocols|💰 1. Financial Integrity & Payroll Protocols]]
- [[_COMMUNITY_offline-sync-concurrency-fixes|offline-sync-concurrency-fixes.md]]
- [[_COMMUNITY_🛡️ 12. Advanced Performance & Financial Hardening|🛡️ 12. Advanced Performance & Financial Hardening]]
- [[_COMMUNITY_💰 13. Partners, Equity & Balance Sheet Architecture|💰 13. Partners, Equity & Balance Sheet Architecture]]
- [[_COMMUNITY_🛡️ 14. Offline Sync Concurrency & Architecture Hardening|🛡️ 14. Offline Sync Concurrency & Architecture Hardening]]
- [[_COMMUNITY_🔄 3. System Synchronization & Deduplication|🔄 3. System Synchronization & Deduplication]]
- [[_COMMUNITY_🖨️ 6. Hardware Bridge & Hybrid Printing Architecture|🖨️ 6. Hardware Bridge & Hybrid Printing Architecture]]
- [[_COMMUNITY_🔄 9. Formalized Workflows|🔄 9. Formalized Workflows]]

## God Nodes (most connected - your core abstractions)
1. `SyncService` - 16 edges
2. `AccountingEngine` - 15 edges
3. `AutoJournalService` - 12 edges
4. `🛡️ 8. System Hardening & Data Integrity Guardrails` - 9 edges
5. `💰 1. Financial Integrity & Payroll Protocols` - 6 edges
6. `🔄 11. Bi-directional Synchronization (V2 - Pull Mechanism)` - 6 edges
7. `getBoundedTimestamp()` - 6 edges
8. `PurchaseDataGrid()` - 6 edges
9. `Proposed Changes` - 5 edges
10. `🔄 3. System Synchronization & Deduplication` - 4 edges

## Surprising Connections (you probably didn't know these)
- `main()` --references--> `{ PrismaClient }`  [EXTRACTED]
  scripts/check-cogs.mjs → check-gl.js
- `POST()` --calls--> `getBoundedTimestamp()`  [INFERRED]
  src/app/api/inventory/offline-movement/route.ts → src/lib/sync-time-helper.ts
- `POST()` --calls--> `getBoundedTimestamp()`  [INFERRED]
  src/app/api/pos/offline-sale/route.ts → src/lib/sync-time-helper.ts
- `POST()` --calls--> `getBoundedTimestamp()`  [INFERRED]
  src/app/api/sales/offline-return/route.ts → src/lib/sync-time-helper.ts
- `POST()` --calls--> `getBoundedTimestamp()`  [INFERRED]
  src/app/api/tickets/offline-ticket/route.ts → src/lib/sync-time-helper.ts

## Import Cycles
- None detected.

## Communities (35 total, 9 thin omitted)

### Community 0 - "inventory.ts"
Cohesion: 0.04
Nodes (47): adjustStock, bulkImportPurchases, createAttribute, createCategory, createModel, createProduct, createPurchase, createSupplier (+39 more)

### Community 1 - "returns-fetchers.ts"
Cohesion: 0.12
Nodes (11): FetchedPurchase, FetchedSale, FetchedTicket, issueStoreCredit, PurchaseLineItem, ReworkPrefill, SaleLineItem, SearchResult (+3 more)

### Community 2 - "CheckoutModal.tsx"
Cohesion: 0.09
Nodes (16): processSale, ProcessSaleData, CheckoutModalProps, CasperOfflineDB, OfflineCategory, offlineDB, OfflineInventoryMovement, OfflineModel (+8 more)

### Community 3 - "sales-actions.ts"
Cohesion: 0.28
Nodes (5): partialRefundSale, refundSale, SalesHistoryFilters, SalesLog(), SalesLogProps

### Community 4 - "prisma.ts"
Cohesion: 0.18
Nodes (12): POST(), POST(), POST(), getNextTicketNumberInsideTx(), POST(), POST(), getBoundedTimestamp(), OfflineReturnInput (+4 more)

### Community 5 - "WarehouseSettings.tsx"
Cohesion: 0.50
Nodes (3): setDefaultWarehouse, Warehouse, WarehouseSettings()

### Community 7 - "SupplierHistoryTable.tsx"
Cohesion: 0.13
Nodes (12): Transaction, generateA4StatementHTML(), TemplateProps, Transaction, SupplierHistoryTable(), SupplierHistoryTableProps, Transaction, POSITIVE_TYPES (+4 more)

### Community 8 - "page.tsx"
Cohesion: 0.19
Nodes (5): InventoryReportDetail(), ACCOUNT_NAME_TRANSLATIONS, CashFlowDashboard(), translateAccountName(), translateDescription()

### Community 11 - "check-gl.js"
Cohesion: 0.29
Nodes (4): prisma, { PrismaClient }, main(), prisma

### Community 13 - "getBundleComponents"
Cohesion: 0.67
Nodes (3): getBundleAvailability(), getBundleComponents(), POSClientAPI()

### Community 15 - "PurchaseDataGrid.tsx"
Cohesion: 0.08
Nodes (24): PurchasesTab(), ALL_EDITABLE_COLS, AttributeDropdownProps, AttributeOption, cartItemsToGridRows(), CategoryDropdownProps, CategoryOption, CellInput (+16 more)

### Community 16 - "profit-loss.ts"
Cohesion: 0.50
Nodes (3): getBranchesForReports, getProfitLossReport, ProfitLossFilters

### Community 21 - "CASPER_PROJECT_MEMORY.md"
Cohesion: 0.25
Nodes (7): 🌐 10. Multi-Device Connectivity, 📦 2. Inventory & Stock Reliability, 🎨 4. Modern UI & UX Standards, Dynamic IP Detection, Enterprise Aesthetic, RTL/LTR Universality, Smart Returns (Damaged Tracking)

### Community 22 - "🛡️ 8. System Hardening & Data Integrity Guardrails"
Cohesion: 0.22
Nodes (9): 🛡️ 8. System Hardening & Data Integrity Guardrails, 🛡️ [NEW] Destructive Read Protection, 🛡️ [NEW] High-Success Batch Ingestion, 🛡️ [NEW] Resilient Stock Reversals, 🛡️ [NEW] Strict Schema Fallbacks for Offline Sync, 🛡️ [NEW] System Maintenance & Safety, 🛡️ [NEW] Unified Accounting Core, 🛡️ [NEW] Unified Status Convention (Purchases) (+1 more)

### Community 23 - "ticket-actions.ts"
Cohesion: 0.05
Nodes (35): addCollaborator, addTicketNote, addTicketPart, applyCustomerCredit, assignTechnician, createTicket, fullRefundTicket, fullTicketReturn (+27 more)

### Community 24 - "Proposed Changes"
Cohesion: 0.12
Nodes (15): Accounting Module, Automated Tests, Database Initialization, Fix Architecture Risks (Ironclad Revised), Inventory Module, Manual Verification, [MODIFY] accounting.ts, [MODIFY] inventory.ts (+7 more)

### Community 26 - "🔄 11. Bi-directional Synchronization (V2 - Pull Mechanism)"
Cohesion: 0.33
Nodes (6): 🔄 11. Bi-directional Synchronization (V2 - Pull Mechanism), 🛸 Delta-based Pull Architecture, 🏗️ [NEW] Domain Type Centralization Protocol, 🛡️ [NEW] E-Wallet Module & Isolated Commission Accounting, 🛡️ Sync Hardening & Observability, 🔒 Sync Security & UI

### Community 27 - "💰 1. Financial Integrity & Payroll Protocols"
Cohesion: 0.33
Nodes (6): 💰 1. Financial Integrity & Payroll Protocols, Decimal-Only Financial Math & Precision Hardrails, Ledger Transparency (No Masking), 💰 [NEW] Financial Integrity: Separate Accounting & Reversals, 🛸 [NEW] Sequential Invoice & Ticket Protection, 🕰️ [NEW] Temporal Integrity (Backdating Protocols)

### Community 28 - "offline-sync-concurrency-fixes.md"
Cohesion: 0.40
Nodes (4): Prevention, Problem Statement, Root Cause, Solution

### Community 29 - "🛡️ 12. Advanced Performance & Financial Hardening"
Cohesion: 0.50
Nodes (4): 🛡️ 12. Advanced Performance & Financial Hardening, 🛡️ [NEW] Financial Performance & Scalability, 🛡️ [NEW] Strict Schema-to-Code Parity, 🛡️ [NEW] UI Financial Precision & Strict TypeScript Integrity

### Community 30 - "💰 13. Partners, Equity & Balance Sheet Architecture"
Cohesion: 0.50
Nodes (4): 💰 13. Partners, Equity & Balance Sheet Architecture, 💰 [NEW] Partners & Equity Accounting, 🛡️ [NEW] Permission Mapping & Migration Consistency, 🛡️ [NEW] Server Action Isolation (Module Boundaries)

### Community 31 - "🛡️ 14. Offline Sync Concurrency & Architecture Hardening"
Cohesion: 0.50
Nodes (4): 🛡️ 14. Offline Sync Concurrency & Architecture Hardening, 🛡️ [NEW] Inventory Optimistic Concurrency Control (OCC), 🛡️ [NEW] SQLite WAL Starvation Protection, 🛡️ [NEW] Sync Shift Guards & Orphan Protection

### Community 32 - "🔄 3. System Synchronization & Deduplication"
Cohesion: 0.50
Nodes (4): 🔄 3. System Synchronization & Deduplication, Offline-First Sync & Idempotency, Physical vs. Virtual Transaction Priority, Universal Sync Worker & Dead Letter Queue (DLQ)

### Community 33 - "🖨️ 6. Hardware Bridge & Hybrid Printing Architecture"
Cohesion: 0.50
Nodes (4): 🖨️ 6. Hardware Bridge & Hybrid Printing Architecture, ⚡ Hybrid Environment Detection, 🌐 Network Routing & Node Targeting, 🛡️ [NEW] Central Print Guard Authorization (Auto-Print Control)

### Community 34 - "🔄 9. Formalized Workflows"
Cohesion: 0.67
Nodes (3): 🔄 9. Formalized Workflows, 🛸 Purchase Return Workflow, 🛸 Sales Return Workflow (Arabic)

## Knowledge Gaps
- **193 isolated node(s):** `💰 [NEW] Financial Integrity: Separate Accounting & Reversals`, `🛸 [NEW] Sequential Invoice & Ticket Protection`, `🕰️ [NEW] Temporal Integrity (Backdating Protocols)`, `Decimal-Only Financial Math & Precision Hardrails`, `Ledger Transparency (No Masking)` (+188 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AccountingEngine` connect `AccountingEngine` to `inventory.ts`, `CheckoutModal.tsx`, `sales-actions.ts`, `ticket-actions.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `getReportData()` connect `reports-actions.ts` to `ticket-actions.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `💰 [NEW] Financial Integrity: Separate Accounting & Reversals`, `🛸 [NEW] Sequential Invoice & Ticket Protection`, `🕰️ [NEW] Temporal Integrity (Backdating Protocols)` to the rest of the system?**
  _193 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `inventory.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `returns-fetchers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `CheckoutModal.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09057971014492754 - nodes in this community are weakly interconnected._
- **Should `SupplierHistoryTable.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12631578947368421 - nodes in this community are weakly interconnected._