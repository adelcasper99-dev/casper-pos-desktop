import { Decimal } from 'decimal.js';

/**
 * Validation utilities for commission calculations
 */

/**
 * Validates that a commission rate is within acceptable bounds (0-100%)
 */
export function validateCommissionRate(rate: number): boolean {
  return rate >= 0 && rate <= 100;
}

/**
 * Validates commission data integrity
 */
export function validateCommissionData(ticket: {
  repairPrice: Decimal | number;
  partsCost: Decimal | number;
  commissionRate: Decimal | number;
  commissionAmount: Decimal | number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  const repairPrice = new Decimal(ticket.repairPrice.toString())
  const partsCost = new Decimal(ticket.partsCost.toString())
  const commissionRate = new Decimal(ticket.commissionRate.toString())
  const commissionAmount = new Decimal(ticket.commissionAmount.toString())

  // Validate commission rate
  if (!validateCommissionRate(commissionRate.toNumber())) {
    errors.push(`Invalid commission rate: ${commissionRate}%. Must be between 0-100%.`);
  }

  // Validate amounts are non-negative
  if (repairPrice.lt(0)) {
    errors.push(`Repair price cannot be negative: EGP ${repairPrice}`);
  }

  if (partsCost.lt(0)) {
    errors.push(`Parts cost cannot be negative: EGP ${partsCost}`);
  }

  // Validate commission amount is reasonable
  const netProfit = repairPrice.minus(partsCost)
  const expectedCommission = new Decimal(calculateCommission(netProfit.toNumber(), commissionRate.toNumber()))
  const difference = commissionAmount.minus(expectedCommission).abs()

  // Allow small rounding differences (0.01)
  if (difference.gt(0.01)) {
    errors.push(
      `Commission amount mismatch. Expected: EGP ${expectedCommission.toFixed(2)}, Got: EGP ${commissionAmount.toFixed(2)}`
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculates net profit from repair
 */
export function calculateNetProfit(repairPrice: Decimal | number, partsCost: Decimal | number): number {
  return new Decimal(repairPrice.toString()).minus(new Decimal(partsCost.toString())).toNumber();
}

/**
 * Calculates commission amount based on net profit and rate.
 * Returns 0 for negative or zero profit.
 */
export function calculateCommission(netProfit: number, rate: number): number {
  if (netProfit <= 0) return 0;

  if (!validateCommissionRate(rate)) {
    throw new Error(`Invalid commission rate: ${rate}%. Must be between 0-100%.`);
  }

  return new Decimal(netProfit).times(rate).dividedBy(100).toDecimalPlaces(2).toNumber();
}

/**
 * Calculates shared loss amount based on negative net profit and loss rate
 */
export function calculateSharedLoss(netProfit: number, lossRate: number): number {
  if (netProfit >= 0) return 0;

  return new Decimal(Math.abs(netProfit)).times(lossRate).dividedBy(100).toDecimalPlaces(2).toNumber();
}

/**
 * Formats commission data for display
 */
export function formatCommissionBreakdown(data: {
  repairPrice: number;
  partsCost: number;
  commissionRate: number;
  commissionAmount: number;
}): {
  netProfit: string;
  commissionRate: string;
  commissionAmount: string;
} {
  const netProfit = new Decimal(data.repairPrice).minus(data.partsCost);

  return {
    netProfit: `EGP ${netProfit.toFixed(2)}`,
    commissionRate: `${new Decimal(data.commissionRate).toFixed(1)}%`,
    commissionAmount: `EGP ${new Decimal(data.commissionAmount).toFixed(2)}`
  };
}


/**
 * Gets the final total price of a ticket for display and profit calculation.
 * Prioritizes finalCustomerPrice (Actual agreed price) and falls back to repairPrice (Legacy/Estimated price).
 */
export function getTicketFinalPrice(ticket: { 
  finalCustomerPrice?: Decimal | number | null; 
  repairPrice: Decimal | number | null; 
}): number {
  const finalPrice = Number(ticket.finalCustomerPrice || 0);
  const repairPrice = Number(ticket.repairPrice || 0);
  
  // Use final customer price if it's set and greater than zero
  if (finalPrice > 0) return finalPrice;
  
  // Fallback to repair overall price
  return repairPrice;
}
