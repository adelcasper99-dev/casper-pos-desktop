# 🛠️ Enhanced Execution Plan: Zero-Regression Fixes

**Objective**: Safely resolve the 6 critical financial and architectural gaps identified in the POS Refund cycle without introducing side effects, breaking foreign keys, or causing data loss.

---

## 🏗️ Guiding Principles for Implementation
1. **Zero Data Loss**: Never recalculate mathematical constants dynamically if they can be fetched securely from atomic counters.
2. **100% Atomicity**: Every logical fix that touches multiple tables (Treasury + Shift + Logs) must be inside a single Prisma `$transaction(async (tx) => { ... })`.
3. **Immutability of History**: Never hard-delete financial records if they affect existing balances. Soft-delete and generate reversing journal entries.

---

## 📝 Step-by-Step Implementation Strategy

### Phase 1: Fixing Core Sales & Shift Mechanics (sales-actions.ts)

**Action 1: Fix Deferred Split Null Pointer**
* **Target**: `partialRefundSale`
* **Execution**: 
  * Modify the initial `prisma.sale.findUnique` query.
  * Inject `include: { payments: true }` into the relation graph.
  * **Safety Check**: Ensure TypeScript recognizes the `payments` array so `amountToCash` caps accurately at exactly what the customer paid in physical cash.

**Action 2: Fix Phantom Shift Variances in Full Refunds**
* **Target**: `refundSale`
* **Execution**:
  * Locate the `tx.shift.update` block handling `totalRefunds`.
  * Replace `{ increment: sale.totalAmount }` with `{ increment: amountToCash }`.
  * **Safety Check**: Ensure `amountToCash` defaults to `0` if the sale was 100% Account Balance, preventing `NaN` exceptions.

**Action 3: Implement Partial Refund Shift Tracking**
* **Target**: `partialRefundSale`
* **Execution**:
  * Inside the `$transaction`, append a new Prisma call: `tx.shift.update`.
  * Increment the shift's `totalRefunds` by the calculated `amountToCash`.
  * **Safety Check**: Only execute this if a shift is currently `OPEN`.

---

## 🧮 Phase 2: Fixing Prorated Mathematics (refund-calculations.ts)

**Action 4: Stabilize Prorated Discount Calculation**
* **Target**: `calculateProratedRefundValue`
* **Execution**:
  * Remove reliance on the mutation-prone `sale.subTotal` parameter.
  * Loop through the `sale.items` array and dynamically calculate the raw mathematical baseline: `sum(item.price * item.quantity)`.
  * Divide the refund item's value by this dynamic `originalItemsSubTotal` to get the true ratio.
  * **Safety Check**: Floor/Ceil fractions safely using `Decimal` library to prevent micro-penny drift errors over multiple refunds.

---

## 🏦 Phase 3: Safeguarding Treasury & Shift Balances (accounting.ts & shifts)

**Action 5: Fix Expense Deletion Treasury Leak**
* **Target**: `deleteExpense` in `accounting.ts`
* **Execution**:
  1. Convert the standalone `prisma.expense.delete` into a `$transaction`.
  2. Use the expense ID or description to locate the linked transaction in the `Treasury` table.
  3. Soft-delete the treasury transaction (`deletedAt: new Date()`).
  4. Natively increment the Treasury's physical `balance` by the expense amount.
  5. Check if the expense belongs to an `OPEN` shift; if so, decrement `shift.totalExpenses`.
  6. **Safety Check**: Wrap in try/catch to ensure that if the treasury relation is orphaned/missing, the expense deletion does not permanently block.

**Action 6: Fix Admin Force-Close Formula**
* **Target**: `forceCloseShift` in `shift-management-actions.ts`
* **Execution**:
  * Locate the `estimatedCash` mathematical declaration.
  * Modify the logic: `const estimatedCash = startCash.add(totalCashSales).minus(totalExpenses).minus(totalCashRefunds)`.
  * **Safety Check**: Use Prisma's `Decimal.minus()` explicitly to prevent JavaScript floating-point errors (e.g., `0.1 + 0.2 = 0.30000000000000004`).

---

## ✅ Post-Implementation QA Checklist
- [ ] Refund a $100 Cash transaction $\rightarrow$ Verify Treasury is -$100, Shift shows $100 Refund.
- [ ] Refund a $100 Account transaction $\rightarrow$ Verify Treasury is untouched, Customer Balance is -$100, Shift shows $0 Refund.
- [ ] Do 3 separate Partial Refunds on a single receipt $\rightarrow$ Verify total refund value matches original receipt exactly to the penny.
- [ ] Delete a $50 Expense $\rightarrow$ Verify Treasury Balance increments by $50 instantly.
- [ ] Force close a shift with $50 generated refunds $\rightarrow$ Verify Shift Variance is exactly $0.
