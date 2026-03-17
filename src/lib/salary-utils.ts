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
        employeeTransactions?: any[] 
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
            // How many days worked in the month starting from hireDate
            // We use the last day of the month to be precise
            const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
            const hireDay = hireDate.getDate();
            const daysWorked = Math.max(0, lastDay - hireDay + 1);
            
            // Standardizing to 30-day month for the salary base as per ERP common practice
            // or we can use the actual month days. The original code used 30.
            baseSalary = baseSalary.times(daysWorked).dividedBy(lastDay);
        }
    }

    let totalBonuses = new Decimal(0);
    let totalDeductions = new Decimal(0);

    // 2. Attendance (Only after hire date)
    u.dailyLogs?.forEach((log: any) => {
        const logDate = new Date(log.date);
        if (hireDate && logDate < hireDate) return; // Skip logs before hire

        totalBonuses = totalBonuses.plus(log.bonus.toString());
        const logDeduction = new Decimal(log.deduction.toString());
        
        if (log.status === 'ABSENT' && logDeduction.isZero()) {
            totalDeductions = totalDeductions.plus(baseSalary.dividedBy(30));
        } else {
            totalDeductions = totalDeductions.plus(logDeduction);
        }
    });

    // 3. Transactions (Ledger) (Only after hire date)
    // Filter transactions by hire date (on or after hire date day)
    const hireDateStr = hireDate ? hireDate.toLocaleDateString('en-CA') : null;

    u.employeeTransactions?.forEach((tx: any) => {
        const txDateStr = new Date(tx.createdAt).toLocaleDateString('en-CA');
        if (hireDateStr && txDateStr < hireDateStr) return; // Skip transactions before hire day

        const type = tx.type;
        if (
            type === 'BONUS' || 
            type === 'ADDITION' || 
            type === 'MAINTENANCE_COMMISSION' || 
            type.endsWith('_REVERSAL') ||
            type === 'MAINTENANCE_DEDUCTION_REVERSAL'
        ) {
            totalBonuses = totalBonuses.plus(tx.amount.toString());
        } else if (
            type === 'DEDUCTION' || 
            type === 'PENALTY' || 
            type === 'MAINTENANCE_COMMISSION_REVERSAL' || 
            type.endsWith('_DEDUCTION') || 
            type === 'MAINTENANCE_DEDUCTION' ||
            type === 'SALARY_PAYMENT'
        ) {
            totalDeductions = totalDeductions.plus(tx.amount.toString());
        }
    });

    return {
        baseSalary: baseSalary.toDecimalPlaces(2),
        totalBonuses: totalBonuses.toDecimalPlaces(2),
        totalDeductions: totalDeductions.toDecimalPlaces(2),
        netDue: baseSalary.plus(totalBonuses).minus(totalDeductions).toDecimalPlaces(2)
    };
}
