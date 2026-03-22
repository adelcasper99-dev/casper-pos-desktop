import { Decimal } from 'decimal.js';

/**
 * Shared utility for HR and Finance to calculate net employee pay.
 * Ensures strict compliance with "hire date" requirements.
 */
export async function calculateNetDue(
    u: { 
        salary?: any, 
        hireDate?: Date | string | null, 
        dailyLogs?: any[], 
        employeeTransactions?: any[],
        technician?: {
            id: string,
            commissionRate: any,
            tickets?: any[]
        }
    }, 
    startDate: Date, 
    endDate: Date
) {
    let baseSalary = new Decimal(u.salary?.toString() || '0');
    const hireDate = u.hireDate ? new Date(u.hireDate) : null;
    
    // 1. Prorate Base Salary based on hire date
    if (hireDate) {
        if (hireDate > endDate) {
            baseSalary = new Decimal(0);
        } else if (hireDate > startDate) {
            const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
            const hireDay = hireDate.getDate();
            const daysWorked = Math.max(0, lastDay - hireDay + 1);
            baseSalary = baseSalary.times(daysWorked).dividedBy(lastDay);
        }
    }

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
            totalDeductions = totalDeductions.plus(baseSalary.dividedBy(30));
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
        if (
            type === 'BONUS' || 
            type === 'ADDITION' || 
            type === 'MAINTENANCE_COMMISSION' || 
            type.endsWith('_REVERSAL')
        ) {
            totalBonuses = totalBonuses.plus(amount);
        } else if (
            type === 'DEDUCTION' || 
            type === 'PENALTY' || 
            type.endsWith('_DEDUCTION') || 
            type === 'SALARY_PAYMENT'
        ) {
            totalDeductions = totalDeductions.plus(amount);
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

        // Add pending commissions to bonuses if they are NOT already in the transactions list
        // We check for MAINTENANCE_COMMISSION type in the current month's transactions
        const hasCommissionInLedger = transactions.some(tx => tx.type === 'MAINTENANCE_COMMISSION');
        if (!hasCommissionInLedger) {
            totalBonuses = totalBonuses.plus(maintenanceCommissions);
        }

        // Deduct clawbacks if any (Warranty reworking losses)
        // This handles cases where a ticket was marked as clawback but no transaction was created yet
        tickets.filter(t => new Decimal(t.commissionClawback || 0).gt(0)).forEach(t => {
            const hasClawbackInLedger = transactions.some(tx => 
                tx.type === 'MAINTENANCE_COMMISSION_REVERSAL' && tx.referenceId === t.id
            );
            if (!hasClawbackInLedger) {
                totalDeductions = totalDeductions.plus(t.commissionClawback.toString());
            }
        });
    }

    const successRatio = completedTickets > 0 
        ? Math.max(0, ((completedTickets - returnCount) / completedTickets) * 100) 
        : 100;

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
