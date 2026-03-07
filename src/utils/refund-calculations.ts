/**
 * Refund Calculation Utilities — Casper POS
 *
 * Functions for computing exact refund values, handling prorated discounts /
 * taxes, and determining deferred-payment split amounts.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Prorated Item Refund
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates the exact refund value for a specific set of returned items,
 * absorbing any global invoice discount and tax proportionally.
 *
 * Example:
 *   Invoice subtotal = 1000, discount = 100, tax = 90
 *   Returning items worth 200 (20% of invoice)
 *   → proratedDiscount = 100 × 0.20 = 20
 *   → proratedTax      =  90 × 0.20 = 18
 *   → refundValue      = 200 - 20 + 18 = 198
 *
 * @param itemPrice         Unit price of the item that is being refunded
 * @param refundQty         Number of units being returned
 * @param saleSubTotal      Total invoice subtotal (sum of all item lines, before discount/tax)
 * @param saleDiscountAmount Total global discount amount applied to the invoice
 * @param saleTaxAmount     Total tax amount applied to the invoice
 * @returns Exact refund value rounded to 2 decimal places
 */
export function calculateProratedRefundValue(
    itemPrice: number,
    refundQty: number,
    saleSubTotal: number,
    saleDiscountAmount: number,
    saleTaxAmount: number
): number {
    const lineTotalValue = itemPrice * refundQty;

    // Avoid division-by-zero when invoice has no items
    const weightRatio = saleSubTotal > 0 ? lineTotalValue / saleSubTotal : 0;

    const proratedDiscount = saleDiscountAmount * weightRatio;
    const proratedTax = saleTaxAmount * weightRatio;

    const finalRefundValue = lineTotalValue - proratedDiscount + proratedTax;

    return parseFloat(finalRefundValue.toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
// Deferred / ACCOUNT Split-Logic
// ─────────────────────────────────────────────────────────────────────────────

export interface DeferredRefundSplit {
    /** Amount to physically deduct from the treasury (cash paid back) */
    amountToCash: number;
    /** Amount to reduce from the customer's outstanding debt */
    amountToAccount: number;
}

/**
 * Determines how to split a refund amount between cash (physical treasury)
 * and account balance (customer debt reduction) for credit / deferred invoices.
 *
 * Rules:
 *  - ACCOUNT sales: 100% goes to account balance (no cash ever changes hands)
 *  - DEFERRED sales: cash portion is capped at what the customer originally paid;
 *    anything beyond that reduces the pending debt
 *  - All other methods: 100% cash refund
 *
 * @param paymentMethod    Original sale's payment method
 * @param refundTotal      Total amount being refunded
 * @param originalPaidCash How much cash the customer actually paid on the invoice
 *                         (sum of SalePayment rows that are NOT 'ACCOUNT'/'DEFERRED')
 */
export function splitDeferredRefund(
    paymentMethod: string,
    refundTotal: number,
    originalPaidCash: number
): DeferredRefundSplit {
    if (paymentMethod === 'ACCOUNT') {
        return { amountToCash: 0, amountToAccount: refundTotal };
    }

    if (paymentMethod === 'DEFERRED') {
        const amountToCash = Math.min(refundTotal, originalPaidCash);
        const amountToAccount = parseFloat((refundTotal - amountToCash).toFixed(2));
        return { amountToCash: parseFloat(amountToCash.toFixed(2)), amountToAccount };
    }

    // CASH, VISA, INSTAPAY, WALLET — full cash refund
    return { amountToCash: refundTotal, amountToAccount: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// COGS Reversal
// ─────────────────────────────────────────────────────────────────────────────

export interface RefundItem {
    unitCost: number;
    refundQty: number;
}

/**
 * Calculates the total Cost of Goods Sold reversal for a set of returned items.
 * This value is used to credit account 5000 (COGS) and debit 1300 (Inventory).
 *
 * @param items  Array of returned items with unitCost and refundQty
 * @returns Total COGS reversal rounded to 2 decimal places
 */
export function calculateCogsReversal(items: RefundItem[]): number {
    const total = items.reduce(
        (sum, item) => sum + item.unitCost * item.refundQty,
        0
    );
    return parseFloat(total.toFixed(2));
}
