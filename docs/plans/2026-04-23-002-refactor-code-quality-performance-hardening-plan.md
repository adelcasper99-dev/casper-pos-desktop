---
title: "refactor: Casper POS Code Quality & Performance Hardening"
date: 2026-04-23
status: active
plan_depth: standard
success_target: 94%
---

# refactor: Casper POS Code Quality & Performance Hardening

## Problem Frame

Four systemic code-quality issues identified as chronic sources of build errors, white-screen crashes, and latent memory pressure:

1. **Shadow Types** — core domain interfaces redefined locally inside 11+ components, diverging from `src/types/`.
2. **Unguarded IPC Handlers** — `ipcMain.handle` and `ipcMain.on` calls without try/catch, causing white-screen-of-death on renderer promise timeout.
3. **Every-Boot `integrity_check`** — `PRAGMA integrity_check` runs every startup regardless of shutdown state.
4. **Unbounded Prisma `findMany`** — queries fetching entire tables without `take`/`select`.

---

## Track 1: Eliminate Shadow Types — Target: 95%

### Critical Pre-Condition (Must Execute First)
Before removing any shadow, the canonical `src/types/product.ts` must be extended with all 8 missing fields. Removing shadows before this step will immediately break the build.

#### [MODIFY] `src/types/product.ts` — Extend Canonical Type

```typescript
export interface Product {
    id: string;
    sku: string;
    name: string;
    description: string | null;
    costPrice: number;
    sellPrice: number;
    sellPrice2: number;
    sellPrice3: number;
    stock: number;
    minStock: number;
    categoryId: string;
    createdAt: Date | string;   // union: Date from Prisma, string from JSON responses
    updatedAt: Date | string;
    deletedAt: Date | string | null;
    version: number;

    // Previously missing — required by inventory components
    archived?: boolean;
    trackStock?: boolean;
    unitOfMeasureId?: string | null;
    unitCode?: string | null;
    unitName?: string | null;
    unitAbbreviation?: string | null;
    modelId?: string | null;
    modelName?: string | null;
    attributeId?: string | null;
    hasHistory?: boolean;
}
```

### Implementation Units

- [ ] **1-A** · Extend `src/types/product.ts` with the 10 missing/corrected fields above
  - **Blocked by nothing — execute first**
  - Verify: `npx tsc --noEmit` passes before proceeding to 1-B

- [ ] **1-B** · Purge Product shadow types in 7 inventory components
  - Files: `src/components/inventory/ProductsTab.tsx`, `PurchasesTab.tsx`, `WarehouseOperations.tsx`, `StockAdjustmentModal.tsx`, `AddProductModal.tsx`, `purchasing/PurchaseItemEntry.tsx`, `BarcodePrintDialog.tsx`
  - Action: Remove local `interface Product { ... }` blocks; add `import type { Product } from '@/types/product'`
  - Also remove `as any` casts on props that were hiding type mismatches

- [ ] **1-C** · Purge Treasury and Customer shadows (non-Product files)
  - `src/components/treasury/DepositModal.tsx` → import from `@/types/treasury`
  - `src/components/tickets/TechnicianAssignmentModal.tsx` → import from `@/types/user`

- [ ] **1-D** · TypeScript validation gate
  - Command: `npx tsc --noEmit` after **each file change** — not at the end

### ⚠️ Do NOT Remove — Intentional View-Model Types (Whitelist)

These are NOT shadows. They are purposely minimal or shape-distinct types:

| File | Type | Reason to Keep |
|---|---|---|
| `TicketPartsManager.tsx` | `interface TicketPart` | View-Model with `isDamaged`, `addedBy`, `status` — distinct from Prisma schema |
| `TicketPartsManager.tsx` | `interface ProductData` | Minimal selector type for `getProductsForSelector` |
| `CustomerAutocomplete.tsx` | inline `{ id, name, phone }` | Intentionally minimal — not a shadow of full Customer entity |

### Test Scenarios
- `npm run build` passes after each file change
- Adding a field to `src/types/product.ts` propagates to `ProductsTab.tsx` without additional edits
- `TicketPartsManager` renders correctly after the cleanup

---

## Track 2: Harden the IPC Bridge — Target: 97%

### Two Wrappers Required (not one)

`electron/main.js` has two types of registrations that require different wrappers:
- `ipcMain.handle` → use `safeHandle` (returns a value to renderer)
- `ipcMain.on` → use `safeOn` (fire-and-forget, no return)

#### Wrapper Implementations

```javascript
// electron/main.js — IPC Safety Wrappers

// For ipcMain.handle — renderer awaits a return value
function safeHandle(channel, handler) {
    ipcMain.handle(channel, async (...args) => {
        try {
            return await handler(...args);
        } catch (err) {
            log(`[IPC ERROR] ${channel}: ${err?.message ?? err}`);
            return { success: false, error: err?.message ?? 'Unknown IPC error' };
        }
    });
}

// For ipcMain.on — fire-and-forget, no return value expected
function safeOn(channel, handler) {
    ipcMain.on(channel, (event, ...args) => {
        try {
            handler(event, ...args);
        } catch (err) {
            log(`[IPC ON ERROR] ${channel}: ${err?.message ?? err}`);
        }
    });
}
```

### Implementation Units

- [ ] **2-A** · Add both `safeHandle` and `safeOn` wrappers to `electron/main.js` (~line 490)

- [ ] **2-B** · Migrate `ipcMain.on` calls to `safeOn`
  - `window:minimize`, `window:maximize`, `window:close`

- [ ] **2-C** · Migrate `ipcMain.handle` calls to `safeHandle`
  - All 22 handlers **except** `window:isMaximized` (see exclusion below)

- [ ] **2-D** · Handle `window:isMaximized` with inline try/catch (exclusion from safeHandle)
  - **Reason:** returns `boolean` — safeHandle would return `{ success: false }` on error, breaking `electron.d.ts` contract `Promise<boolean>`

  ```javascript
  // ← NOT migrated to safeHandle — return type is boolean, not {success, error}
  ipcMain.handle('window:isMaximized', () => {
      try {
          return mainWindow?.isMaximized() || false;
      } catch (err) {
          log(`[IPC ERROR] window:isMaximized: ${err?.message}`);
          return false; // type-correct fallback
      }
  });
  ```

- [ ] **2-E** · Add `casper-crash.log` for runtime errors (separate from `casper-boot.log`)
  - Format: `[ISO date] [IPC] [channel] [error] [stack line 1]`

### Test Scenarios
- `print:standard` with invalid printer → renderer receives `{ success: false, error }` instead of hanging
- `window:minimize` throws → error logged, window unchanged, renderer not affected
- `window:isMaximized` still returns `boolean` (not an object) after migration
- `app:install-update` still triggers the updater correctly

---

## Track 3: Conditional Database Integrity Check — Target: 93%

### Architecture: ENV Bridge (Solves Context Gap)

`db-init.ts` runs in **Next.js Node.js server** context — `app.getPath('userData')` is NOT available there. The flag path must be injected by `main.js` via `process.env` **before** the server starts.

```
main.js (Electron)                    db-init.ts (Next.js Server)
──────────────────                    ──────────────────────────
1. Compute flagPath                →  reads process.env.CASPER_DIRTY_FLAG_PATH
2. Set process.env.CASPER_DIRTY_FLAG_PATH
3. Write flag file
4. startServer()                   →  db-init checks if flag exists
5. app.before-quit: delete flag
```

### Implementation Units

- [ ] **3-A** · Write/delete dirty-shutdown flag in `electron/main.js` (before `startServer()`)

  ```javascript
  const flagPath = path.join(app.getPath('userData'), 'dirty-shutdown.flag');
  process.env.CASPER_DIRTY_FLAG_PATH = flagPath; // bridge to Next.js context

  // Write flag on startup (marks this as a live/dirty session)
  try { fs.writeFileSync(flagPath, Date.now().toString(), 'utf8'); } catch (_) {}

  // Delete flag on clean exit
  app.on('before-quit', () => {
      try { fs.unlinkSync(flagPath); } catch (_) {}
  });
  ```

- [ ] **3-B** · Gate `PRAGMA integrity_check` in `src/lib/db-init.ts` using the env var

  ```typescript
  import fs from 'fs';

  const flagPath = process.env.CASPER_DIRTY_FLAG_PATH;
  const isDirtyShutdown = flagPath ? fs.existsSync(flagPath) : false;
  const forceCheck = process.env.FORCE_INTEGRITY_CHECK === '1';

  if (isDirtyShutdown || forceCheck) {
      logger.info('[DB] Running integrity check: unclean shutdown detected...');
      const result = await prisma.$queryRawUnsafe('PRAGMA integrity_check;');
      if (Array.isArray(result) && result[0]?.integrity_check !== 'ok') {
          logger.error('[DB] Integrity check FAILED', result);
      } else {
          logger.info('[DB] Integrity check passed.');
      }
  } else {
      logger.info('[DB] Integrity check skipped: clean shutdown.');
  }
  ```

- [ ] **3-C** · `FORCE_INTEGRITY_CHECK=1` env var override for manual admin runs

### Notes on SIGKILL Behavior
`before-quit` does NOT fire on Windows Task Manager kill or SIGKILL. This is **correct behavior** — a force kill IS an unclean shutdown. The flag will remain, and the integrity check will run on next boot. Document this behavior in `CASPER_PROJECT_MEMORY.md`.

### Test Scenarios
- Clean start after clean exit → check skipped; log shows "Integrity check skipped: clean shutdown"
- Flag present (simulated crash) → check runs once; log shows "unclean shutdown detected"
- `FORCE_INTEGRITY_CHECK=1` → check runs regardless of flag state
- SIGKILL scenario → flag persists → check runs on next boot (correct)

---

## Track 4: Prisma Query Pagination Guards — Target: 90%

### Named Target Queries (replaces vague "Top 5")

These are the **explicitly identified** queries requiring `take`/`select` intervention, by file and function:

| Query Location | Issue | Fix Type |
|---|---|---|
| `src/actions/hr.ts` line 111: `db.role.findMany()` | Unbounded — confirmed | Add `select` only; roles are bounded by design, no `take` needed |
| `src/actions/inventory.ts: getProducts(...)` | Client sends `limit:50` — verify server applies `take` | Verify `take: params.limit` is present in Prisma call |
| `src/actions/sales.ts: getSalesByBranch(...)` | Time-range-less reports = unbounded | Add mandatory `take: 500` + `startDate/endDate` required params |
| `src/actions/accounting.ts: getJournalEntries(...)` | All ledger entries at once | Add `take: 200` + cursor-based pagination |
| `src/actions/ticket-actions.ts: getTickets(...)` | Historical tickets, no default limit | Add `take: 100` + `skip` |

### Implementation Units

- [ ] **4-A** · Fix `db.role.findMany()` in `src/actions/hr.ts` — add `select` narrowing

  ```typescript
  // Before
  const roles = await db.role.findMany();

  // After — roles are bounded, no take needed; select reduces payload
  const roles = await db.role.findMany({
      select: { id: true, name: true, permissions: true },
      orderBy: { name: 'asc' }
  });
  ```

- [ ] **4-B** · Verify `getProducts` in `src/actions/inventory.ts` applies `take: params.limit`
  - If absent → add `take: params.limit ?? 50, skip: (params.page - 1) * (params.limit ?? 50)`
  - If present → document as already compliant

- [ ] **4-C** · Add `take` + required date range to `getSalesByBranch`, `getJournalEntries`, `getTickets`
  - Default: `take: 500` for sales, `take: 200` for journal, `take: 100` for tickets
  - Add `select` to return only columns used by callers — verify each caller's data shape

- [ ] **4-D** · Add `select` narrowing to POS product selector queries
  - Pattern reference: `src/lib/product-cache.ts` already uses targeted `select`
  - POS needs only: `id`, `name`, `sku`, `sellPrice`, `sellPrice2`, `sellPrice3`, `stock`, `trackStock`

### Test Scenarios
- Products table with 2000+ records: POS screen loads under 800ms
- Roles endpoint returns all roles correctly (bounded — no pagination)
- Sales report without date range returns error (required param guard)
- Journal entries with `take: 200` returns exactly 200 + correct `hasMore` flag

---

## Dependencies & Sequencing

```
Step 1: Extend src/types/product.ts  ──▶  MUST be first (unblocks Track 1)
Step 2: Purge shadows (1-B, 1-C)     ──▶  After Step 1 only
Step 3: IPC safeHandle + safeOn      ──▶  Parallel with Step 2
Step 4: ENV bridge + integrity gate  ──▶  Parallel with Steps 2-3
Step 5: Pagination audit + fixes     ──▶  After Step 2 (type stability)
Step 6: tsc --noEmit + npm run build ──▶  Final validation gate
```

## Risks (Updated)

| Risk | Likelihood | Mitigation |
|---|---|---|
| Canonical extension misses a field used by a non-inventory component | Low | Run `tsc --noEmit` after each file, grep for any other `interface Product` |
| Removing a View-Model type mistaken for shadow | Low | Whitelist in this plan is the reference |
| `CASPER_DIRTY_FLAG_PATH` not set in dev mode (no Electron) | Medium | Guard with `if (flagPath)` before `fs.existsSync` — already in plan |
| Pagination breaks existing UI expecting full lists | Low | Only paginate the 5 explicitly named endpoints |
| `before-quit` not fired on SIGKILL | Expected | Correct behavior — documented |

## Success Targets (Updated from Gap Analysis)

| Track | Original | After Fixes |
|---|---|---|
| 1 · Shadow Types | 72% | **95%** |
| 2 · IPC Hardening | 88% | **97%** |
| 3 · Integrity Check | 75% | **93%** |
| 4 · Query Pagination | 65% | **90%** |
| **Overall** | 75% | **94%** |

## Verification Plan

1. `npx tsc --noEmit` — zero errors after Track 1-A and again after 1-B/1-C
2. `npm run build` — successful production build
3. Manual smoke: Inventory > Products, POS screen, Treasury, Tickets all load correctly
4. IPC test: trigger `print:standard` with invalid printer, verify renderer gets `{ success: false }` not a hang
5. Crash simulation: kill process → dirty flag persists → next boot shows "unclean shutdown" in log → check runs → flag cleared on next clean exit
6. Sales report without date range → returns validation error (if guard added)
