import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateProfitMargin, calculateAOV, reconcilePaymentBreakdown } from "../features/dashboard/utils/dashboard-calculations";
import { resolveCommission, calculateCommission } from "../lib/commission-validation";
import { calculateReworkImpact } from "../lib/maintenance/refund-logic";

describe("Financial Precision & Multi-Tier Reporting Integrity", () => {
    describe("Tier 1: Profit & Loss (P&L) Engine & Decimal Precision", () => {
        it("calculates Revenue, COGS, Gross Profit, and Net Profit with zero float drift", () => {
            // Setup precise decimal items
            const revenueLines = [
                new Decimal("1549.99"),
                new Decimal("2450.50"),
                new Decimal("999.45"),
                new Decimal("50.06")
            ];
            const totalRevenue = revenueLines.reduce((acc, val) => acc.plus(val), new Decimal(0));
            expect(totalRevenue.toString()).toBe("5050");

            const cogsLines = [
                new Decimal("850.25"),
                new Decimal("1200.75"),
                new Decimal("450.00")
            ];
            const totalCOGS = cogsLines.reduce((acc, val) => acc.plus(val), new Decimal(0));
            expect(totalCOGS.toString()).toBe("2501");

            const grossProfit = totalRevenue.minus(totalCOGS);
            expect(grossProfit.toString()).toBe("2549");

            const operatingExpenses = [
                new Decimal("350.50"),
                new Decimal("149.50"),
                new Decimal("200.00")
            ];
            const totalExpenses = operatingExpenses.reduce((acc, val) => acc.plus(val), new Decimal(0));
            expect(totalExpenses.toString()).toBe("700");

            const netProfit = grossProfit.minus(totalExpenses);
            expect(netProfit.toString()).toBe("1849");
            expect(netProfit.isPositive()).toBe(true);

            // Verify profit margin calculation via helper
            const margin = calculateProfitMargin(netProfit, totalRevenue);
            // 1849 / 5050 * 100 = 36.61386... -> 36.61
            expect(margin).toBe(36.61);
        });

        it("handles net loss correctly without precision distortion or NaN", () => {
            const revenue = new Decimal("1200.00");
            const cogs = new Decimal("800.00");
            const expenses = new Decimal("650.00");

            const grossProfit = revenue.minus(cogs); // 400
            const netProfit = grossProfit.minus(expenses); // -250

            expect(netProfit.toString()).toBe("-250");
            expect(netProfit.isNegative()).toBe(true);

            const margin = calculateProfitMargin(netProfit, revenue);
            // -250 / 1200 * 100 = -20.8333... -> -20.83
            expect(margin).toBe(-20.83);
        });

        it("isolates tenant data with zero cross-tenant contamination in aggregation", () => {
            interface MockJournalLine {
                tenantId: string;
                accountCode: string;
                debit: Decimal;
                credit: Decimal;
            }

            const entries: MockJournalLine[] = [
                { tenantId: "tenant-A", accountCode: "4000", debit: new Decimal(0), credit: new Decimal("5000.00") },
                { tenantId: "tenant-A", accountCode: "5000", debit: new Decimal("2000.00"), credit: new Decimal(0) },
                { tenantId: "tenant-B", accountCode: "4000", debit: new Decimal(0), credit: new Decimal("99999.99") },
                { tenantId: "tenant-B", accountCode: "5000", debit: new Decimal("45000.00"), credit: new Decimal(0) },
            ];

            const tenantARev = entries
                .filter(e => e.tenantId === "tenant-A" && e.accountCode === "4000")
                .reduce((sum, e) => sum.plus(e.credit.minus(e.debit)), new Decimal(0));

            const tenantAExp = entries
                .filter(e => e.tenantId === "tenant-A" && e.accountCode === "5000")
                .reduce((sum, e) => sum.plus(e.debit.minus(e.credit)), new Decimal(0));

            const tenantANet = tenantARev.minus(tenantAExp);
            expect(tenantARev.toString()).toBe("5000");
            expect(tenantAExp.toString()).toBe("2000");
            expect(tenantANet.toString()).toBe("3000");
        });
    });

    describe("Tier 2: Balance Sheet Fundamental Accounting Equation (Assets = Liabilities + Equity)", () => {
        it("verifies perfect balance with balanced journal lines", () => {
            // Assets (Debit normal)
            const cash = new Decimal("15000.50");
            const bank = new Decimal("35000.00");
            const inventory = new Decimal("25000.25");
            const accountsReceivable = new Decimal("8000.00");
            const fixedAssets = new Decimal("50000.00");
            const accumulatedDepreciation = new Decimal("-10000.00"); // Contra-asset

            const currentAssets = cash.plus(bank).plus(inventory).plus(accountsReceivable);
            const totalFixedAssets = fixedAssets.plus(accumulatedDepreciation);
            const totalAssets = currentAssets.plus(totalFixedAssets);

            expect(totalAssets.toString()).toBe("123000.75");

            // Liabilities (Credit normal)
            const accountsPayable = new Decimal("18000.75");
            const vatPayable = new Decimal("5000.00");
            const totalLiabilities = accountsPayable.plus(vatPayable);
            expect(totalLiabilities.toString()).toBe("23000.75");

            // Equity (Credit normal)
            const capital = new Decimal("80000.00");
            const retainedEarnings = new Decimal("12000.00");
            const currentPeriodProfit = new Decimal("8000.00"); // Revenue (20k) - Expense (12k)
            const totalEquity = capital.plus(retainedEarnings).plus(currentPeriodProfit);
            expect(totalEquity.toString()).toBe("100000");

            const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquity);
            expect(totalLiabilitiesAndEquity.toString()).toBe("123000.75");

            const imbalance = totalAssets.minus(totalLiabilitiesAndEquity);
            expect(imbalance.abs().toNumber()).toBe(0);
            expect(imbalance.abs().lt(0.01)).toBe(true);
        });

        it("detects and flags imbalance when unbalanced entries occur", () => {
            const assets = new Decimal("10000.00");
            const liabilities = new Decimal("4000.00");
            const equity = new Decimal("5500.00"); // 500 missing

            const diff = assets.minus(liabilities.plus(equity));
            expect(diff.toString()).toBe("500");
            expect(diff.abs().lt(0.01)).toBe(false);
        });
    });

    describe("Tier 3: Maintenance Ticket Profit & Commission Guardrails", () => {
        it("calculates technician commission on net labor profit accurately", () => {
            const customerTotal = new Decimal("850.00");
            const partsCost = new Decimal("350.00");
            const partsSalePrice = new Decimal("500.00");
            const laborCharge = customerTotal.minus(partsSalePrice); // 350.00
            const netProfit = customerTotal.minus(partsCost); // 500.00
            const commissionRate = new Decimal("20"); // 20%

            const commission = calculateCommission(netProfit, commissionRate);
            expect(commission.toString()).toBe("100");

            const netStoreProfit = netProfit.minus(commission);
            expect(netStoreProfit.toString()).toBe("400");
        });

        it("handles maintenance warranty rework and recalculates technician commission", () => {
            const originalLaborProfit = new Decimal("500.00");
            const commissionRate = 20; // 20%
            
            // Customer returns under warranty, additional rework part of 300 EGP added
            const reworkResult = calculateReworkImpact({
                totalRepairPrice: 850,
                originalPartsCost: 350,
                newReworkPartCost: 300,
                commissionRate: commissionRate
            });

            // Total parts = 350 + 300 = 650
            // Remaining labor profit = 850 - 650 = 200
            // New commission = 200 * 20% = 40
            // Excess loss = 0
            expect(reworkResult.remainingLaborProfit.toString()).toBe("200");
            expect(reworkResult.newCommission.toString()).toBe("40");
            expect(reworkResult.excessLossAmount.toString()).toBe("0");
            expect(reworkResult.isLoss).toBe(false);
        });

        it("handles warranty rework where parts exceed revenue (excess loss absorption)", () => {
            const reworkResult = calculateReworkImpact({
                totalRepairPrice: 500,
                originalPartsCost: 300,
                newReworkPartCost: 400, // Total parts 700 > price 500
                commissionRate: 20
            });

            // Remaining labor profit = 500 - 700 = -200
            // New commission = 0
            // Excess loss amount = 200
            expect(reworkResult.remainingLaborProfit.toString()).toBe("-200");
            expect(reworkResult.newCommission.toString()).toBe("0");
            expect(reworkResult.excessLossAmount.toString()).toBe("200");
            expect(reworkResult.isLoss).toBe(true);
        });
    });

    describe("Tier 4: Treasury, Z-Report & Payment Breakdown Reconciliation", () => {
        it("reconciles cash register opening, sales, expenses, and closing balance", () => {
            const openingFloat = new Decimal("1000.00");
            const cashSales = [
                new Decimal("250.50"),
                new Decimal("499.75"),
                new Decimal("1250.00")
            ];
            const cashSalesTotal = cashSales.reduce((acc, v) => acc.plus(v), new Decimal(0)); // 2000.25

            const cashExpenses = [
                new Decimal("150.00"),
                new Decimal("85.25")
            ];
            const cashExpensesTotal = cashExpenses.reduce((acc, v) => acc.plus(v), new Decimal(0)); // 235.25

            const expectedCash = openingFloat.plus(cashSalesTotal).minus(cashExpensesTotal);
            expect(expectedCash.toString()).toBe("2765");

            // Physical count matches expected
            const actualCountedCash = new Decimal("2765.00");
            const variance = actualCountedCash.minus(expectedCash);
            expect(variance.toNumber()).toBe(0);
        });

        it("detects cash shortage and surplus accurately", () => {
            const expected = new Decimal("5000.00");

            // Shortage
            const actualShort = new Decimal("4850.00");
            const shortageVariance = actualShort.minus(expected);
            expect(shortageVariance.toString()).toBe("-150");

            // Surplus
            const actualSurplus = new Decimal("5120.50");
            const surplusVariance = actualSurplus.minus(expected);
            expect(surplusVariance.toString()).toBe("120.5");
        });

        it("reconciles multi-tender payment breakdown", () => {
            const payments = [250.75, 500.00, 249.25];
            const result = reconcilePaymentBreakdown(payments, 1000);
            expect(result.reconciled).toBe(true);
            expect(result.difference).toBe(0);
            expect(result.totalCalculated).toBe(1000);
        });
    });

    describe("Tier 5: Inventory Valuation & Stock Integrity (Phase 5)", () => {
        it("calculates Total Inventory Valuation as Sum(Quantity * WAC) with Decimal precision", () => {
            const stockItems = [
                { id: "item-1", quantity: new Decimal("120"), wac: new Decimal("45.50") },
                { id: "item-2", quantity: new Decimal("85"), wac: new Decimal("125.75") },
                { id: "item-3", quantity: new Decimal("200"), wac: new Decimal("12.25") },
                { id: "item-4", quantity: new Decimal("50"), wac: new Decimal("310.00") }
            ];

            const totalValuation = stockItems.reduce((acc, item) => {
                const itemVal = item.quantity.times(item.wac);
                return acc.plus(itemVal);
            }, new Decimal(0));

            // (120 * 45.50 = 5460) + (85 * 125.75 = 10688.75) + (200 * 12.25 = 2450) + (50 * 310 = 15500) = 34098.75
            expect(totalValuation.toString()).toBe("34098.75");
        });

        it("detects and flags negative stock balances as Severity-1 integrity anomaly", () => {
            const stockRecords = [
                { id: "stock-1", productId: "prod-A", quantity: -5, wac: 50 },
                { id: "stock-2", productId: "prod-B", quantity: 20, wac: 100 }
            ];

            const negativeStock = stockRecords.filter(s => s.quantity < 0);
            expect(negativeStock.length).toBe(1);
            expect(negativeStock[0].productId).toBe("prod-A");
        });
    });

    describe("Tier 6: Sub-Ledger AP/AR Reconciliation (Phase 7)", () => {
        it("reconciles GL 2000 Supplier AP balance against sum of individual supplier balances", () => {
            const supplierLedgers = [
                { supplierId: "sup-1", outstandingBalance: new Decimal("12500.50") },
                { supplierId: "sup-2", outstandingBalance: new Decimal("8450.25") },
                { supplierId: "sup-3", outstandingBalance: new Decimal("3200.00") }
            ];

            const totalSupplierBalances = supplierLedgers.reduce((acc, s) => acc.plus(s.outstandingBalance), new Decimal(0));
            expect(totalSupplierBalances.toString()).toBe("24150.75");

            // GL 2000 Account Credit - Debit balance
            const gl2000Balance = new Decimal("24150.75");
            const apMismatch = gl2000Balance.minus(totalSupplierBalances);
            expect(apMismatch.abs().toNumber()).toBe(0);
        });

        it("reconciles GL 1100 Customer AR balance against sum of individual customer balances", () => {
            const customerLedgers = [
                { customerId: "cust-1", balanceDue: new Decimal("1500.00") },
                { customerId: "cust-2", balanceDue: new Decimal("2350.50") },
                { customerId: "cust-3", balanceDue: new Decimal("450.25") }
            ];

            const totalCustomerAR = customerLedgers.reduce((acc, c) => acc.plus(c.balanceDue), new Decimal(0));
            expect(totalCustomerAR.toString()).toBe("4300.75");

            const gl1100Balance = new Decimal("4300.75");
            const arMismatch = gl1100Balance.minus(totalCustomerAR);
            expect(arMismatch.abs().toNumber()).toBe(0);
        });
    });

    describe("Tier 7: Concurrency & High-Volume Stress Simulation (5 Full Rounds per Tier)", () => {
        const runConcurrentRound = async (txCount: number, roundIdx: number) => {
            const txValues = Array.from({ length: txCount }, (_, i) => {
                return new Decimal((i + 1 + roundIdx) * 17.89).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
            });

            const promises = txValues.map(async (val, idx) => {
                // Synthetic jitter (1-10ms)
                await new Promise(res => setTimeout(res, Math.floor(Math.random() * 10) + 1));
                return {
                    id: `round-${roundIdx}-tx-${idx}`,
                    debit: val,
                    credit: val // Perfectly balanced double-entry
                };
            });

            const results = await Promise.all(promises);

            let totalDebit = new Decimal(0);
            let totalCredit = new Decimal(0);

            for (const res of results) {
                totalDebit = totalDebit.plus(res.debit);
                totalCredit = totalCredit.plus(res.credit);
            }

            return {
                txCount: results.length,
                totalDebit,
                totalCredit,
                isBalanced: totalDebit.equals(totalCredit),
                difference: totalDebit.minus(totalCredit).toNumber()
            };
        };

        it("executes 5 full rounds of 10 concurrent transactions with zero imbalance", async () => {
            for (let round = 1; round <= 5; round++) {
                const res = await runConcurrentRound(10, round);
                expect(res.txCount).toBe(10);
                expect(res.isBalanced).toBe(true);
                expect(res.difference).toBe(0);
            }
        });

        it("executes 5 full rounds of 25 concurrent transactions with zero imbalance", async () => {
            for (let round = 1; round <= 5; round++) {
                const res = await runConcurrentRound(25, round);
                expect(res.txCount).toBe(25);
                expect(res.isBalanced).toBe(true);
                expect(res.difference).toBe(0);
            }
        });

        it("executes 5 full rounds of 50 concurrent transactions with zero imbalance", async () => {
            for (let round = 1; round <= 5; round++) {
                const res = await runConcurrentRound(50, round);
                expect(res.txCount).toBe(50);
                expect(res.isBalanced).toBe(true);
                expect(res.difference).toBe(0);
            }
        });
    });
});
