---
title: Ironclad Audit Remediation Plan
type: fix
status: active
created: 2026-07-06
---

# 100% Ironclad Remediation Plan

This plan replaces the original 70% draft. It closes the critical gaps by adding runtime safety, build-time guarantees, and proper database schema support.

## User Review Required

> [!WARNING]
> This plan requires running `npx prisma migrate dev` to add the new settings field. Please ensure no other developers are modifying the database schema currently.

> [!IMPORTANT]
> The Zod schema enforcement in `inventory.ts` and `sales-actions.ts` might reject payloads that currently pass silently. We will test thoroughly, but this is a strict boundary enforcement.

## Open Questions

- **E2E Testing:** The plan still includes basic Playwright setup. Should we proceed with Playwright now, or focus solely on the security/type fixes today?

## Proposed Changes

### Phase 1: Critical Security (Build-Time JWT Validation)

We cannot just remove the fallback; we must ensure the app refuses to build if the secret is missing.

#### [NEW] [env.ts](file:///f:/casper%20desktop/casper-pos-desktop/src/env.ts)
- Implement a Zod schema to validate `process.env.JWT_SECRET` exists. This will run at build time and startup to prevent production crashes.

#### [MODIFY] [redis-session.ts](file:///f:/casper%20desktop/casper-pos-desktop/src/lib/redis-session.ts)
- Import `env.ts` and remove the `'dev-secret-key-casper-pos-desktop'` fallback.

### Phase 2: Runtime Type Safety (Zod Boundaries)

TypeScript interfaces do not protect against bad data from the client. We must parse payloads at runtime.

#### [NEW/MODIFY] [sync-schemas.ts](file:///f:/casper%20desktop/casper-pos-desktop/src/lib/validations/sync-schemas.ts)
- Define or reuse Zod schemas for `PurchaseItem` and `SaleItem`.

#### [MODIFY] [inventory.ts](file:///f:/casper%20desktop/casper-pos-desktop/src/actions/inventory.ts)
- Replace `any` types. Wrap incoming payload parameters in `inventorySchema.parse(data)`.

#### [MODIFY] [sales-actions.ts](file:///f:/casper%20desktop/casper-pos-desktop/src/actions/sales-actions.ts)
- Replace `any` types. Wrap incoming payload parameters in `saleSchema.parse(data)`.

### Phase 3: Infrastructure Robustness (Settings DB)

A custom Google Drive path must persist in the database and have a UI.

#### [MODIFY] [schema.prisma](file:///f:/casper%20desktop/casper-pos-desktop/prisma/schema.prisma)
- Add `googleDriveBackupPath String?` to the `SystemSettings` (or equivalent config) table.

#### [MODIFY] [google-drive.ts](file:///f:/casper%20desktop/casper-pos-desktop/src/actions/google-drive.ts)
- Query the DB for the backup path instead of using hardcoded arrays. Fallback to `C:\Users\...` if null.
- Add `testGoogleDrive(path: string)` action to validate paths from the UI.

#### [MODIFY] [BackupSettings.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/components/settings/BackupSettings.tsx) (Or equivalent settings component)
- Add a text input for the Drive Path and a "Test Connection" button.

### Phase 4: E2E Testing Foundation

#### [NEW] [playwright.config.ts](file:///f:/casper%20desktop/casper-pos-desktop/playwright.config.ts)
- Initialize Playwright.

#### [NEW] [offline-checkout.spec.ts](file:///f:/casper%20desktop/casper-pos-desktop/tests/e2e/offline-checkout.spec.ts)
- Write an offline checkout test.

## Verification Plan

### Automated Tests
- Run `npm run test`
- Execute Playwright test `npx playwright test`

### Manual Verification
1. Remove `JWT_SECRET` from `.env` and verify the app fails to start with a clear error.
2. Go to Settings > Backup, input an invalid path, and verify the UI rejects it via `testGoogleDrive`.
3. Perform a sale and a purchase to verify Zod schemas aren't blocking valid transactions.
