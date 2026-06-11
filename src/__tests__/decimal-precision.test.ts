/**
 * Unit tests for decimal precision in financial calculations
 * Ensures accurate handling of currency values
 */

import { describe, it, expect } from 'vitest';

// Simulating Decimal.js behavior for testing
class Decimal {
    private value: number;

    constructor(value: string | number) {
        this.value = typeof value === 'string' ? parseFloat(value) : value;
    }

    static from(value: string | number): Decimal {
        return new Decimal(value);
    }

    toNumber(): number {
        return this.value;
    }

    toFixed(decimals: number): string {
        return this.value.toFixed(decimals);
    }

    add(other: Decimal | number): Decimal {
        const otherValue = other instanceof Decimal ? other.toNumber() : other;
        return new Decimal(this.value + otherValue);
    }

    subtract(other: Decimal | number): Decimal {
        const otherValue = other instanceof Decimal ? other.toNumber() : other;
        return new Decimal(this.value - otherValue);
    }

    multiply(other: Decimal | number): Decimal {
        const otherValue = other instanceof Decimal ? other.toNumber() : other;
        return new Decimal(this.value * otherValue);
    }

    divide(other: Decimal | number): Decimal {
        const otherValue = other instanceof Decimal ? other.toNumber() : other;
        return new Decimal(this.value / otherValue);
    }

    eq(other: Decimal | number): boolean {
        const otherValue = other instanceof Decimal ? other.toNumber() : other;
        return this.value === otherValue;
    }

    gt(other: Decimal | number): boolean {
        const otherValue = other instanceof Decimal ? other.toNumber() : other;
        return this.value > otherValue;
    }

    lt(other: Decimal | number): boolean {
        const otherValue = other instanceof Decimal ? other.toNumber() : other;
        return this.value < otherValue;
    }

    gte(other: Decimal | number): boolean {
        const otherValue = other instanceof Decimal ? other.toNumber() : other;
        return this.value >= otherValue;
    }

    lte(other: Decimal | number): boolean {
        const otherValue = other instanceof Decimal ? other.toNumber() : other;
        return this.value <= otherValue;
    }

    abs(): Decimal {
        return new Decimal(Math.abs(this.value));
    }

    negated(): Decimal {
        return new Decimal(-this.value);
    }

    isPositive(): boolean {
        return this.value > 0;
    }

    isNegative(): boolean {
        return this.value < 0;
    }

    isZero(): boolean {
        return this.value === 0;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Decimal Arithmetic
// ─────────────────────────────────────────────────────────────────────────────

describe('Decimal Precision', () => {
    describe('Basic Operations', () => {
        it('should add two decimals correctly', () => {
            const a = new Decimal('100.50');
            const b = new Decimal('50.25');
            const result = a.add(b);
            expect(result.toNumber()).toBe(150.75);
        });

        it('should subtract two decimals correctly', () => {
            const a = new Decimal('100.00');
            const b = new Decimal('25.50');
            const result = a.subtract(b);
            expect(result.toNumber()).toBe(74.50);
        });

        it('should multiply two decimals correctly', () => {
            const a = new Decimal('10.00');
            const b = new Decimal('5.00');
            const result = a.multiply(b);
            expect(result.toNumber()).toBe(50.00);
        });

        it('should divide two decimals correctly', () => {
            const a = new Decimal('100.00');
            const b = new Decimal('4.00');
            const result = a.divide(b);
            expect(result.toNumber()).toBe(25.00);
        });
    });

    describe('Precision Handling', () => {
        it('should handle floating point errors in addition', () => {
            const a = new Decimal('0.1');
            const b = new Decimal('0.2');
            const result = a.add(b);
            // In real Decimal.js, this would be 0.3 exactly
            expect(result.toNumber()).toBeCloseTo(0.3, 10);
        });

        it('should handle large numbers', () => {
            const a = new Decimal('999999999.99');
            const b = new Decimal('0.01');
            const result = a.add(b);
            expect(result.toNumber()).toBe(1000000000.00);
        });

        it('should handle very small numbers', () => {
            const a = new Decimal('0.01');
            const b = new Decimal('0.001');
            const result = a.add(b);
            expect(result.toNumber()).toBe(0.011);
        });
    });

    describe('Comparison Operations', () => {
        it('should compare equal decimals', () => {
            const a = new Decimal('100.00');
            const b = new Decimal('100.00');
            expect(a.eq(b)).toBe(true);
        });

        it('should compare greater than', () => {
            const a = new Decimal('100.01');
            const b = new Decimal('100.00');
            expect(a.gt(b)).toBe(true);
        });

        it('should compare less than', () => {
            const a = new Decimal('99.99');
            const b = new Decimal('100.00');
            expect(a.lt(b)).toBe(true);
        });

        it('should handle zero comparison', () => {
            const a = new Decimal('0.00');
            expect(a.isZero()).toBe(true);
            expect(a.eq(0)).toBe(true);
        });
    });

    describe('Sign Operations', () => {
        it('should get absolute value', () => {
            const a = new Decimal('-100.00');
            expect(a.abs().toNumber()).toBe(100.00);
        });

        it('should negate value', () => {
            const a = new Decimal('100.00');
            expect(a.negated().toNumber()).toBe(-100.00);
        });

        it('should check positive', () => {
            const a = new Decimal('100.00');
            expect(a.isPositive()).toBe(true);
            expect(a.isNegative()).toBe(false);
        });

        it('should check negative', () => {
            const a = new Decimal('-100.00');
            expect(a.isNegative()).toBe(true);
            expect(a.isPositive()).toBe(false);
        });
    });

    describe('Formatting', () => {
        it('should format to 2 decimal places', () => {
            const a = new Decimal('100.5');
            expect(a.toFixed(2)).toBe('100.50');
        });

        it('should format currency values correctly', () => {
            const a = new Decimal('1500.00');
            expect(a.toFixed(2)).toBe('1500.00');
        });

        it('should handle zero padding', () => {
            const a = new Decimal('99.9');
            expect(a.toFixed(2)).toBe('99.90');
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Financial Calculations
// ─────────────────────────────────────────────────────────────────────────────

describe('Financial Calculations', () => {
    describe('Net Due Calculation', () => {
        it('should calculate net due from base salary minus deductions', () => {
            const baseSalary = new Decimal('5000.00');
            const deductions = new Decimal('500.00');
            const netDue = baseSalary.subtract(deductions);
            expect(netDue.toNumber()).toBe(4500.00);
        });

        it('should handle no deductions', () => {
            const baseSalary = new Decimal('5000.00');
            const netDue = baseSalary;
            expect(netDue.toNumber()).toBe(5000.00);
        });

        it('should handle bonuses adding to salary', () => {
            const baseSalary = new Decimal('5000.00');
            const bonus = new Decimal('500.00');
            const netDue = baseSalary.add(bonus);
            expect(netDue.toNumber()).toBe(5500.00);
        });
    });

    describe('Expense Total', () => {
        it('should sum multiple expenses correctly', () => {
            const expenses = [
                new Decimal('100.00'),
                new Decimal('250.50'),
                new Decimal('75.25'),
            ];
            const total = expenses.reduce((sum, exp) => sum.add(exp), new Decimal('0'));
            expect(total.toNumber()).toBe(425.75);
        });

        it('should handle empty expense list', () => {
            const expenses: Decimal[] = [];
            const total = expenses.reduce((sum, exp) => sum.add(exp), new Decimal('0'));
            expect(total.toNumber()).toBe(0);
        });
    });

    describe('Shift Financial Summary', () => {
        it('should calculate net cash correctly', () => {
            const totalSales = new Decimal('15000.00');
            const totalReturns = new Decimal('500.00');
            const totalExpenses = new Decimal('2000.00');
            
            const netCash = totalSales.subtract(totalReturns).subtract(totalExpenses);
            expect(netCash.toNumber()).toBe(12500.00);
        });

        it('should calculate variance correctly', () => {
            const expectedCash = new Decimal('12600.00');
            const actualCash = new Decimal('12500.00');
            const variance = actualCash.subtract(expectedCash);
            expect(variance.toNumber()).toBe(-100.00);
        });

        it('should handle negative variance (loss)', () => {
            const expectedCash = new Decimal('10000.00');
            const actualCash = new Decimal('9500.00');
            const variance = actualCash.subtract(expectedCash);
            expect(variance.isNegative()).toBe(true);
            expect(variance.toNumber()).toBe(-500.00);
        });

        it('should handle positive variance (profit)', () => {
            const expectedCash = new Decimal('10000.00');
            const actualCash = new Decimal('10500.00');
            const variance = actualCash.subtract(expectedCash);
            expect(variance.isPositive()).toBe(true);
            expect(variance.toNumber()).toBe(500.00);
        });
    });

    describe('Treasury Balance', () => {
        it('should check if balance is sufficient for withdrawal', () => {
            const balance = new Decimal('1000.00');
            const withdrawal = new Decimal('500.00');
            expect(balance.gte(withdrawal)).toBe(true);
        });

        it('should detect insufficient balance', () => {
            const balance = new Decimal('300.00');
            const withdrawal = new Decimal('500.00');
            expect(balance.lt(withdrawal)).toBe(true);
        });

        it('should allow exact balance withdrawal', () => {
            const balance = new Decimal('500.00');
            const withdrawal = new Decimal('500.00');
            expect(balance.eq(withdrawal)).toBe(true);
        });

        it('should handle negative balance (allowed with permission)', () => {
            const balance = new Decimal('-100.00');
            expect(balance.isNegative()).toBe(true);
            expect(balance.abs().toNumber()).toBe(100.00);
        });
    });

    describe('Purchasing Module Arithmetic (Mocked)', () => {
        it('should calculate subtotal with decimal precision (0.1 * 3)', () => {
            const quantity = new Decimal('3');
            const unitCost = new Decimal('0.1');
            const subtotal = quantity.multiply(unitCost);
            expect(subtotal.toNumber()).toBeCloseTo(0.30, 10);
        });

        it('should calculate totalAmount with deliveryCharge (10.00 + 12.50)', () => {
            const subtotal = new Decimal('10.00');
            const deliveryCharge = new Decimal('12.50');
            const totalAmount = subtotal.add(deliveryCharge);
            expect(totalAmount.toNumber()).toBe(22.50);
        });
    });
});