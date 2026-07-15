# Graph Report - casper-pos-desktop  (2026-07-13)

## Corpus Check
- 637 files · ~1,191,182 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 233 nodes · 288 edges · 16 communities (12 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `57e18b95`
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

## God Nodes (most connected - your core abstractions)
1. `AccountingEngine` - 13 edges
2. `AutoJournalService` - 12 edges
3. `PurchaseDataGrid()` - 6 edges
4. `cartItemsToGridRows()` - 4 edges
5. `getReportData()` - 4 edges
6. `UnifiedReportsPage()` - 4 edges
7. `FlatpickrRangePicker()` - 4 edges
8. `CasperOfflineDB` - 4 edges
9. `getBundleComponents()` - 4 edges
10. `PurchasesTab()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `main()` --references--> `{ PrismaClient }`  [EXTRACTED]
  scripts/check-cogs.mjs → check-gl.js
- `PurchasesTab()` --calls--> `cartItemsToGridRows()`  [EXTRACTED]
  src/components/inventory/PurchasesTab.tsx → src/components/inventory/purchasing/PurchaseDataGrid.tsx
- `PurchasesTab()` --calls--> `gridRowsToCartItems()`  [EXTRACTED]
  src/components/inventory/PurchasesTab.tsx → src/components/inventory/purchasing/PurchaseDataGrid.tsx
- `UnifiedReportsPage()` --calls--> `getReportData()`  [EXTRACTED]
  src/app/(routes)/reports/page.tsx → src/actions/reports-actions.ts
- `UnifiedReportsPage()` --calls--> `getProfitLossReport`  [EXTRACTED]
  src/app/(routes)/reports/page.tsx → src/actions/reports/profit-loss.ts

## Import Cycles
- None detected.

## Communities (16 total, 4 thin omitted)

### Community 0 - "inventory.ts"
Cohesion: 0.04
Nodes (47): adjustStock, bulkImportPurchases, createAttribute, createCategory, createModel, createProduct, createPurchase, createSupplier (+39 more)

### Community 1 - "returns-fetchers.ts"
Cohesion: 0.10
Nodes (12): FetchedPurchase, FetchedSale, FetchedTicket, issueStoreCredit, PurchaseLineItem, ReworkPrefill, SaleLineItem, SearchResult (+4 more)

### Community 2 - "CheckoutModal.tsx"
Cohesion: 0.09
Nodes (16): processSale, ProcessSaleData, CheckoutModalProps, CasperOfflineDB, OfflineCategory, offlineDB, OfflineInventoryMovement, OfflineModel (+8 more)

### Community 3 - "sales-actions.ts"
Cohesion: 0.20
Nodes (7): partialRefundSale, refundSale, SalesHistoryFilters, SalesLog(), SalesLogProps, SalePaymentInput, TransactionLineInput

### Community 4 - "prisma.ts"
Cohesion: 0.33
Nodes (7): POST(), POST(), OfflineReturnInput, OfflineReturnSchema, OfflineSaleInput, OfflineSaleSchema, PAYMENT_METHOD

### Community 5 - "WarehouseSettings.tsx"
Cohesion: 0.50
Nodes (3): setDefaultWarehouse, Warehouse, WarehouseSettings()

### Community 7 - "SupplierHistoryTable.tsx"
Cohesion: 0.13
Nodes (12): Transaction, generateA4StatementHTML(), TemplateProps, Transaction, SupplierHistoryTable(), SupplierHistoryTableProps, Transaction, POSITIVE_TYPES (+4 more)

### Community 8 - "page.tsx"
Cohesion: 0.19
Nodes (10): getBranchesForFilter(), getCategoriesForFilter(), getProductsForFilter(), getReportData(), getSalesByProductAndCategory(), ReportFilters, getBranchesForReports, getProfitLossReport (+2 more)

### Community 11 - "check-gl.js"
Cohesion: 0.29
Nodes (4): prisma, { PrismaClient }, main(), prisma

### Community 12 - "CashFlowDashboard.tsx"
Cohesion: 0.60
Nodes (4): ACCOUNT_NAME_TRANSLATIONS, CashFlowDashboard(), translateAccountName(), translateDescription()

### Community 13 - "getBundleComponents"
Cohesion: 0.67
Nodes (3): getBundleAvailability(), getBundleComponents(), POSClientAPI()

### Community 15 - "PurchaseDataGrid.tsx"
Cohesion: 0.08
Nodes (24): PurchasesTab(), ALL_EDITABLE_COLS, AttributeDropdownProps, AttributeOption, cartItemsToGridRows(), CategoryDropdownProps, CategoryOption, CellInput (+16 more)

## Knowledge Gaps
- **107 isolated node(s):** `CategoryOption`, `UnitOption`, `ModelOption`, `AttributeOption`, `PurchaseDataGridProps` (+102 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getReportData()` connect `page.tsx` to `sales-actions.ts`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `AccountingEngine` connect `AccountingEngine` to `CheckoutModal.tsx`, `sales-actions.ts`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `FlatpickrRangePicker()` connect `SupplierHistoryTable.tsx` to `page.tsx`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `CategoryOption`, `UnitOption`, `ModelOption` to the rest of the system?**
  _107 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `inventory.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `returns-fetchers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `CheckoutModal.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09057971014492754 - nodes in this community are weakly interconnected._