---
name: Landed Cost Allocation & Return Handling
description: Distributes purchase delivery charges across item costs proportionally by value, and correctly expenses non-recoverable delivery fees during purchase returns.
---

# Landed Cost Allocation & Return Handling

This plan addresses the requirement to distribute the delivery charge (`deliveryCharge`) of a purchase invoice proportionally over the purchased items (Landed Cost by Value), rather than leaving the delivery charge unallocated in the inventory asset account. Additionally, it ensures that when these items are returned, the supplier's refund only covers the original item cost, and the orphaned delivery cost is written off to an expense account.

## Problem Context
Currently, when a purchase invoice includes a delivery charge:
1. The accounting engine debits the `Inventory` asset for the total amount (`subtotal + deliveryCharge`).
2. However, the `Product.costPrice` is only updated to the `unitCost` (without delivery).
3. When the item is used in a ticket, COGS is recorded using the `unitCost`, leaving the delivery charge permanently orphaned in the `Inventory` ledger.
4. When returned, the ledger reverses using the `unitCost`, causing a discrepancy if we want to clear the inventory fully.

## Proposed Changes

### 1. Update `createPurchaseInvoice` (Landed Cost Allocation)
**File**: `src/actions/inventory.ts`
- Calculate the `subtotal` (sum of `quantity * unitCost`).
- If `deliveryCharge > 0` and `subtotal > 0`, calculate the overhead ratio: `ratio = deliveryCharge / subtotal`.
- When updating the `Product`'s moving average cost, calculate `landedUnitCost = unitCost * (1 + ratio)`.
- Set `Product.costPrice` to this `landedUnitCost` instead of the raw `unitCost`.
- Leave `PurchaseItem.unitCost` as the raw cost (so that supplier returns correctly refund the base price).

### 2. Update `createPurchaseReturn` (Accounting for Sunk Delivery Costs)
**File**: `src/actions/purchase-actions.ts`
- When fetching the original `invoice` to return, calculate its overhead ratio: `ratio = invoice.deliveryCharge / (invoice.totalAmount - invoice.deliveryCharge)`.
- For the returned items, the `actualReturnAmount` (what supplier refunds) is `quantity * unitCost`.
- Calculate `inventoryReductionAmount = quantity * unitCost * (1 + ratio)`.
- Calculate `nonRecoverableShippingLoss = inventoryReductionAmount - actualReturnAmount`.
- Modify the `AccountingEngine.recordTransaction` lines for the return:
  - **Debit**: Accounts Payable (Supplier) by `actualReturnAmount`
  - **Debit**: Shipping & Freight Losses (5340) by `nonRecoverableShippingLoss`
  - **Credit**: Inventory by `inventoryReductionAmount`

### 3. Create Dedicated Expense Account
**File**: `src/lib/accounting/constants.ts`
- Add a new account to `DEFAULT_ACCOUNTS`:
  `{ code: '5340', name: 'خسائر ومصروفات شحن غير مستردة', type: ACCOUNT_TYPES.EXPENSE, isSystem: true }`
- This ensures the P&L reports clearly show how much money is lost on shipping during returns, avoiding bloat in the Miscellaneous account.

## Verification Plan

### Manual Verification
- Create a test purchase invoice with items and a delivery charge.
- Verify that the `Product.costPrice` in the UI and DB correctly reflects the base price + proportional delivery charge.
- Create a ticket using this product, and verify the COGS journal entry matches the landed cost.
- Void the purchase (Return), and verify the generated journal entry correctly debits AP for the base cost, debits Expenses for the delivery loss, and credits Inventory for the full landed cost.
