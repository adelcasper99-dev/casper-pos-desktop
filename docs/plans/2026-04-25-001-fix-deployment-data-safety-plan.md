---
title: "fix: Harden deployment data safety for arch-hardening-performance branch"
date: 2026-04-25
status: active
origin: deployment_checklist.md (session 1397bf93)
type: fix
depth: Standard
---

# fix: Harden Deployment Data Safety for `feat/arch-hardening-performance`

## Problem Frame

The deployment checklist for `346403b` surfaced three critical risks that must be resolved before the branch ships to production terminals:

1. **Risk 1 — Data Loss (Ticket):** `excessLossAmount` is added as a NEW SQLite column with `DEFAULT 0.00`. Any existing production data in the old `sharedLossAmount` column is silently abandoned — no backfill exists. **Requires `user_version` bump to ensure the backfill runs on already-booted terminals.**
2. **Risk 2 — Data Loss (Technician):** `lossRate` is added with `DEFAULT 70.00`. Any technician whose real loss rate was stored in `sharedLossRate` silently reverts to 70%. **Requires `user_version` bump.**
3. **Risk 3 — IPC Contract Mismatch:** `safeHandle` changes the error contract for 11 IPC channels from "throw on failure" to "return `{success:false, error}`". The `electron.d.ts` type declarations do not reflect this, and several callers (`WhatsAppQuickButton`, `SetupWizard`, `BackupManager`, and `local-persistence`) either silently discard structured errors or break due to direct property access on the envelope.

A fourth risk (HR proration mode switch from `accrued` to `projected`) requires a UI disclosure note but no code logic change.

## Scope

**In scope:**
- Backfill SQL in `electron/main.js` `prePatchStatements`
- Type alignment in `src/types/electron.d.ts`
- New `src/lib/ipc-utils.ts` helper
- Error-handling fix in `src/components/tickets/WhatsAppQuickButton.tsx`
- `src/components/setup/SetupWizard.tsx` result-unwrap fix
- `src/components/settings/BackupManager.tsx` envelope-unwrap fix (getConfig, selectBackupFolder)
- `src/lib/local-persistence.ts` envelope-unwrap fix (getConfig)
- HR Dashboard proration mode badge

**Out of scope:**
- Changing the `safeHandle`/`safeOn` architecture (it is correct)
- Changing the proration math (`projected` mode is correct for the budget dashboard)
- Any Prisma migration file changes (SQLite pre-patch is the established pattern)

## Stakeholders

| Party | Impact |
|-------|--------|
| Technicians | Wrong `lossRate` defaults silently alter commission deductions |
| HR managers | `expectedSalaries` figure changes mode without UI notice |
| POS operators | `openExternal` errors silently swallowed (WhatsApp deep-links) |

---

## Technical Design Overview

### Risk 1 & 2: Column Backfill Pattern

The `prePatchStatements` array in `electron/main.js` uses `runSql()`, which wraps every statement in a try/catch and returns `false` on failure. This makes it safe to add `UPDATE` statements referencing columns (`sharedLossAmount`, `sharedLossRate`) that may not exist on fresh installs — the statement will fail silently and log `SKIP`.

Execution order: the `ADD COLUMN` for the new column **must appear before** the backfill `UPDATE` in the array.

### Risk 3: IPC Unwrap Strategy

1. Create a thin `extractIpcData<T>()` utility in `src/lib/ipc-utils.ts`.
2. Update type declarations only for channels whose callers consume the return value.
3. Fix the callers that silently discard structured errors or break due to direct property access on the `{success, data, error}` envelope.

> *This illustrates the intended approach and is directional guidance, not implementation specification.*

---

## Implementation Units

### Unit 1 — Ticket `excessLossAmount` Backfill + Version Bump

**File:** `electron/main.js`
**Risk:** Risk 1

1. After the existing `ADD COLUMN "excessLossAmount"` statement in `prePatchStatements`, insert:
   ```sql
   UPDATE "Ticket" SET "excessLossAmount" = "sharedLossAmount" WHERE "sharedLossAmount" > 0
   ```
2. **CRITICAL:** Increment the `user_version` check value (currently `7` if targeting the latest optimization) in `electron/main.js` to `8` (or next sequential) to ensure the migration loop executes on terminals that already booted once.

**Test scenarios:**
- [ ] DB with non-zero `sharedLossAmount` rows → `excessLossAmount` matches after pre-patch
- [ ] Fresh install (no `sharedLossAmount` column) → `runSql` returns false, logs SKIP, boot continues
- [ ] Re-run on already-patched DB → UPDATE runs idempotently, no error

---

### Unit 2 — Technician `lossRate` Backfill SQL

**File:** `electron/main.js`
**Risk:** Risk 2

After the existing `ADD COLUMN "lossRate"` statement in `prePatchStatements`, insert:
```sql
UPDATE "Technician" SET "lossRate" = "sharedLossRate" WHERE "sharedLossRate" IS NOT NULL AND "sharedLossRate" != 70.00
```

**Test scenarios:**
- [ ] Technician with `sharedLossRate = 50.00` → `lossRate = 50.00` after patch
- [ ] Technician with `sharedLossRate = 70.00` → no change (guard prevents overwrite)
- [ ] Fresh install (no `sharedLossRate` column) → SKIP, boot continues

---

### Unit 3 — IPC Type Contract + Caller Hardening

**Files:**
- `src/lib/ipc-utils.ts` *(new)*
- `src/types/electron.d.ts`
- `src/components/tickets/WhatsAppQuickButton.tsx`
- `src/components/setup/SetupWizard.tsx`
- `src/components/settings/BackupManager.tsx`
- `src/lib/local-persistence.ts`

**Risk:** Risk 3

#### `src/lib/ipc-utils.ts` (new)
Export `extractIpcData<T>(result: {success: boolean; data?: T; error?: string}, channel: string): T`:
- Throws `Error('[IPC:channel] error message')` when `success === false`
- Returns `result.data as T` when successful

#### `src/types/electron.d.ts`
Update return types for channels whose return values are consumed:
- `saveConfigAndRestart` → `Promise<{success: boolean; data?: boolean; error?: string}>`
- `showOpenDialog` / `selectBackupFolder` → `Promise<{success: boolean; data?: string | null; error?: string}>`
- `getConfig` / `getDbPath` → `Promise<{success: boolean; data?: any; error?: string}>`
- Add a JSDoc comment explaining the safeHandle envelope pattern

#### `src/components/tickets/WhatsAppQuickButton.tsx` (line ~79)
Add after the `openExternal` await:
```ts
if (!res.success) toast.error(res.error ?? 'Failed to open external link');
```

#### `src/components/setup/SetupWizard.tsx`
- Line 49 (`getDbPath`) + line 61 (`showOpenDialog`): unwrap via `extractIpcData` or `result.data`
- Line 72 (`saveConfigAndRestart`): inside the try block, check `result.success === false` and throw `new Error(result.error)` to flow into the existing catch

#### `src/components/settings/BackupManager.tsx`
- Line 36 (`getConfig`): access `config.data.backupPath` (or use `extractIpcData`)
- Line 67 (`selectBackupFolder`): access `folder.data`

#### `src/lib/local-persistence.ts`
- Line 93 (`getConfig`): unwrap the `safeHandle` envelope to access `data.backupPath`

**Test scenarios:**
- [ ] WhatsApp link fails → `toast.error` fires (previously: silent failure)
- [ ] `getDbPath` returns `{success:false}` → UI surfaces the error
- [ ] `saveConfigAndRestart` fails → existing catch handler shows `toast.error`
- [ ] `showOpenDialog` cancelled → `data` is `null`, UI shows no path selected (behavior preserved)
- [ ] BackupManager loads → correct backup path displays (previously: undefined due to envelope)

---

### Unit 4 — HR Dashboard Proration Mode Badge

**Files:** Component that renders `expectedSalaries` KPI (grep `expectedSalaries` in `src/app/` and `src/components/hr/` at implementation time)
**Risk:** HR manager confusion from `projected` vs `accrued` total

Add a `Badge` next to the salary KPI reading **"Projected (Full Month)"** with an `ℹ️` tooltip: *"Shows the expected end-of-month payroll cost, prorated to a full cycle."*

**Test scenarios:**
- [ ] Badge renders on the HR dashboard salary KPI
- [ ] Badge does NOT render on individual employee profile page (different mode)

---

## Dependencies and Sequencing

```
Units 1 + 2  --> One commit (main.js SQL + version bump)
Unit 3a (ipc-utils.ts) --> Before callers
Unit 3b (electron.d.ts) --> Before callers
Units 3c (SetupWizard, WhatsAppButton, BackupManager, local-persistence) --> After 3a + 3b
Unit 4  --> Fully independent
```

## Deferred Questions

| Question | Disposition |
|----------|-------------|
| Does `runSql`'s catch block swallow all SQLite errors? | Verify at `electron/main.js:118-127`. If it catches all errors, backfill is safe. |
| Should `commissionClawback` also be backfilled? | Do NOT add without confirmed field mapping. |
| Which component renders the HR KPI card? | Grep `expectedSalaries` at implementation time. |

## Verification Plan

### Pre-merge
- [ ] `npm run build` exits 0
- [ ] Manual SQL test: create a test DB with `sharedLossAmount > 0`, execute pre-patch SQL, confirm `excessLossAmount` populated

### Post-deploy SQL (addendum to existing checklist)
```sql
SELECT COUNT(*) FROM "Ticket" WHERE excessLossAmount = 0 AND lossResponsibility IS NOT NULL;
-- Expected: 0

SELECT id, lossRate FROM "Technician" WHERE lossRate != 70.00;
-- Expected: matches known non-default technicians
```
- [ ] WhatsApp button with malformed URL → `toast.error` fires
- [ ] HR salary KPI shows "Projected (Full Month)" badge
