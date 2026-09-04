import Decimal from "decimal.js";

/**
 * Calculates profit margin percentage using Decimal.js.
 * Returns 0 if totalRevenue <= 0 to prevent division by zero or nonsensical margins.
 */
export function calculateProfitMargin(
    netProfit: Decimal | number | string,
    totalRevenue: Decimal | number | string
): number {
    const rev = new Decimal(totalRevenue || 0);
    const profit = new Decimal(netProfit || 0);

    if (rev.lessThanOrEqualTo(0)) {
        return 0;
    }

    return profit
        .dividedBy(rev)
        .times(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();
}

/**
 * Calculates Average Order Value (AOV) using Decimal.js.
 * Returns 0 if saleCount <= 0.
 */
export function calculateAOV(
    totalSales: Decimal | number | string,
    saleCount: number
): number {
    if (!saleCount || saleCount <= 0) {
        return 0;
    }

    const sales = new Decimal(totalSales || 0);
    if (sales.lessThanOrEqualTo(0)) {
        return 0;
    }

    return sales
        .dividedBy(saleCount)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();
}

/**
 * Evaluates whether a product is at or below minimum stock threshold.
 * Falls back to 5 if minStock is null or undefined.
 */
export function isProductLowStock(
    stock: Decimal | number | string | null | undefined,
    minStock: Decimal | number | string | null | undefined,
    fallbackMinStock: number = 5
): boolean {
    const currentStock = new Decimal(stock ?? 0);
    const effectiveMin = (minStock !== null && minStock !== undefined)
        ? new Decimal(minStock)
        : new Decimal(fallbackMinStock);

    return currentStock.lessThanOrEqualTo(effectiveMin);
}

/**
 * Reconciles payment methods breakdown against total sales revenue.
 */
export function reconcilePaymentBreakdown(
    paymentAmounts: (Decimal | number | string)[],
    expectedTotal: Decimal | number | string
): { reconciled: boolean; difference: number; totalCalculated: number } {
    const totalCalc = paymentAmounts.reduce<Decimal>(
        (sum, amt) => sum.plus(new Decimal(amt || 0)),
        new Decimal(0)
    );
    const expected = new Decimal(expectedTotal || 0);
    const diff = totalCalc.minus(expected).abs();

    const reconciled = diff.lessThanOrEqualTo(new Decimal(0.01));

    return {
        reconciled,
        difference: diff.toDecimalPlaces(2).toNumber(),
        totalCalculated: totalCalc.toDecimalPlaces(2).toNumber()
    };
}

/**
 * Calculates startOfDay and endOfDay respecting a specific timezone offset.
 * Default is UTC+2 (Cairo standard time).
 */
export function getTimezoneDateBounds(
    startDateStr?: string,
    endDateStr?: string,
    timezoneOffsetHours: number = 2
): { startDate?: Date; endDate: Date } {
    const now = new Date();

    let endDate: Date;
    if (endDateStr && /^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
        const [y, m, d] = endDateStr.split('-').map(Number);
        // End of day: 23:59:59.999 in local timezone
        endDate = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - (timezoneOffsetHours * 3600 * 1000));
    } else if (endDateStr) {
        endDate = new Date(endDateStr);
    } else {
        endDate = now;
    }

    let startDate: Date | undefined;
    if (startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
        const [y, m, d] = startDateStr.split('-').map(Number);
        // Start of day: 00:00:00.000 in local timezone
        startDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - (timezoneOffsetHours * 3600 * 1000));
    } else if (startDateStr) {
        startDate = new Date(startDateStr);
    }

    return { startDate, endDate };
}
