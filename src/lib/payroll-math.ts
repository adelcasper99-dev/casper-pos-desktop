import Decimal from "decimal.js";
import { PayrollRule, Employee, PayrollCalculationDetail } from "@/types/hr";

/**
 * ⭐ FINANCIAL PRECISION: Uses Decimal.js for all calculations
 * Prevents floating-point errors in payroll processing
 * Complies with financial regulation requirements for exact calculations
 */

export function calculatePayroll(
    employee: Employee,
    baseSalary: number,
    workingDays: number,
    workingHours: number,
    rules: PayrollRule[],
    commissionEarned: number = 0,
    clawbacks: number = 0,
    losses: number = 0
) {
    // 0. Convert to Decimal immediately for precision
    const baseSalaryDec = new Decimal(baseSalary);
    const workingDaysDec = new Decimal(workingDays);
    const workingHoursDec = new Decimal(workingHours);

    // Calculate base rates with Decimal precision
    const dailySalary = baseSalaryDec.dividedBy(workingDaysDec);
    const hourlySalary = dailySalary.dividedBy(workingHoursDec);

    let totalDeductions = new Decimal(0);
    let totalAdditions = new Decimal(0);
    const calculations: PayrollCalculationDetail[] = [];

    // 1. CORE DEDUCTIONS (Absent + Extra Off Days)
    if (employee.absentDays > 0) {
        const amount = dailySalary.times(employee.absentDays);
        totalDeductions = totalDeductions.plus(amount);
        calculations.push({
            name: "Absent Days",
            type: "DEDUCTION",
            amount: amount.toDecimalPlaces(2).toNumber(),
            rate: `Daily Rate`,
            multiplier: employee.absentDays,
            unit: "DAILY_FRACTION"
        });
    }

    if (employee.extraOffDays > 0) {
        const amount = dailySalary.times(employee.extraOffDays);
        totalDeductions = totalDeductions.plus(amount);
        calculations.push({
            name: "Excess Off Days",
            type: "DEDUCTION",
            amount: amount.toDecimalPlaces(2).toNumber(),
            rate: `Daily Rate`,
            multiplier: employee.extraOffDays,
            unit: "DAILY_FRACTION"
        });
    }

    // 2. MANUAL ADJUSTMENTS (From Daily Logs)
    if (employee.manualDeduction > 0) {
        const manualDeductionDec = new Decimal(employee.manualDeduction);
        totalDeductions = totalDeductions.plus(manualDeductionDec);
        calculations.push({
            name: "Manual Deductions",
            type: "DEDUCTION",
            amount: manualDeductionDec.toDecimalPlaces(2).toNumber(),
            rate: "Total Input",
            unit: "FIXED"
        });
    }

    if (employee.manualBonus > 0) {
        const manualBonusDec = new Decimal(employee.manualBonus);
        totalAdditions = totalAdditions.plus(manualBonusDec);
        calculations.push({
            name: "Manual Bonuses",
            type: "ADDITION",
            amount: manualBonusDec.toDecimalPlaces(2).toNumber(),
            rate: "Total Input",
            unit: "FIXED"
        });
    }

    // ⭐ Add commissions to additions
    if (commissionEarned > 0) {
        const commissionDec = new Decimal(commissionEarned);
        totalAdditions = totalAdditions.plus(commissionDec);
        const ticketCount = (employee as any).completedTicketsCount || 0;
        calculations.push({
            name: `Repair Commissions (${ticketCount} tickets completed)`,
            type: "ADDITION",
            amount: commissionDec.toDecimalPlaces(2).toNumber(),
            rate: "Commission Earnings",
            unit: "FIXED"
        });
    }

    // ⭐ NEW: Add clawbacks and shared losses to deductions
    if (clawbacks > 0) {
        const clawbackDec = new Decimal(clawbacks);
        totalDeductions = totalDeductions.plus(clawbackDec);
        calculations.push({
            name: "Commission Clawbacks (Returns)",
            type: "DEDUCTION",
            amount: clawbackDec.toDecimalPlaces(2).toNumber(),
            rate: "Commission Reversal",
            unit: "FIXED"
        });
    }

    if (losses > 0) {
        const lossDec = new Decimal(losses);
        totalDeductions = totalDeductions.plus(lossDec);
        calculations.push({
            name: "Shared Losses (Re-Repairs)",
            type: "DEDUCTION",
            amount: lossDec.toDecimalPlaces(2).toNumber(),
            rate: "Loss Sharing",
            unit: "FIXED"
        });
    }

    // 3. RULES ENGINE (Legacy & Advanced Rules)
    const activeRules = rules.filter((r) => r.isActive);

    activeRules.forEach((rule) => {
        let amount = new Decimal(0);
        let multiplier = 0;
        let rate = "";

        if (rule.type === "DEDUCTION") {
            if (rule.unit === "DAILY_FRACTION") {
                if (rule.condition.includes("LATE_MIN") && employee.lateMinutes > 0) {
                    if (rule.condition === "LATE_MIN_15" && employee.lateMinutes >= 15) {
                        amount = dailySalary.times(rule.amount);
                        rate = `${rule.amount} × Daily Salary (Late > 15m)`;
                    }
                }

                if (rule.condition === "LATE" && (employee as any).lateDays > 0) {
                    const count = (employee as any).lateDays;
                    amount = dailySalary.times(rule.amount).times(count);
                    rate = `${rule.amount} × Daily Rate`;
                    multiplier = count;
                }
            }
        } else if (rule.type === "ADDITION") {
            if (rule.unit === "HOURLY_MULTIPLIER") {
                if (rule.condition === "OVERTIME" && employee.overtimeHours > 0) {
                    multiplier = employee.overtimeHours;
                    amount = hourlySalary.times(rule.amount).times(multiplier);
                    rate = `${rule.amount} × Hourly Salary`;
                }
            }
        }

        if (amount.greaterThan(0)) {
            calculations.push({
                name: rule.name,
                type: rule.type,
                amount: amount.toDecimalPlaces(2).toNumber(),
                rate: rate,
                multiplier: multiplier > 1 ? multiplier : undefined,
                unit: rule.unit
            });

            if (rule.type === "DEDUCTION") {
                totalDeductions = totalDeductions.plus(amount);
            } else {
                totalAdditions = totalAdditions.plus(amount);
            }
        }
    });

    // Final calculation with Decimal precision
    // USER: "it can go negative with a warning" -> Removed Decimal.max(0, ...)
    const finalSalary = baseSalaryDec.plus(totalAdditions).minus(totalDeductions);

    return {
        baseSalary: baseSalaryDec.toDecimalPlaces(2).toNumber(),
        finalSalary: finalSalary.toDecimalPlaces(2).toNumber(),
        totalAdditions: totalAdditions.toDecimalPlaces(2).toNumber(),
        totalDeductions: totalDeductions.toDecimalPlaces(2).toNumber(),
        dailySalary: dailySalary.toDecimalPlaces(2).toNumber(),
        hourlySalary: hourlySalary.toDecimalPlaces(2).toNumber(),
        details: calculations,
        commission: commissionEarned
    };
}
