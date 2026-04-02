import { Decimal } from 'decimal.js';

export type LossResponsibility = 'TECH' | 'CENTER' | 'SPLIT';

interface ReworkImpactParams {
    totalRepairPrice: Decimal | number;
    originalPartsCost: Decimal | number;
    newReworkPartCost: Decimal | number;
    commissionRate: Decimal | number;
}

interface ReworkImpactResult {
    remainingLaborProfit: Decimal;
    newCommission: Decimal;
    excessLossAmount: Decimal;
    isLoss: boolean;
}

/**
 * Calculates the financial impact of adding a part during a warranty rework.
 * Adheres to the "Profit-First Loss Absorption" principle.
 */
export function calculateReworkImpact(params: ReworkImpactParams): ReworkImpactResult {
    const totalRepairPrice = new Decimal(params.totalRepairPrice);
    const originalPartsCost = new Decimal(params.originalPartsCost);
    const newReworkPartCost = new Decimal(params.newReworkPartCost);
    const commissionRate = new Decimal(params.commissionRate);

    // 1. Calculate Revenue available for labor (Revenue - All Parts)
    const totalPartsCost = originalPartsCost.plus(newReworkPartCost);
    const remainingLaborProfit = totalRepairPrice.minus(totalPartsCost);

    let newCommission = new Decimal(0);
    let excessLossAmount = new Decimal(0);

    if (remainingLaborProfit.gt(0)) {
        // 2. If profit remains, recalculate commission on the net labor profit
        newCommission = remainingLaborProfit.times(commissionRate).dividedBy(100);
    } else {
        // 3. If profit is wiped out, commission is 0 and we have an excess loss
        newCommission = new Decimal(0);
        excessLossAmount = remainingLaborProfit.abs();
    }

    return {
        remainingLaborProfit,
        newCommission: newCommission.toDecimalPlaces(2),
        excessLossAmount: excessLossAmount.toDecimalPlaces(2),
        isLoss: remainingLaborProfit.lt(0)
    };
}
