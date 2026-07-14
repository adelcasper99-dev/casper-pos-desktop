---
title: "Offline Sync Concurrency & Architecture Hardening"
date: "2026-07-14"
category: "database-issues"
tags: ["sqlite", "prisma", "sync", "occ", "concurrency"]
---

# Problem Statement
During high-concurrency offline syncs and live POS usage, the desktop terminals encountered architectural vulnerabilities:
1. **SQLite WAL Starvation**: Next.js dev server and the background sync engine competing for the `local.db` file caused `P2004` (Database is locked) errors.
2. **Double Billing & Orphaned Transactions**: Network fluctuations caused duplicate payment entries, and missing shift validations allowed payments to float without a shift constraint.
3. **Inventory Race Conditions**: Manual stock adjustments during active sales led to stock overwrites due to "last-write-wins" logic.

# Root Cause
- Prisma's SQLite connection lacked a `busy_timeout`, defaulting to immediate failure on lock contention.
- The `AccountingEngine` lacked mandatory `shiftId` and context awareness (`isSync`) for `recordMaintenancePayment` and ticket actions.
- Inventory stock adjustments lacked Optimistic Concurrency Control (OCC) guardrails.

# Solution
1. **SQLite Connection Fix (`src/lib/prisma.ts`)**: Appended `?busy_timeout=10000` to the SQLite connection URL, forcing Prisma to wait up to 10 seconds for locks to resolve.
2. **Accounting Guardrails (`src/lib/accounting/transaction-factory.ts`)**: 
   - Required `shiftId` and `isSync` for `recordMaintenancePayment`.
   - Added a hard throw for live transactions without a shift, and a soft warning bypass for background syncs.
3. **Inventory OCC (`src/actions/inventory.ts`)**:
   - Added `version Int @default(1)` to `Stock` in `schema.prisma`.
   - Wrapped `adjustStock` in a 3-attempt exponential backoff retry loop targeting `P2025` errors.
4. **Soft Deletes**: Added `@@index([deletedAt])` to `Product` and verified POS catalogs actively filter by `deletedAt: null`.

# Prevention
- Always wrap state mutations (inventory, payments) in idempotency guards or OCC loops.
- Do not let background sync requests fail hard on missing transient state (like closed shifts); use warnings and skip the hard guards reserved for live terminals.
- Ensure all SQLite connections to `local.db` utilize `busy_timeout` to survive concurrent multi-process access (Electron main, Next.js API).
