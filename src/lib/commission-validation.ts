import { Decimal } from 'decimal.js';

/**
 * Validation utilities for commission calculations
 * Hardened to prevent floating-point precision loss.
 */

/**
 * Validates that a commission rate is within acceptable bounds (0-100%)
 */
export function validateCommissionRate(rate: number | Decimal | string): boolean {
  const r = new Decimal(rate.toString());
  return r.gte(0) && r.lte(100);
}

/**
 * Validates commission data integrity
 */
export function validateCommissionData(ticket: {
  repairPrice: Decimal | number | string;
  partsCost: Decimal | number | string;
  commissionRate: Decimal | number | string;
  commissionAmount: Decimal | number | string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const repairPrice = new Decimal(ticket.repairPrice.toString());
  const partsCost = new Decimal(ticket.partsCost.toString());
  const commissionRate = new Decimal(ticket.commissionRate.toString());
  const commissionAmount = new Decimal(ticket.commissionAmount.toString());

  // Validate commission rate
  if (!validateCommissionRate(commissionRate)) {
    errors.push(`Invalid commission rate: ${commissionRate}%. Must be between 0-100%.`);
  }

  // Validate amounts are non-negative
  if (repairPrice.lt(0)) {
    errors.push(`Repair price cannot be negative: ${repairPrice}`);
  }

  if (partsCost.lt(0)) {
    errors.push(`Parts cost cannot be negative: ${partsCost}`);
  }

  // Validate commission amount is reasonable
  const netProfit = repairPrice.minus(partsCost);
  const expectedCommission = calculateCommission(netProfit, commissionRate);
  const difference = commissionAmount.minus(expectedCommission).abs();

  // Allow very small rounding differences (0.0001) for safety
  if (difference.gt(0.01)) {
    errors.push(
      `Commission amount mismatch. Expected: ${expectedCommission.toFixed(2)}, Got: ${commissionAmount.toFixed(2)}`
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
export function calculateNetProfit(repairPrice: Decimal | number | string, partsCost: Decimal | number | string): Decimal {
  return new Decimal(repairPrice.toString()).minus(new Decimal(partsCost.toString()));
}

/**
 * Calculates commission amount based on net profit and rate.
 * Returns 0 for negative or zero profit.
 */
export function calculateCommission(netProfit: Decimal | number | string, rate: Decimal | number | string): Decimal {
  const profit = new Decimal(netProfit.toString());
  const r = new Decimal(rate.toString());

  if (profit.lte(0)) return new Decimal(0);

  if (!validateCommissionRate(r)) {
    throw new Error(`Invalid commission rate: ${r}%. Must be between 0-100%.`);
  }

  return profit.times(r).dividedBy(100).toDecimalPlaces(4);
}

/**
 * Calculates shared loss amount based on negative net profit and loss rate
 */
export function calculateSharedLoss(netProfit: Decimal | number | string, lossRate: Decimal | number | string): Decimal {
  const profit = new Decimal(netProfit.toString());
  const rate = new Decimal(lossRate.toString());

  if (profit.gte(0)) return new Decimal(0);

  return profit.abs().times(rate).dividedBy(100).toDecimalPlaces(4);
}

/**
 * Formats commission data for display
 */
export function formatCommissionBreakdown(data: {
  repairPrice: Decimal | number | string;
  partsCost: Decimal | number | string;
  commissionRate: Decimal | number | string;
  commissionAmount: Decimal | number | string;
}): {
  netProfit: string;
  commissionRate: string;
  commissionAmount: string;
} {
  const repairPrice = new Decimal(data.repairPrice.toString());
  const partsCost = new Decimal(data.partsCost.toString());
  const commissionRate = new Decimal(data.commissionRate.toString());
  const commissionAmount = new Decimal(data.commissionAmount.toString());

  const netProfit = repairPrice.minus(partsCost);

  return {
    netProfit: `${netProfit.toFixed(2)}`,
    commissionRate: `${commissionRate.toFixed(1)}%`,
    commissionAmount: `${commissionAmount.toFixed(2)}`
  };
}

/**
 * Gets the final total price of a ticket for display and profit calculation.
 */
export function getTicketFinalPrice(ticket: { 
  finalCustomerPrice?: Decimal | number | null; 
  repairPrice: Decimal | number | null; 
}): Decimal {
  const finalPrice = new Decimal(ticket.finalCustomerPrice?.toString() || '0');
  const repairPrice = new Decimal(ticket.repairPrice?.toString() || '0');
  
  if (finalPrice.gt(0)) return finalPrice;
  return repairPrice;
}
