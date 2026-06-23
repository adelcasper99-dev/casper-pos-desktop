import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { ALL_EXPENSE_CODES } from './constants';

/** GL codes that represent Revenue (Credit-normal) */
const REVENUE_CODES = ['4000', '4100', '4200', '4300', '4400', '4500'];

export interface NetProfitResult {
    /** Total revenue (Credits on 4xxx accounts) */
    totalRevenue: Decimal;
    /** Total expenses including COGS (Debits on 5xxx accounts) */
    totalExpenses: Decimal;
    /** Net Profit = Revenue − Expenses. Negative = Loss. */
    netProfit: Decimal;
    isLoss: boolean;
    period: { from: Date; to: Date };
}

/**
 * Calculates Net Profit for a given period by aggregating all
 * journal lines on Revenue and Expense GL accounts.
 *
 * Revenue accounts (4xxx) are Credit-normal — sum of Credits − Debits.
 * Expense accounts (5xxx) are Debit-normal  — sum of Debits  − Credits.
 *
 * @param from  Period start (inclusive)
 * @param to    Period end   (inclusive, set to end-of-day)
 */
export async function getNetProfit(from: Date, to: Date): Promise<NetProfitResult> {
    // Normalize `to` to end-of-day so we capture all entries on that date
    const toEOD = new Date(to);
    toEOD.setHours(23, 59, 59, 999);

    const lines = await prisma.journalLine.findMany({
        where: {
            journalEntry: {
                date: { gte: from, lte: toEOD },
            },
            account: {
                code: { in: [...REVENUE_CODES, ...ALL_EXPENSE_CODES] },
            },
        },
        include: {
            account: { select: { code: true, type: true } },
        },
    });

    let totalRevenue = new Decimal(0);
    let totalExpenses = new Decimal(0);

    for (const line of lines) {
        const debit  = new Decimal(String(line.debit));
        const credit = new Decimal(String(line.credit));

        if (REVENUE_CODES.includes(line.account.code)) {
            // Revenue is Credit-normal: net contribution = credit − debit
            totalRevenue = totalRevenue.add(credit).sub(debit);
        } else {
            // Expense is Debit-normal: net contribution = debit − credit
            totalExpenses = totalExpenses.add(debit).sub(credit);
        }
    }

    const netProfit = totalRevenue.sub(totalExpenses);

    return {
        totalRevenue,
        totalExpenses,
        netProfit,
        isLoss: netProfit.lt(0),
        period: { from, to: toEOD },
    };
}
