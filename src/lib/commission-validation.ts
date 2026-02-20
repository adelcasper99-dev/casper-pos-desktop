import { Decimal } from '@prisma/client/runtime/library';

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
  repairPrice: Decimal;
  partsCost: Decimal;
  commissionRate: Decimal;
  commissionAmount: Decimal;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const repairPrice = Number(ticket.repairPrice);
  const partsCost = Number(ticket.partsCost);
  const commissionRate = Number(ticket.commissionRate);
  const commissionAmount = Number(ticket.commissionAmount);

  // Validate commission rate
  if (!validateCommissionRate(commissionRate)) {
    errors.push(`Invalid commission rate: ${commissionRate}%. Must be between 0-100%.`);
  }

  // Validate amounts are non-negative
  if (repairPrice < 0) {
    errors.push(`Repair price cannot be negative: SAR ${repairPrice}`);
  }

  if (partsCost < 0) {
    errors.push(`Parts cost cannot be negative: SAR ${partsCost}`);
  }

  // Validate commission amount is reasonable
  const netProfit = repairPrice - partsCost;
  const expectedCommission = calculateCommission(netProfit, commissionRate);
  const difference = Math.abs(commissionAmount - expectedCommission);

  // Allow small floating point differences (0.01)
  if (difference > 0.01) {
    errors.push(
      `Commission amount mismatch. Expected: SAR ${expectedCommission.toFixed(2)}, Got: SAR ${commissionAmount.toFixed(2)}`
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
export function calculateNetProfit(repairPrice: Decimal, partsCost: Decimal): number {
  return Number(repairPrice) - Number(partsCost);
}

/**
 * Calculates commission amount based on net profit and rate
 * Returns 0 for negative or zero profit
 */
export function calculateCommission(netProfit: number, rate: number): number {
  // No commission on negative profit (loss) or zero profit
  if (netProfit <= 0) return 0;

  // Validate rate
  if (!validateCommissionRate(rate)) {
    throw new Error(`Invalid commission rate: ${rate}%. Must be between 0-100%.`);
  }

  // Calculate commission
  const commission = (netProfit * rate) / 100;

  // Round to 2 decimal places to avoid floating point issues
  return Math.round(commission * 100) / 100;
}

/**
 * Calculates shared loss amount based on negative net profit and loss rate
 */
export function calculateSharedLoss(netProfit: number, lossRate: number): number {
  if (netProfit >= 0) return 0;

  // Calculate absolute loss
  const absoluteLoss = Math.abs(netProfit);

  // Apply technician share
  const lossAmount = (absoluteLoss * lossRate) / 100;

  return Math.round(lossAmount * 100) / 100;
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
  const netProfit = data.repairPrice - data.partsCost;

  return {
    netProfit: `SAR ${netProfit.toFixed(2)}`,
    commissionRate: `${data.commissionRate.toFixed(1)}%`,
    commissionAmount: `SAR ${data.commissionAmount.toFixed(2)}`
  };
}
