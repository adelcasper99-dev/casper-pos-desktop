import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
    calculateProfitMargin,
    calculateAOV,
    isProductLowStock,
    reconcilePaymentBreakdown,
    getTimezoneDateBounds
} from "../features/dashboard/utils/dashboard-calculations";

describe("Dashboard Calculations & Financial Guardrails", () => {
    describe("calculateProfitMargin", () => {
        it("calculates positive profit margin percentage correctly", () => {
            const margin = calculateProfitMargin(new Decimal(250), new Decimal(1000));
            expect(margin).toBe(25);
        });

        it("handles fractional percentages with two decimal precision", () => {
            const margin = calculateProfitMargin(new Decimal(100), new Decimal(300));
            expect(margin).toBe(33.33);
        });

        it("calculates negative profit margin (net loss)", () => {
            const margin = calculateProfitMargin(new Decimal(-200), new Decimal(1000));
            expect(margin).toBe(-20);
        });

        it("safely returns 0 when totalRevenue is 0 without NaN or throwing", () => {
            expect(calculateProfitMargin(0, 0)).toBe(0);
            expect(calculateProfitMargin(new Decimal(-100), new Decimal(0))).toBe(0);
            expect(calculateProfitMargin(new Decimal(50), new Decimal(0))).toBe(0);
        });
    });

    describe("calculateAOV (Average Order Value)", () => {
        it("calculates normal AOV accurately", () => {
            const aov = calculateAOV(new Decimal(5000), 10);
            expect(aov).toBe(500);
        });

        it("handles division by zero when saleCount is 0", () => {
            expect(calculateAOV(new Decimal(5000), 0)).toBe(0);
            expect(calculateAOV(0, 0)).toBe(0);
        });

        it("rounds to two decimal places cleanly", () => {
            const aov = calculateAOV(new Decimal(1000), 3);
            expect(aov).toBe(333.33);
        });
    });

    describe("isProductLowStock", () => {
        it("returns true when stock is strictly less than minStock", () => {
            expect(isProductLowStock(3, 10)).toBe(true);
        });

        it("returns true when stock equals minStock", () => {
            expect(isProductLowStock(5, 5)).toBe(true);
        });

        it("returns false when stock is above minStock", () => {
            expect(isProductLowStock(12, 5)).toBe(false);
        });

        it("falls back to default minStock (5) when minStock is null or undefined", () => {
            expect(isProductLowStock(4, null)).toBe(true);
            expect(isProductLowStock(5, undefined)).toBe(true);
            expect(isProductLowStock(6, null)).toBe(false);
        });

        it("handles 0 stock or negative stock gracefully", () => {
            expect(isProductLowStock(0, null)).toBe(true);
            expect(isProductLowStock(-2, 10)).toBe(true);
        });
    });

    describe("reconcilePaymentBreakdown", () => {
        it("returns reconciled true when parts match expected total", () => {
            const res = reconcilePaymentBreakdown([100, 250.5, 149.5], 500);
            expect(res.reconciled).toBe(true);
            expect(res.difference).toBe(0);
            expect(res.totalCalculated).toBe(500);
        });

        it("returns reconciled false and exact diff when mismatch occurs", () => {
            const res = reconcilePaymentBreakdown([100, 200], 500);
            expect(res.reconciled).toBe(false);
            expect(res.difference).toBe(200);
            expect(res.totalCalculated).toBe(300);
        });
    });

    describe("getTimezoneDateBounds", () => {
        it("computes start and end of day boundaries with UTC+2 Cairo offset", () => {
            const bounds = getTimezoneDateBounds("2026-09-01", "2026-09-01", 2);
            expect(bounds.startDate).toBeDefined();
            // Start of day Cairo (00:00:00 UTC+2) is 22:00:00 UTC of previous day
            expect(bounds.startDate?.toISOString()).toBe("2026-08-31T22:00:00.000Z");
            // End of day Cairo (23:59:59.999 UTC+2) is 21:59:59.999 UTC of current day
            expect(bounds.endDate.toISOString()).toBe("2026-09-01T21:59:59.999Z");
        });

        it("handles undefined start date by returning undefined start with valid end", () => {
            const bounds = getTimezoneDateBounds(undefined, "2026-09-04", 2);
            expect(bounds.startDate).toBeUndefined();
            expect(bounds.endDate.toISOString()).toBe("2026-09-04T21:59:59.999Z");
        });
    });
});
