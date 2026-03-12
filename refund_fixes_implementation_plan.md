# Refund Feature Fixes - Implementation Plan

## Overview

This plan addresses **13 critical issues** in the refund ticket system, organized by severity. Each fix includes exact code locations, implementation steps, and testing instructions.

**Target Files**:
- [`src/actions/ticket-actions.ts`](src/actions/ticket-actions.ts) (primary)
- [`src/components/tickets/WorkflowActions.tsx`](src/components/tickets/WorkflowActions.tsx) (UI)
- [`src/components/tickets/RefundTicketModal.tsx`](src/components/tickets/RefundTicketModal.tsx) (UI)

---

## Phase 1: Critical Financial Bugs (Fix First - Blocks Production)

### Fix 1: CustomerTransaction Sign Error in fullTicketReturn

**Problem**: Creates negative amount with `type: 'CREDIT'` → double negative inflates customer balance.

**Location**: [`src/actions/ticket-actions.ts:2114-2134`](src/actions/ticket-actions.ts:2114)

**Current Code**:
```ts
await tx.customerTransaction.create({
    data: {
        customerId: ticket.customerId,
        type: 'CREDIT',
        amount: new Decimal(-amountToRefund),  // ❌ NEGATIVE
        description: `Ticket #${ticket.barcode} - Full Return Refund`,
        reference: ticket.id,
        createdBy: currentUser.id
    }
});

if (isDeferred) {
    await tx.customer.update({
        where: { id: ticket.customerId },
        data: { balance: { decrement: new Decimal(amountToRefund) } }  // ❌ DECREASE for refund
    });
}
```

**Fix**:
```ts
await tx.customerTransaction.create({
    data: {
        customerId: ticket.customerId,
        type: 'CREDIT',  // CREDIT reduces balance (correct semantics)
        amount: new Decimal(amountToRefund),  // ✅ POSITIVE
        description: `Ticket #${ticket.barcode} - Full Return Refund`,
        reference: ticket.id,
        createdBy: currentUser.id
    }
});

if (isDeferred) {
    await tx.customer.update({
        where: { id: ticket.customerId },
        data: { balance: { decrement: new Decimal(amountToRefund) } }  // ✅ Decrease = refund gives money back
    });
}
```

**Explanation**: In the system, `CREDIT` = reduce customer debt (they owe less). The amount should be positive. The `decrement` on balance is correct (balance goes down).

**Test**:
1. Create ticket with ACCOUNT payment, amountPaid = 100
2. Perform full return
3. Check customer balance: should decrease by 100 (e.g., from -100 to 0)
4. Verify CustomerTransaction.amount = 100 (positive), type = 'CREDIT'

---

### Fix 2: Partial Refund Payment Method Hardcoded

**Problem**: Always uses `CASH` regardless of original payment method.

**Location**: [`src/actions/ticket-actions.ts:780-789`](src/actions/ticket-actions.ts:780)

**Current Code**:
```ts
const payment = await tx.repairPayment.create({
    data: {
        ticketId,
        amount: new Decimal(amount),
        type: 'REFUND',
        method: 'CASH',  // ❌ HARDCODED
        reference: reason,
        recordedBy: user.name || user.username || "System"
    }
});
```

**Fix**:
```ts
// Fetch ticket with paymentMethod first (add to existing query at line 774)
const ticket = await tx.ticket.findFirst({
    where: { OR: [{ id: ticketId }, { barcode: ticketId }] },
    include: {
        payments: { orderBy: { recordedAt: 'desc' }, take: 1 }  // Get latest payment
    }
});
if (!ticket) throw new Error("Ticket not found");

// Determine refund method from original payment
const lastPayment = ticket.payments[0];
const refundMethod = lastPayment?.method || ticket.paymentMethod || 'CASH';

// Then use refundMethod in RepairPayment
const payment = await tx.repairPayment.create({
    data: {
        ticketId,
        amount: new Decimal(amount),
        type: 'REFUND',
        method: refundMethod,  // ✅ DYNAMIC
        reference: reason,
        recordedBy: user.name || user.username || "System"
    }
});
```

**Also Update**: Treasury transaction creation at line 815-824 to use `refundMethod` instead of hardcoded `'CASH'`.

**Test**:
1. Create ticket, pay with VISA
2. Partial refund → verify RepairPayment.method = 'VISA'
3. Verify Treasury transaction.paymentMethod = 'VISA'

---

### Fix 3: Partial Refund Accounting Account Wrong

**Problem**: Uses `4000` (Sales Revenue) for service tickets.

**Location**: [`src/actions/ticket-actions.ts:832-840`](src/actions/ticket-actions.ts:832)

**Current Code**:
```ts
await AccountingEngine.recordTransaction({
    description: `Refund: Ticket #${ticket.barcode}`,
    reference: ticketId,
    lines: [
        { accountCode: '4000', debit: amount, credit: 0, description: 'Service Revenue Reversed' },  // ❌
        { accountCode: '1000', debit: 0, credit: amount, description: 'Cash Refunded' }
    ]
}, tx);
```

**Fix**:
```ts
await AccountingEngine.recordTransaction({
    description: `Refund: Ticket #${ticket.barcode}`,
    reference: ticketId,
    lines: [
        { accountCode: '4100', debit: amount, credit: 0, description: 'Service Revenue Reversed' },  // ✅
        { accountCode: '1000', debit: 0, credit: amount, description: 'Cash Refunded' }
    ]
}, tx);
```

**Note**: `4100` is the Service Revenue account per [`transaction-factory.ts:219`](src/lib/accounting/transaction-factory.ts:219).

---

### Fix 4: Add ACCOUNT Payment Handling to Partial Refund

**Problem**: No special handling for ACCOUNT payments - should adjust customer balance, not Treasury.

**Location**: [`src/actions/ticket-actions.ts:756-847`](src/actions/ticket-actions.ts:756) (entire function)

**Required Changes**:

1. **Fetch ticket with payment method** (already done in Fix 2)
2. **Add conditional logic before Treasury update** (around line 809):

```ts
// After creating RepairPayment and updating Ticket.amountPaid

// 4. Handle ACCOUNT payments separately (no Treasury movement)
if (refundMethod === 'ACCOUNT') {
    if (!ticket.customerId) {
        throw new Error('Customer ID required for account refunds');
    }
    
    // Create CustomerTransaction to record the refund
    await tx.customerTransaction.create({
        data: {
            customerId: ticket.customerId,
            type: 'CREDIT',  // Reduces customer debt
            amount: new Decimal(amount),
            description: `Ticket #${ticket.barcode} - Refund`,
            reference: ticketId,
            createdBy: user.id
        }
    });
    
    // Decrease customer balance (they owe less now)
    await tx.customer.update({
        where: { id: ticket.customerId },
        data: { balance: { decrement: new Decimal(amount) } }
    });
    
    // Skip Treasury and Shift cash updates for ACCOUNT
    // (but still update shift totalRefunds for tracking)
    await tx.shift.update({
        where: { id: currentShift.id },
        data: {
            totalRefunds: { increment: amount },
            totalAccountRefunds: { increment: amount },  // Track separately
            lastHeartbeat: new Date()
        }
    });
} else {
    // Existing Treasury logic for CASH/VISA/WALLET/INSTAPAY
    // ... (lines 810-830)
}
```

3. **Update Shift tracking**: Add `totalAccountRefunds` increment for ACCOUNT method.

**Test**:
1. Ticket paid with ACCOUNT, amountPaid = 100
2. Partial refund $30
3. Verify: customer.balance decreases by 30
4. Verify: Treasury balance unchanged
5. Verify: shift.totalAccountRefunds increased by 30

---

## Phase 2: High Priority Fixes

### Fix 5: Fix Shift Accounting in fullTicketReturn for Non-Cash Refunds

**Problem**: VISA refund uses `totalCardSales -= amount` (should be separate counter). Missing `totalTicketRevenue*` updates.

**Location**: [`src/actions/ticket-actions.ts:2136-2152`](src/actions/ticket-actions.ts:2136)

**Current Code**:
```ts
if (refundMethod !== 'ACCOUNT') {
    const shiftUpdateData: any = {
        totalRefunds: { increment: amountToRefund }
    };
    
    if (refundMethod === 'CASH') shiftUpdateData.totalCashRefunds = { increment: amountToRefund };
    else if (refundMethod === 'VISA') shiftUpdateData.totalCardSales = { decrement: amountToRefund };  // ❌ WRONG
    
    await tx.shift.update({
        where: { id: currentShift.id },
        data: {
            totalRefunds: { increment: amountToRefund },
            totalCashRefunds: { increment: refundMethod === 'CASH' ? amountToRefund : 0 }
        }
    });
}
```

**Fix**: Align with [`processTicketPayment`](src/actions/ticket-actions.ts:1709-1756) pattern:

```ts
if (refundMethod !== 'ACCOUNT') {
    const shiftUpdateData: any = {
        totalRefunds: { increment: amountToRefund }
    };
    
    // Track refunds by method
    if (refundMethod === 'CASH') {
        shiftUpdateData.totalCashRefunds = { increment: amountToRefund };
        shiftUpdateData.totalTicketRevenueCash = { decrement: amountToRefund };  // Net revenue down
    } else if (refundMethod === 'VISA' || refundMethod === 'CARD' || refundMethod === 'MASTERCARD') {
        shiftUpdateData.totalCardRefunds = { increment: amountToRefund };  // Use totalCardRefunds (add to schema if missing)
        shiftUpdateData.totalTicketRevenueCard = { decrement: amountToRefund };
    } else if (refundMethod === 'WALLET' || refundMethod === 'VODAFONE_CASH') {
        shiftUpdateData.totalWalletRefunds = { increment: amountToRefund };
        shiftUpdateData.totalTicketRevenueWallet = { decrement: amountToRefund };
    } else if (refundMethod === 'INSTAPAY') {
        shiftUpdateData.totalInstapayRefunds = { increment: amountToRefund };
        shiftUpdateData.totalTicketRevenueInstapay = { decrement: amountToRefund };
    }
    
    await tx.shift.update({
        where: { id: currentShift.id },
        data: shiftUpdateData
    });
}
```

**Schema Check**: Verify Shift model has `totalCardRefunds`, `totalWalletRefunds`, `totalInstapayRefunds`. If not, add them.

**Test**:
1. Ticket paid with VISA $100
2. Full return
3. Verify: shift.totalCardRefunds += 100 (or create field)
4. Verify: shift.totalTicketRevenueCard -= 100

---

### Fix 6: Add Ticket Status Validation to Both Refund Actions

**Problem**: No check that ticket is in refundable state.

**Fix**: Add at start of both `refundTicket` and `fullTicketReturn`:

```ts
// After fetching ticket
const refundableStatuses = ['DELIVERED', 'PAID_DELIVERED', 'PICKED_UP'];
if (!refundableStatuses.includes(ticket.status)) {
    throw new Error(`Cannot refund ticket in status: ${ticket.status}. Ticket must be delivered or paid.`);
}
```

**Note**: `fullTicketReturn` already checks for `VOIDED` status (line 2067). Keep that check.

**Test**:
1. Try refund on NEW ticket → should fail
2. Try refund on IN_PROGRESS ticket → should fail
3. Try refund on DELIVERED ticket → should succeed

---

### Fix 7: Hide Full Return Button from Non-Admins in UI

**Problem**: Button visible to all users with DELIVERED tickets, but backend requires admin.

**Location**: [`src/components/tickets/WorkflowActions.tsx:169-190`](src/components/tickets/WorkflowActions.tsx:169)

**Current Code**:
```tsx
{(ticket.status === TicketStatus.PAID_DELIVERED || ticket.status === TicketStatus.DELIVERED) && (
    <div className="flex flex-col gap-2 items-end">
        {ticket.status === TicketStatus.PAID_DELIVERED && (
            <div className="flex items-center gap-2 relative z-50 pointer-events-auto">
                {/* Full Return button */}
                <Button onClick={() => setShowRefundModal(true)}>...</Button>
            </div>
        )}
    </div>
)}
```

**Fix**: Wrap button in role check:

```tsx
{(ticket.status === TicketStatus.PAID_DELIVERED || ticket.status === TicketStatus.DELIVERED) && (
    <div className="flex flex-col gap-2 items-end">
        {ticket.status === TicketStatus.PAID_DELIVERED && (
            <div className="flex items-center gap-2 relative z-50 pointer-events-auto">
                {(user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'مدير النظام' || user.role === 'المالك') ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowRefundModal(true);
                        }}
                        className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 h-8 rounded-lg px-2 flex gap-2 font-bold text-[10px] uppercase tracking-wider relative z-[100] cursor-pointer pointer-events-auto"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {t('fullReturn')}
                    </Button>
                ) : (
                    <div className="text-zinc-600 text-xs italic">
                        {t('adminOnlyRefund')}
                    </div>
                )}
            </div>
        )}
    </div>
)}
```

**Also**: Add translation key `adminOnlyRefund` in messages files.

---

## Phase 3: Medium Priority Fixes

### Fix 8: Fix Full Return Part Handling - Mark as REFUNDED Instead of Deleting

**Problem**: [`tx.ticketPart.deleteMany`](src/actions/ticket-actions.ts:2213) destroys audit trail.

**Location**: [`src/actions/ticket-actions.ts:2212-2215`](src/actions/ticket-actions.ts:2212)

**Current Code**:
```ts
// Delete all parts from the ticket (they are back in stock)
await tx.ticketPart.deleteMany({
    where: { ticketId: ticket.id }
});
```

**Fix**: Soft-delete with status change:

```ts
// Mark all parts as REFUNDED (preserve audit trail)
await tx.ticketPart.updateMany({
    where: { ticketId: ticket.id },
    data: {
        status: 'REFUNDED',
        deletedAt: new Date()
    }
});
```

**Note**: The `handleReturnedPartStock` already ran earlier (lines 2084-2093) to restore stock. This just updates the part records.

**Test**:
1. Full return ticket with 3 parts
2. Query TicketPart where ticketId → all 3 should have status = 'REFUNDED', deletedAt set
3. Verify no parts lost from database

---

### Fix 9: Add Idempotency Protection

**Problem**: Rapid double-clicks or network retry could cause duplicate refunds.

**Solution**: Check for existing refund with same amount/reason within last 5 minutes.

**Implementation** (add to both refund functions):

```ts
// At start of refundTicket, after fetching ticket:
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
const recentRefund = await tx.repairPayment.findFirst({
    where: {
        ticketId: ticket.id,
        type: 'REFUND',
        amount: new Decimal(amount),
        recordedAt: { gte: fiveMinutesAgo }
    }
});
if (recentRefund) {
    throw new Error("A refund with this amount was already processed within the last 5 minutes. Please wait or contact admin.");
}
```

**For fullTicketReturn**: Check if any REFUND payment exists for the full amount (or if ticket.status === 'VOIDED').

**Test**:
1. Submit refund once → success
2. Submit identical refund within 5 min → should fail
3. Submit after 5 min → should succeed (or better: use business rule to prevent entirely)

**Alternative**: Use ticket version field for optimistic locking (already exists in schema).

---

### Fix 10: Standardize Shift Refund Tracking Across Both Pathways

**Problem**: Inconsistent field usage (`totalCashRefunds` vs missing `totalCardRefunds` etc.)

**Approach**:
1. **Audit Shift schema** for all refund-related fields:
   - `totalRefunds` (exists)
   - `totalCashRefunds` (exists)
   - `totalAccountRefunds` (exists)
   - `totalCardRefunds` (may need to add)
   - `totalWalletRefunds` (may need to add)
   - `totalInstapayRefunds` (may need to add)

2. **Update fullTicketReturn** to use consistent pattern:

```ts
// Replace lines 2136-2152 with:
const shiftUpdateData: any = { totalRefunds: { increment: amountToRefund } };

switch (refundMethod) {
    case 'CASH':
        shiftUpdateData.totalCashRefunds = { increment: amountToRefund };
        shiftUpdateData.totalTicketRevenueCash = { decrement: amountToRefund };
        break;
    case 'VISA':
    case 'CARD':
    case 'MASTERCARD':
        shiftUpdateData.totalCardRefunds = { increment: amountToRefund };
        shiftUpdateData.totalTicketRevenueCard = { decrement: amountToRefund };
        break;
    case 'WALLET':
    case 'VODAFONE_CASH':
        shiftUpdateData.totalWalletRefunds = { increment: amountToRefund };
        shiftUpdateData.totalTicketRevenueWallet = { decrement: amountToRefund };
        break;
    case 'INSTAPAY':
        shiftUpdateData.totalInstapayRefunds = { increment: amountToRefund };
        shiftUpdateData.totalTicketRevenueInstapay = { decrement: amountToRefund };
        break;
    case 'ACCOUNT':
        shiftUpdateData.totalAccountRefunds = { increment: amountToRefund };
        // No revenue field for account (handled via AR)
        break;
}

await tx.shift.update({
    where: { id: currentShift.id },
    data: shiftUpdateData
});
```

3. **Update partial refund** (`refundTicket`) to use same pattern (already uses `totalRefunds` and `totalCashRefunds` for CASH, but needs handling for other methods).

---

### Fix 11: Improve Partial Refund Payment Status Logic

**Problem**: Sets `paymentStatus = 'partial'` unconditionally.

**Location**: [`src/actions/ticket-actions.ts:795-796`](src/actions/ticket-actions.ts:795)

**Fix**: Recalculate based on new amountPaid:

```ts
const newAmountPaid = Number(ticket.amountPaid) - amount;  // Need to fetch ticket.amountPaid first
const repairPrice = Number(ticket.repairPrice);
let newPaymentStatus = 'unpaid';
if (newAmountPaid >= repairPrice) {
    newPaymentStatus = 'paid';
} else if (newAmountPaid > 0) {
    newPaymentStatus = 'partial';
}

// Then in update:
await tx.ticket.update({
    where: { id: ticketId },
    data: {
        amountPaid: { decrement: amount },
        paymentStatus: newPaymentStatus
    }
});
```

**Note**: Need to fetch `repairPrice` from ticket at start of transaction.

---

## Phase 4: Low Priority / Enhancements

### Fix 12: Create Comprehensive Test Suite

**Create**: `src/__tests__/ticket-refunds.test.ts`

**Test Categories**:

1. **Partial Refund Tests**
   - Cash ticket partial refund
   - Account ticket partial refund
   - Card ticket partial refund
   - Refund exceeds amountPaid → error
   - Refund on non-delivered ticket → error
   - Duplicate refund idempotency

2. **Full Return Tests**
   - Full return cash ticket
   - Full return account ticket
   - Full return with parts (stock restoration)
   - Full return with damaged parts (wastage)
   - Full return on non-delivered ticket → error
   - Non-admin cannot full return
   - Customer balance correct after return
   - Commission clawback recorded

3. **Accounting Integration Tests**
   - Verify journal entries created
   - Correct GL accounts used (4100 vs 4000)
   - COGS reversal for full returns
   - Double-entry balance validation

4. **Shift Tracking Tests**
   - totalRefunds increments correctly
   - totalCashRefunds / totalCardRefunds etc.
   - totalTicketRevenue* decreases appropriately

5. **Stock Management Tests**
   - Parts returned to correct warehouse
   - Damaged parts logged as wastage
   - Product.stock synchronized

**Use**: Mock Prisma transaction client, test in isolation.

---

### Fix 13: Update API Documentation

**Create/Update**: `docs/refund-api.md` or update README

**Include**:
- Refundable ticket states
- Required permissions per refund type
- Payment method handling rules
- Accounting impact
- Shift tracking fields
- Error codes and messages
- Example requests/responses

---

## Implementation Order

### Day 1: Critical Fixes
1. Fix 1: CustomerTransaction sign
2. Fix 2: Payment method detection
3. Fix 3: Accounting account
4. Fix 4: ACCOUNT handling

**Test**: All partial refund scenarios, verify financial integrity

### Day 2: High Priority
5. Fix 5: Shift accounting consistency
6. Fix 6: Status validation
7. Fix 7: UI role check

**Test**: Full returns with various payment methods, UI role visibility

### Day 3: Medium Priority
8. Fix 8: Part REFUNDED status
9. Fix 9: Idempotency
10. Fix 10: Standardize shift tracking
11. Fix 11: Payment status recalculation

**Test**: Duplicate refund prevention, part audit trail

### Day 4: Testing & Documentation
12. Fix 12: Test suite
13. Fix 13: Documentation

**Final Validation**: Run full test matrix, staging environment smoke test

---

## Rollback Plan

For each fix:
1. **Document current behavior** (screenshots, logs)
2. **Create database backup** before applying
3. **Apply changes in separate commits** with clear messages
4. **Test on staging** with production-like data
5. **Deploy during low-traffic window**
6. **Monitor**: Refund volume, error rates, shift variance reports
7. **Rollback procedure**: Revert commit, restore DB if financial discrepancies detected

---

## Success Criteria

✅ All critical bugs fixed (Fixes 1-4)
✅ No negative customer balances after refunds
✅ Refund payment method matches original
✅ Accounting uses correct GL accounts
✅ ACCOUNT refunds don't touch Treasury
✅ Shift revenue tracking accurate
✅ Only admins can access full return
✅ Idempotency prevents duplicates
✅ All tests passing (≥ 80% coverage)
✅ Documentation updated

---

## Notes

- **Schema Changes**: May need to add `totalCardRefunds`, `totalWalletRefunds`, `totalInstapayRefunds` to Shift model
- **Migration**: Simple `ALTER TABLE` additions, default 0
- **Breaking Changes**: None expected (all fixes are internal)
- **Performance**: No impact (same query patterns)
- **Security**: Improved (role check added)

---

## References

- Analysis: [`refund_feature_analysis.md`](refund_feature_analysis.md)
- Business Logic: [`refund_business_logic.md`](refund_business_logic.md)
- Implementation Plan (original): [`refund_implementation_plan.md`](refund_implementation_plan.md)
