---
title: Hardening Financial Aggregation and Performance Safety Caps
date: 2026-04-23
category: docs/solutions/performance-issues/
module: HR & Inventory
problem_type: performance_issue
component: database
symptoms:
  - HR Dashboard memory-intensive loops causing performance bottlenecks
  - Memory crashes during large batch synchronization
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [prisma, aggregation, performance, typescript, decimal-js]
---

# Hardening Financial Aggregation and Performance Safety Caps

## Problem
The HR Dashboard experienced significant performance bottlenecks due to O(N) memory-intensive loops used for salary aggregation. Additionally, large batch synchronization operations lacked safety caps, risking memory exhaustion crashes.

## Symptoms
- Extreme latency when loading HR Dashboard summaries with many active employees.
- Memory spikes and potential crashes during customer and ticket synchronization.
- Floating-point precision risks in financial projections.

## What Didn't Work
- Calculating prorated salaries individually within an iteration loop ($O(N)$ scaling).
- Using `any[]` types for database results, which masked property mismatches (e.g., `sharedLossAmount` vs `excessLossAmount`).

## Solution
1. **Bulk Aggregation**: Migrated HR summary logic to use Prisma `groupBy` and `Map`-based reconciliation, reducing memory lookup to $O(1)$ per user.
2. **Proration Modes**: Enhanced `calculateProratedBase` to support `accrued` (earned-to-date) and `projected` (full-month budget) modes.
3. **Safety Caps**: Implemented `take: 100` and `take: 1000` limits on high-volume queries in `customer-actions.ts` and `ticket-actions.ts`.
4. **Strict Typing**: Defined explicit `PurchaseItem` and `ProductWithStocks` interfaces to ensure data integrity across the inventory pipeline.

```typescript
// Optimized bulk reconciliation pattern
const logAggs = await prisma.dailyWorkLog.groupBy({
    by: ['userId'],
    where: { date: { gte: start, lte: end } },
    _sum: { bonus: true, deduction: true }
});
const logMap = new Map(logAggs.map(l => [l.userId, l]));
```

## Why This Works
Offloading summation to the database engine and using hash maps for reconciliation prevents the Node.js event loop from being blocked by heavy arithmetic and object traversal. Explicit proration modes ensure that individual payroll and bulk dashboard metrics share identical math.

## Prevention
- Always use bulk `groupBy` or `count` for financial dashboard metrics.
- Enforce `take` limits on any batch synchronization or linking utility.
- Use `Decimal | number` unions in interfaces to bridge Prisma's `Decimal` types with UI-friendly numbers.

## Related Issues
- `PurchaseInvoice` field rename (`purchaseInvoiceId`) alignment with Prisma schema.
