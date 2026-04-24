import { Decimal } from 'decimal.js';

/**
 * Shared utility for HR and Finance to calculate net employee pay.
 * Ensures strict compliance with "hire date" requirements.
 */
/**
 * 1. Prorate Base Salary based on hire date AND current date
 */
export function calculateProratedBase(
    salary: number | string | Decimal,
    hireDateInput: Date | string | null | undefined,
    startDate: Date,
    endDate: Date,
    mode: 'accrued' | 'projected' = 'accrued'
): Decimal {
    let baseSalary = new Decimal(salary.toString() || '0');
    const hireDate = hireDateInput ? new Date(hireDateInput) : null;
    const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
    const now = new Date();

    if (hireDate) {
        if (hireDate > endDate) {
            return new Decimal(0);
        } else if (hireDate > startDate) {
            const hireDay = hireDate.getDate();
            const currentCappedDay = (mode === 'accrued' && now > startDate && now < endDate) ? now.getDate() : lastDay;
            const daysEarned = Math.max(0, currentCappedDay - hireDay + 1);
            return baseSalary.times(daysEarned).dividedBy(lastDay);
        } else {
            if (mode === 'accrued' && now > startDate && now < endDate) {
                return baseSalary.times(now.getDate()).dividedBy(lastDay);
            }
        }
    } else if (mode === 'accrued' && now > startDate && now < endDate) {
        return baseSalary.times(now.getDate()).dividedBy(lastDay);
    }
    return baseSalary;
}

/**
 * Shared Categorization Logic for Ledger Transactions
 */
export function getCategoryClassification(type: string) {
    return {
        isAddition: type === 'BONUS' || type === 'ADDITION' || type === 'MAINTENANCE_COMMISSION',
        isDeduction: type === 'DEDUCTION' || type === 'PENALTY' || type.endsWith('_DEDUCTION') || type === 'SALARY_PAYMENT' || type === 'CLAWBACK',
        isReversal: type.endsWith('_REVERSAL')
    };
}

export async function calculateNetDue(
    u: { 
        salary?: any, 
        hireDate?: Date | string | null, 
        dailyLogs?: any[], 
        employeeTransactions?: any[],
        technician?: {
            id: string,
            commissionRate: any,
            lossRate?: any,
            tickets?: any[]
        }
    }, 
    startDate: Date, 
    endDate: Date
) {
    const baseSalary = calculateProratedBase(u.salary || 0, u.hireDate, startDate, endDate);
    const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
    const hireDate = u.hireDate ? new Date(u.hireDate) : null;
    const dailyRate = new Decimal(u.salary?.toString() || '0').dividedBy(lastDay);

    let totalBonuses = new Decimal(0);
    let totalDeductions = new Decimal(0);
    
    // KPI Counters
    let completedTickets = 0;
    let returnCount = 0;
    let delayedTickets = 0;
    let maintenanceCommissions = new Decimal(0);

    // 2. Attendance
    u.dailyLogs?.forEach((log: any) => {
        const logDate = new Date(log.date);
        if (hireDate && logDate < hireDate) return;

        totalBonuses = totalBonuses.plus(log.bonus?.toString() || '0');
        const logDeduction = new Decimal(log.deduction?.toString() || '0');
        
        if (log.status === 'ABSENT' && logDeduction.isZero()) {
            totalDeductions = totalDeductions.plus(dailyRate);
        } else {
            totalDeductions = totalDeductions.plus(logDeduction);
        }
    });

    // 3. Transactions (Ledger)
    const hireDateStr = hireDate ? hireDate.toLocaleDateString('en-CA') : null;
    const transactions = u.employeeTransactions || [];

    transactions.forEach((tx: any) => {
        const txDateStr = new Date(tx.createdAt).toLocaleDateString('en-CA');
        if (hireDateStr && txDateStr < hireDateStr) return;

        const type = tx.type;
        const amount = new Decimal(tx.amount?.toString() || '0');
        
        // 🏗️ Categorization Logic
        const { isAddition, isDeduction, isReversal } = getCategoryClassification(type);

        if (isAddition) {
            totalBonuses = totalBonuses.plus(amount);
        } else if (isDeduction) {
            totalDeductions = totalDeductions.plus(amount.abs());
        } else if (isReversal) {
            // Reversal of an addition (like commission) => Deduction
            if (type === 'MAINTENANCE_COMMISSION_REVERSAL' || type === 'BONUS_REVERSAL') {
                totalDeductions = totalDeductions.plus(amount.abs());
            } else {
                // Reversal of a deduction => Addition
                totalBonuses = totalBonuses.plus(amount.abs());
            }
        }
    });

    // 4. Technician Specific (Commissions & KPIs)
    if (u.technician) {
        const tickets = u.technician.tickets || [];
        tickets.forEach((t: any) => {
            if (hireDate && new Date(t.createdAt) < hireDate) return;

            if (t.status === 'PAID_DELIVERED') {
                completedTickets++;
                
                // Calculate commission if not already in ledger
                let comm = new Decimal(t.commissionAmount || 0);
                if (comm.isZero() && u.technician?.commissionRate) {
                    const techBilling = new Decimal(t.techBillingPrice || t.partsCost || 0);
                    const repairPrice = new Decimal(t.repairPrice || 0);
                    const netProfit = repairPrice.minus(techBilling);
                    if (netProfit.gt(0)) {
                        comm = netProfit.times(u.technician.commissionRate).dividedBy(100).toDecimalPlaces(2);
                    }
                }
                maintenanceCommissions = maintenanceCommissions.plus(comm);
            }

            if (t.isWarrantyReturn || (t.returnCount && t.returnCount > 0)) {
                returnCount++;
            }

            // Gaps/Risks (Latency)
            if (t.startedAt && t.expectedDuration) {
                const endTime = t.completedAt ? new Date(t.completedAt) : new Date();
                const durationInMinutes = (endTime.getTime() - new Date(t.startedAt).getTime()) / (1000 * 60);
                if (durationInMinutes > t.expectedDuration * 60) {
                    delayedTickets++;
                }
            }
        });

        // ✅ Per-ticket commission deduplication — check by referenceId to avoid
        // the bug where posting ANY commission blocks ALL virtual commissions
        tickets.forEach((t: any) => {
            if (t.status !== 'PAID_DELIVERED') return;
            if (hireDate && new Date(t.createdAt) < hireDate) return;

            const isCommPosted = transactions.some(
                tx => tx.type === 'MAINTENANCE_COMMISSION' && tx.referenceId === t.id
            );
            if (!isCommPosted) {
                let comm = new Decimal(t.commissionAmount?.toString() || 0);
                if (comm.isZero() && u.technician?.commissionRate) {
                    const techBilling = new Decimal(t.techBillingPrice?.toString() || t.partsCost?.toString() || 0);
                    const repairPrice = new Decimal(t.repairPrice?.toString() || 0);
                    const netProfit = repairPrice.minus(techBilling);
                    if (netProfit.gt(0)) {
                        comm = netProfit.times(new Decimal(u.technician.commissionRate.toString())).dividedBy(100).toDecimalPlaces(2);
                    }
                }
                if (comm.gt(0)) {
                    totalBonuses = totalBonuses.plus(comm);
                }
            }
        });

        // Deduct clawbacks if any (Warranty reworking losses)
        // This handles cases where a ticket was marked as clawback but no transaction was created yet
        tickets.forEach(t => {
            const clawback = new Decimal(t.commissionClawback?.toString() || 0);
            const excessLoss = new Decimal(t.excessLossAmount?.toString() || 0);

            const hasClawbackInLedger = transactions.some(tx => 
                (tx.type === 'MAINTENANCE_COMMISSION_REVERSAL' && tx.referenceId === t.id) ||
                (tx.type === 'MAINTENANCE_COMMISSION' && tx.referenceId === t.id && Number(tx.amount) < 0)
            );
            
            if (!hasClawbackInLedger && (clawback.gt(0) || excessLoss.gt(0))) {
                let deductionAmount = clawback; // Always reverse the unearned commission entirely
                
                if (t.lossResponsibility === 'TECH') {
                    deductionAmount = deductionAmount.plus(excessLoss);
                } else if (t.lossResponsibility === 'SPLIT') {
                    const techLossRate = new Decimal(u.technician?.lossRate?.toString() || 70).dividedBy(100);
                    deductionAmount = deductionAmount.plus(excessLoss.times(techLossRate));
                }

                if (deductionAmount.gt(0)) {
                    totalDeductions = totalDeductions.plus(deductionAmount);
                }
            }
        });
    }

    const successRatio = completedTickets > 0 
        ? Math.max(0, ((completedTickets - returnCount) / completedTickets) * 100) 
        : 0; // Default to 0 instead of 100 for new hires with no work

    return {
        baseSalary: baseSalary.toDecimalPlaces(2),
        totalBonuses: totalBonuses.toDecimalPlaces(2),
        totalDeductions: totalDeductions.toDecimalPlaces(2),
        netDue: baseSalary.plus(totalBonuses).minus(totalDeductions).toDecimalPlaces(2),
        kpis: {
            completedTickets,
            returnCount,
            delayedTickets,
            successRatio: Math.round(successRatio * 100) / 100,
            maintenanceCommissions: maintenanceCommissions.toNumber()
        }
    };
}
