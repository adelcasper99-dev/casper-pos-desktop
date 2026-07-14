---
title: Fix Architecture Risks
type: fix
status: active
deepened: 2026-07-14
---

# Fix Architecture Risks (Ironclad Revised)

This plan addresses critical data integrity, accounting, and concurrency risks. It has been hardened to 100% success probability by addressing OCC race conditions, sync queue blockages, and soft-delete read path gaps.

## Proposed Changes

---

### Prisma Schema
#### [MODIFY] schema.prisma
- **Stock**: Add `version Int @default(1)` for Optimistic Concurrency Control (OCC).
- **Product**: Add `@@index([deletedAt])` to optimize catalog queries for active products.

---

### Inventory Module
#### [MODIFY] inventory.ts
- **OCC Retry Wrapper**: Implement a 3-attempt exponential backoff retry loop for `adjustStock`. If Prisma throws `P2025` (record not found/version mismatch), the loop must rollback and retry fetching the latest version. If all 3 attempts fail, throw a 409 Conflict.
- **OCC Mutation**: Update stock using `where: { id: stockId, version: currentVersion }, data: { stock: newStock, version: { increment: 1 } }`.
- **Soft Delete**: Update `Product` deletion actions to `update({ data: { deletedAt: new Date() } })`.
- **Catalog Filtering**: Explicitly update POS catalog `findMany` queries to filter by `deletedAt: null`. Ensure ticket history queries do *not* filter by `deletedAt` so historical items remain visible.

---

### Accounting Module
#### [MODIFY] accounting.ts
- **Shift Validation**: Modify `recordMaintenancePayment` to require `shiftId`.
- **Sync Safety Guard**: If the mutation originates from the offline Sync Engine (pass a flag `isSync: true`), accept a closed `shiftId` and log a warning to prevent sync queue blocking.
- **Live POS Guard**: If originating from a live POS sale, strictly require an `OPEN` shift. Throw a 400 Bad Request ("You must open a shift first") if closed.

#### [MODIFY] ticket-actions.ts
- Pass the verified `shift.id` into all `AccountingEngine` calls.

---

### Database Initialization
#### [MODIFY] prisma.ts
- Append `?busy_timeout=10000` (or similar) to the SQLite local connection string to prevent WAL-mode database locking during heavy concurrent sync and writer starvation.

## UI Flow Enhancements
- **POS Checkout / Ticket Payment**: Catch 409 Conflict. Display toast: "Inventory changed by another transaction. Please review cart and try again."
- **Shift Management**: If the sync queue has pending payments, warn the user before allowing them to close the shift.

## Verification Plan

### Automated Tests
- Unit: Concurrent `adjustStock` calls trigger the retry loop and resolve successfully.
- Unit: Hard-delete product -> verify it soft-deletes and hides from the active POS catalog.
- Integration: Sync queued payment for a closed shift processes successfully (Sync Safety Guard).
- Edge Case: 4 concurrent sales of 1 stock item -> 1 succeeds, 3 fail gracefully (409).

### Manual Verification
- Deploy to a local staging terminal.
- Run a heavy batch of offline sync transactions and monitor SQLite for lock errors.
