# Refund Ticket Feature - Comprehensive Analysis

## Executive Summary

The POS system implements a **two-pathway refund system** for repair tickets:

1. **Partial Refund** (`refundTicket`) - Refunds a specific amount without voiding the ticket
2. **Full Return** (`fullTicketReturn`) - Complete void with stock reversal and ticket cancellation

Both pathways are accessible via the [`RefundTicketModal`](src/components/tickets/RefundTicketModal.tsx) component in the ticket workflow actions.

---

## Architecture Overview

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **RefundTicketModal** | [`src/components/tickets/RefundTicketModal.tsx`](src/components/tickets/RefundTicketModal.tsx:1) | UI modal for partial/full refunds |
| **WorkflowActions** | [`src/components/tickets/WorkflowActions.tsx`](src/components/tickets/WorkflowActions.tsx:1) | Triggers refund modal for DELIVERED/PAID_DELIVERED tickets |
| **refundTicket** | [`src/actions/ticket-actions.ts:756`](src/actions/ticket-actions.ts:756) | Server action for partial refunds |
| **fullTicketReturn** | [`src/actions/ticket-actions.ts:2039`](src/actions/ticket-actions.ts:2039) | Server action for full returns (admin-only) |
| **AccountingEngine** | [`src/lib/accounting/transaction-factory.ts`](src/lib/accounting/transaction-factory.ts:1) | Double-entry accounting integration |
| **handleReturnedPartStock** | [`src/lib/stock-helpers.ts:74`](src/lib/stock-helpers.ts:74) | Stock restoration logic for returned parts |

### Database Models Involved

- **Ticket** - Main entity with financial fields (`amountPaid`, `repairPrice`, `paymentStatus`)
- **RepairPayment** - Records all payments/refunds (type: `PAYMENT`\|`REFUND`\|`DEPOSIT`)
- **Shift** - Tracks refunds via `totalRefunds`, `totalCashRefunds`, `totalTicketRevenue*`
- **Treasury** - Cash balance via `Transaction` records
- **Transaction** - Treasury movement ledger
- **TicketPart** - Parts used in repair (status: `ACTIVE`\|`REFUNDED`)
- **Customer** & **CustomerTransaction** - For account-based payments
- **JournalEntry** & **JournalLine** - Double-entry accounting

---

## Refund Pathways

### 1. Partial Refund (`refundTicket`)

**Trigger**: User enters amount + reason, clicks "Confirm Refund"

**Flow**:
```
1. Validate: amount > 0, amount ≤ amountPaid, reason provided
2. Create RepairPayment (type: REFUND, method: CASH hardcoded)
3. Update Ticket: amountPaid -= amount, paymentStatus = 'partial'
4. Update Shift: totalRefunds += amount
5. Treasury: Create Transaction (type: REFUND, amount: -amount)
6. Treasury balance: -= amount
7. Accounting: recordRefund() → Debit 4000, Credit 1000
```

**Code Reference**: [`src/actions/ticket-actions.ts:756-847`](src/actions/ticket-actions.ts:756)

**Key Issues**:
- ❌ Hardcoded `method: 'CASH'` - doesn't reflect original payment method
- ❌ No stock handling - parts remain with customer even if refunded
- ❌ Accounting uses `4000` (Sales Revenue) instead of `4100` (Service Revenue)
- ❌ No customer balance handling for ACCOUNT payments
- ❌ Missing payment method validation - should match original payment
- ⚠️ Permission: `PERMISSIONS.POS_REFUND` (lower privilege than full return)

### 2. Full Return (`fullTicketReturn`)

**Trigger**: User checks "Full Return" checkbox, enters reason, clicks "Void & Return"

**Flow**:
```
1. Admin/Manager check
2. Validate ticket not already VOIDED
3. For each part:
   - If not damaged: return to stock (incrementWarehouseStock)
   - If damaged: log as wastage
4. Calculate amountToRefund = ticket.amountPaid
5. Determine refundMethod = last payment method (or CASH fallback)
6. Create RepairPayment (type: REFUND)
7. If customerId exists:
   - Create CustomerTransaction (type: CREDIT, amount: -amount)
   - If ACCOUNT: customer.balance -= amount
8. Update Shift:
   - totalRefunds += amount
   - totalCashRefunds += amount (if CASH)
9. Treasury: Transaction (type: REFUND, amount: -amount), balance -= amount
10. Accounting: recordRefund() with cogsReversal
    - Debit 4100 (Service Revenue)
    - Credit payment account
    - Debit 1200 (Inventory) if COGS reversal
    - Credit 5000 (COGS) if COGS reversal
11. Update Ticket:
    - status = VOIDED
    - amountPaid = 0, repairPrice = 0, partsCost = 0
    - commissionClawback = original commission
    - returnCount += 1
12. Delete all TicketPart records
```

**Code Reference**: [`src/actions/ticket-actions.ts:2039-2226`](src/actions/ticket-actions.ts:2039)

**Key Issues**:
- ❌ CustomerTransaction sign bug: creates `type: 'CREDIT'` with `amount: -amount` (double negative)
- ❌ Shift accounting inconsistencies:
  - VISA: `totalCardSales -= amount` (should be `totalCardRefunds +=` or similar)
  - Missing `totalTicketRevenue*` adjustments for non-cash methods
- ❌ Only updates `totalCashRefunds` for CASH - what about other methods?
- ✅ Stock handling correct via `handleReturnedPartStock`
- ✅ COGS reversal included
- ✅ Commission clawback recorded
- ⚠️ Permission: `PERMISSIONS.TICKET_EDIT` + admin role check

---

## Identified Issues by Severity

### 🔴 Critical Financial Bugs

1. **CustomerTransaction Sign Error** (full return)
   - Location: [`src/actions/ticket-actions.ts:2117-2126`](src/actions/ticket-actions.ts:2117)
   - Creates `type: 'CREDIT'` with negative amount
   - Impact: Customer balance calculations inverted
   - Fix: Use positive amount with correct type, or follow convention from `applyCustomerCredit`

2. **Partial Refund Payment Method Hardcoded**
   - Location: [`src/actions/ticket-actions.ts:785`](src/actions/ticket-actions.ts:785)
   - Always uses `CASH` regardless of original payment
   - Impact: Treasury misattribution, incorrect shift revenue tracking
   - Fix: Fetch ticket's payment method from `ticket.paymentMethod` or last payment

3. **Partial Refund Accounting Account Wrong**
   - Location: [`src/actions/ticket-actions.ts:836-840`](src/actions/ticket-actions.ts:836)
   - Uses `4000` (Sales Revenue) for service tickets
   - Impact: Incorrect GL mapping, financial reports distorted
   - Fix: Use `4100` (Service Revenue) or make configurable

4. **Partial Refund Ignores Customer Balance for ACCOUNT Payments**
   - Location: [`src/actions/ticket-actions.ts:756-847`](src/actions/ticket-actions.ts:756)
   - No special handling for `paymentMethod === 'ACCOUNT'`
   - Impact: ACCOUNT refunds incorrectly hit Treasury instead of reducing customer debt
   - Fix: Add logic similar to `processTicketPayment` lines 1616-1658

### 🟡 Medium Severity

5. **Shift Accounting Inconsistency** (full return)
   - Location: [`src/actions/ticket-actions.ts:2136-2152`](src/actions/ticket-actions.ts:2136)
   - VISA refund: `totalCardSales -= amount` (should be separate refund counter)
   - Missing adjustments for `totalTicketRevenueCard/Wallet/Instapay`
   - Impact: Shift variance reports incorrect
   - Fix: Align with `processTicketPayment` pattern (lines 1709-1756)

6. **Partial Refund Does Not Return Parts**
   - Location: [`refundTicket`](src/actions/ticket-actions.ts:756) never calls stock helpers
   - Impact: Customer keeps parts but gets money back → inventory loss
   - Decision: Should partial refunds return parts? Business logic needed.

7. **UI Security Gap - Full Return Visible to Non-Admins**
   - Location: [`src/components/tickets/WorkflowActions.tsx:169-190`](src/components/tickets/WorkflowActions.tsx:169)
   - Shows "Full Return" button to all users with DELIVERED tickets
   - Impact: Non-admins see button, click → backend error (poor UX, potential confusion)
   - Fix: Conditionally render based on user role

8. **Missing Ticket Status Validation**
   - Location: Both refund actions
   - No check that ticket is in refundable state (DELIVERED/PAID_DELIVERED)
   - Impact: Could refund NEW/IN_PROGRESS tickets incorrectly
   - Fix: Add status guard similar to `checkTicketLock`

### 🟢 Low Severity / Enhancements

9. **No Idempotency Protection**
   - Both actions lack duplicate detection
   - Impact: Rapid double-clicks could cause double-refund if UI fails
   - Fix: Check for existing refund of same amount/reason within time window

10. **Partial Refund Payment Status Logic Simplistic**
    - Sets `paymentStatus = 'partial'` unconditionally
    - Should recalculate based on `amountPaid / repairPrice`
    - Fix: Compute proper status after refund

11. **Full Return Deletes Parts Instead of Marking REFUNDED**
    - Uses `deleteMany` on TicketPart
    - Impact: Loss of audit trail for which parts were returned
    - Fix: Mark as `REFUNDED` with timestamp, similar to `refundTicketPart`

12. **Inconsistent Shift Total Refunds Tracking**
    - `refundTicket` updates `totalRefunds` and `totalCashRefunds`
    - `fullTicketReturn` only updates `totalRefunds` (and `totalCashRefunds` for CASH)
    - Impact: Incomplete shift tracking for non-cash refunds
    - Fix: Standardize across both pathways

---

## Permission Model

| Action | Permission | Additional Checks |
|--------|------------|-------------------|
| `refundTicket` | `PERMISSIONS.POS_REFUND` | Active shift required |
| `fullTicketReturn` | `PERMISSIONS.TICKET_EDIT` | Must be ADMIN/MANAGER/المالك/مدير النظام |
| `initiateWarrantyReturn` | `PERMISSIONS.TICKET_EDIT` | Warranty validity check |

---

## Accounting Integration

### Chart of Accounts Used

| Code | Account | Usage |
|------|---------|-------|
| 1000 | Cash on Hand | Cash refunds/collections |
| 1010 | Bank/Card | Card refunds/collections |
| 1020 | Mobile Wallet | Wallet refunds/collections |
| 1100 | Accounts Receivable | Deferred/account adjustments |
| 4000 | Sales Revenue | **MISUSED** - should be for POS sales only |
| 4100 | Service Revenue | Ticket refunds (correct) |
| 5000 | COGS | Cost of Goods Sold reversal |
| 1200 | Inventory Asset | Stock restoration |

### Accounting Entry Patterns

**Partial Refund (current - incorrect)**:
```ts
{ accountCode: '4000', debit: amount, credit: 0 }  // Revenue reversed
{ accountCode: '1000', debit: 0, credit: amount }  // Cash out
```

**Full Return (correct)**:
```ts
{ accountCode: '4100', debit: amount, credit: 0 }  // Service Revenue reversed
{ accountCode: '1000', debit: 0, credit: amount }  // Cash out (or AR account)
{ accountCode: '1200', debit: cogs, credit: 0 }    // Inventory restored
{ accountCode: '5000', debit: 0, credit: cogs }    // COGS reversed
```

---

## Stock Management

### `handleReturnedPartStock` Logic

**File**: [`src/lib/stock-helpers.ts:74-134`](src/lib/stock-helpers.ts:74)

```ts
if (isDamaged) {
    // Log wastage, no stock increment
    await tx.stockWastage.create(...)
    await tx.stockMovement.create({ type: 'WASTAGE', ... })
} else {
    // Return to warehouse stock
    await incrementWarehouseStock(tx, productId, warehouseId, quantity)
    await tx.stockMovement.create({ type: 'REFUND', toWarehouseId, ... })
}
```

**Used by**:
- `fullTicketReturn` - returns all parts (isDamaged: false)
- `refundTicketPart` - marks single part as refunded/damaged

**Not used by**:
- `refundTicket` (partial refund) - **stock not handled**

---

## Data Model Review

### Ticket Status Values

```ts
export const TicketStatus = {
    NEW, IN_TRANSIT_TO_CENTER, AT_CENTER, DIAGNOSING,
    PENDING_APPROVAL, IN_PROGRESS, QC_PENDING, WAITING_FOR_PARTS,
    COMPLETED, IN_TRANSIT_TO_BRANCH, READY_AT_BRANCH,
    DELIVERED, PICKED_UP, CANCELLED, PAID_DELIVERED,
    VOIDED, RETURNED_FOR_REFIX, REJECTED
}
```

**Refundable states**: `DELIVERED`, `PAID_DELIVERED` (based on UI logic)

### Shift Refund Tracking Fields

```prisma
totalRefunds            Decimal  // All refunds (cash + non-cash)
totalCashRefunds        Decimal  // Cash refunds only
totalAccountRefunds     Decimal  // Account refunds (missing in some updates?)
totalTicketRevenueCash  Decimal  // Net ticket cash revenue (sales - refunds)
totalTicketRevenueCard  Decimal  // Net ticket card revenue
totalTicketRevenueWallet Decimal // Net ticket wallet revenue
totalTicketRevenueInstapay Decimal // Net ticket instapay revenue
```

---

## Recommendations

### Immediate Fixes (High Priority)

1. **Fix CustomerTransaction sign in full return** ([`ticket-actions.ts:2117`](ticket-actions.ts:2117))
   - Change to: `type: 'CREDIT', amount: new Decimal(amountToRefund)`

2. **Add payment method detection to partial refund**
   - Fetch ticket with `paymentMethod` field
   - Use that method instead of hardcoded `'CASH'`

3. **Fix partial refund accounting**
   - Use `4100` (Service Revenue) instead of `4000`
   - Or make dynamic based on ticket type

4. **Add ACCOUNT payment handling to partial refund**
   - Mirror logic from `processTicketPayment` (lines 1616-1658)
   - Adjust customer balance, create CustomerTransaction

5. **Fix shift accounting in full return for non-cash methods**
   - Add `totalCardRefunds` / `totalWalletRefunds` / etc. updates
   - Or use existing `totalRefunds` consistently and adjust `totalTicketRevenue*`

6. **Hide full return option from non-admins in UI**
   - Check user role before rendering button in WorkflowActions

### Medium Priority

7. **Add ticket status validation** to both refund actions
   - Only allow if status in ['DELIVERED', 'PAID_DELIVERED']

8. **Implement idempotency check**
   - Check for recent refund with same amount/reason
   - Or use optimistic locking via ticket version

9. **Standardize part handling in partial refunds**
   - Business decision: Should partial refunds return parts?
   - If yes, integrate `handleReturnedPartStock` with proration

10. **Mark parts as REFUNDED instead of deleting** in full return
    - Preserve audit trail
    - Set `status: 'REFUNDED'`, `deletedAt: new Date()`

### Long-term Improvements

11. **Refactor refund logic into shared helper**
    - Common code: shift updates, treasury transactions, accounting
    - Reduce duplication between `refundTicket` and `fullTicketReturn`

12. **Add comprehensive refund audit log**
    - Capture pre-refund state (amountPaid, parts, etc.)
    - Link all transactions (treasury, accounting, stock) to refund ID

13. **Implement refund limits/approvals**
    - Max refund amount per transaction/day
    - Manager approval for large refunds

14. **Add refund reporting**
    - Refund volume by cashier, method, reason
    - Part return rates by product

---

## Testing Scenarios

### Partial Refund Test Matrix

| Scenario | Ticket Total | Refund Amount | Expected amountPaid | Stock Impact | Treasury Δ | Customer Balance Δ |
|----------|--------------|---------------|---------------------|--------------|------------|-------------------|
| Cash ticket, partial | $100 | $30 | $70 | none | -$30 | N/A |
| Account ticket, partial | $100 | $30 | $70 | none | $0 | -$30 (decrease debt) |
| Full refund (cash) | $100 | $100 | $0 | parts returned | -$100 | N/A |
| Full refund (account) | $100 | $100 | $0 | parts returned | $0 | -$100 (decrease debt) |

### Edge Cases

- Refund amount > amountPaid → blocked
- Refund amount = 0 → blocked (except warranty even swap)
- Multiple partial refunds summing > amountPaid → blocked
- Refund on VOIDED ticket → blocked
- Refund on NEW ticket → should be blocked (missing guard)

---

## Conclusion

The refund ticket feature is **functionally comprehensive** but has **critical financial bugs** that must be fixed before production use. The most severe issues are:

1. Customer balance incorrectly calculated in full returns
2. Partial refunds ignore payment method and customer accounts
3. Shift revenue tracking inconsistent
4. UI exposes admin-only function to all users

**Recommended Action**: Address Critical and Medium priority fixes before enabling refunds in production. Implement comprehensive testing on staging environment with various payment methods and refund scenarios.

---

## References

- **Business Logic Audit**: [`refund_business_logic.md`](refund_business_logic.md:1)
- **Implementation Plan**: [`refund_implementation_plan.md`](refund_implementation_plan.md:1)
- **Database Schema**: [`prisma/schema.prisma`](prisma/schema.prisma:1)
- **Ticket Types**: [`src/types/ticket.ts`](src/types/ticket.ts:1)
- **Constants**: [`src/lib/constants.ts`](src/lib/constants.ts:1)
