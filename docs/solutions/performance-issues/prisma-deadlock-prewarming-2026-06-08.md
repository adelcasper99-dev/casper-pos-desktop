---
title: Prisma Transaction Deadlocks, Seeding, and UI Auto-Print Race Conditions
date: 2026-06-08
category: docs/solutions/performance-issues/
module: Accounting & Tickets
problem_type: performance_issue
component: database
symptoms:
  - Ticket payment hanging up to 60 seconds (hitting Prisma interactive transaction timeouts)
  - UI checkout freezes and printer auto-print delays due to stale closures in React hooks
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [prisma, transaction, deadlock, pre-warming, next-js, react-hooks]
---

# Prisma Transaction Deadlocks, Seeding, and UI Auto-Print Race Conditions

## Problem
During ticket payment processing, database transactions were frequently hanging for up to 60 seconds, resulting in Prisma transaction timeouts. Additionally, the checkout UI and print receipts would occasionally freeze or fail to print automatically due to race conditions and stale closures in the React component's polling logic.

## Symptoms
- Terminals experiencing 60-second timeouts during the payment stage of maintenance tickets.
- UI elements (like the payment modal) getting stuck in a loading state, leading to double-checkout or duplicate payment risk.
- Stale UI states preventing receipts from automatically printing when settings check was triggered.

## What Didn't Work
- Raising the `$transaction` timeout threshold (e.g., to 60s) didn't solve the underlying lock contention, it only made terminals hang longer before failing.
- Using `setInterval` inside the UI component to check settings, which formed a stale closure over React state variables.

## Solution
1. **Pre-warming GL Accounts**: Dynamic imports (`await import('./seed-accounts')`) and bulk database checks/upserts for seeding General Ledger (GL) accounts were extracted from `AccountingEngine.recordTransaction` into a new pre-warming method `AccountingEngine.ensureGLAccounts(codes)`.
2. **Fast Transactions**: The pre-warming method runs *before* entering the Prisma `$transaction`. This keeps the active transaction block extremely lightweight. The transaction timeout was reduced from 60s to 15s to fail-fast.
3. **Stale Closure Resolution**: Replaced state-dependent polling in `TicketPaymentModal.tsx` auto-print routine with a direct, fresh asynchronous retrieval of store settings (`await getEffectiveStoreSettings()`).
4. **Duplicate Cleanup**: Deprecated the outdated copy of transaction logic in `src/actions/tickets/financials.ts` by clearing its contents.

```typescript
// pre-warming logic outside transaction
await AccountingEngine.ensureGLAccounts(glAccountCodes);

// fast transaction logic
await prisma.$transaction(async (tx) => {
    // Record transactions and write invoice safely...
}, {
    timeout: 15000 // 15s limit
});
```

## Why This Works
Dynamic imports, seeding routines, and file-based checks inside active, interactive transactions cause database locks to escalate and block connection pools. Performing these checks beforehand ensures that database connections are held only for the duration of direct inserts and updates. Fetching store settings asynchronously in event handlers bypasses stale React state closures, ensuring the UI evaluates the correct settings in real-time.

## Prevention
- Never perform dynamic imports, disk I/O, or dynamic seed checking inside a Prisma transaction block.
- Always pre-warm configuration/seeding dependencies before initiating database transactions.
- Use direct async fetches rather than state variables when checking async flags within delayed callback chains.
