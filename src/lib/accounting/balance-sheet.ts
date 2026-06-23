import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { GL } from "@/shared/constants/accounting-mappings";

export interface BalanceSheetItem {
    code: string;
    name: string;
    balance: number;
}

export interface BalanceSheetSection {
    title: string;
    items: BalanceSheetItem[];
    total: number;
}

export interface BalanceSheetResult {
    asOfDate: Date;
    assets: {
        currentAssets: BalanceSheetSection;
        fixedAssets: BalanceSheetSection;
        totalAssets: number;
    };
    liabilities: {
        currentLiabilities: BalanceSheetSection;
        totalLiabilities: number;
    };
    equity: {
        capital: BalanceSheetSection;
        retainedEarnings: BalanceSheetSection;
        currentAccounts: BalanceSheetSection;
        currentPeriodProfit: number;
        totalEquity: number;
    };
    totalLiabilitiesAndEquity: number;
    isBalanced: boolean;
    imbalanceAmount: number;
}

/**
 * Calculates the balance sheet as of a specific date.
 */
export async function getBalanceSheet(asOfDate: Date): Promise<BalanceSheetResult> {
    const targetDate = new Date(asOfDate);
    targetDate.setHours(23, 59, 59, 999);

    // 1. Fetch all accounts and their journal line aggregates up to the target date
    const accounts = await prisma.account.findMany({
        where: {
            // Include all active accounts
        }
    });

    const aggregates = await prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
            journalEntry: {
                date: { lte: targetDate }
            }
        },
        _sum: {
            debit: true,
            credit: true
        }
    });

    // Map accountId to its aggregate debit/credit
    const balanceMap = new Map<string, { debit: Decimal; credit: Decimal }>();
    for (const agg of aggregates) {
        const debitSum = agg._sum?.debit ? new Decimal(String(agg._sum.debit)) : new Decimal(0);
        const creditSum = agg._sum?.credit ? new Decimal(String(agg._sum.credit)) : new Decimal(0);
        balanceMap.set(agg.accountId, {
            debit: debitSum,
            credit: creditSum
        });
    }

    // Helper to get balance for an account
    const getAccountBalance = (id: string, type: string): Decimal => {
        const agg = balanceMap.get(id) || { debit: new Decimal(0), credit: new Decimal(0) };
        if (type === 'ASSET' || type === 'EXPENSE') {
            // Debit normal
            return agg.debit.minus(agg.credit);
        } else {
            // Credit normal (Liability, Equity, Revenue)
            return agg.credit.minus(agg.debit);
        }
    };

    // 2. Classify Assets
    const currentAssetItems: BalanceSheetItem[] = [];
    const fixedAssetItems: BalanceSheetItem[] = [];
    let totalCurrentAssets = new Decimal(0);
    let totalFixedAssets = new Decimal(0);

    // 3. Classify Liabilities
    const currentLiabilityItems: BalanceSheetItem[] = [];
    let totalCurrentLiabilities = new Decimal(0);

    // 4. Classify Equity
    const capitalItems: BalanceSheetItem[] = [];
    const currentAccountItems: BalanceSheetItem[] = [];
    const retainedEarningsItems: BalanceSheetItem[] = [];
    let totalCapital = new Decimal(0);
    let totalCurrentAccounts = new Decimal(0);
    let totalRetainedEarnings = new Decimal(0);

    // 5. Net Profit of the Period (unallocated)
    let totalRevenue = new Decimal(0);
    let totalExpenses = new Decimal(0);

    for (const acc of accounts) {
        const bal = getAccountBalance(acc.id, acc.type);
        const balVal = bal.toNumber();

        if (acc.type === 'ASSET') {
            // Check if Fixed Assets (1300, 1310)
            if (acc.code.startsWith('130') || acc.code.startsWith('131')) {
                // 1310 (Accumulated Depreciation) is a contra-asset, usually has a credit balance,
                // so bal (debit - credit) will be negative, which is correct!
                fixedAssetItems.push({ code: acc.code, name: acc.name, balance: balVal });
                totalFixedAssets = totalFixedAssets.plus(bal);
            } else {
                // Current Assets (Cash, Receivables, Inventory, 1350)
                currentAssetItems.push({ code: acc.code, name: acc.name, balance: balVal });
                totalCurrentAssets = totalCurrentAssets.plus(bal);
            }
        } else if (acc.type === 'LIABILITY') {
            currentLiabilityItems.push({ code: acc.code, name: acc.name, balance: balVal });
            totalCurrentLiabilities = totalCurrentLiabilities.plus(bal);
        } else if (acc.type === 'EQUITY') {
            // Categorize Equity sub-sections
            if (acc.code.startsWith('30') || acc.code === '3999') {
                // Capital accounts (3000, 3001, 3999, etc.)
                capitalItems.push({ code: acc.code, name: acc.name, balance: balVal });
                totalCapital = totalCapital.plus(bal);
            } else if (acc.code.startsWith('32')) {
                // Drawings / Current Accounts (3200, 3201, etc.)
                currentAccountItems.push({ code: acc.code, name: acc.name, balance: balVal });
                totalCurrentAccounts = totalCurrentAccounts.plus(bal);
            } else if (acc.code === '3300' || acc.code === '3100') {
                // Retained earnings
                retainedEarningsItems.push({ code: acc.code, name: acc.name, balance: balVal });
                totalRetainedEarnings = totalRetainedEarnings.plus(bal);
            } else {
                // Fallback for other equity
                capitalItems.push({ code: acc.code, name: acc.name, balance: balVal });
                totalCapital = totalCapital.plus(bal);
            }
        } else if (acc.type === 'REVENUE') {
            totalRevenue = totalRevenue.plus(bal);
        } else if (acc.type === 'EXPENSE') {
            // Note: Since Expense has normal Debit balance, getAccountBalance returns Debit - Credit.
            // But for net profit calculation, we want Expense as a positive value to subtract from Revenue.
            // Since bal = Debit - Credit, it is already positive for expenses.
            totalExpenses = totalExpenses.plus(bal);
        }
    }

    const currentPeriodProfit = totalRevenue.minus(totalExpenses);

    const totalAssets = totalCurrentAssets.plus(totalFixedAssets);
    const totalLiabilities = totalCurrentLiabilities;
    const totalEquity = totalCapital.plus(totalCurrentAccounts).plus(totalRetainedEarnings).plus(currentPeriodProfit);
    const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquity);

    const imbalance = totalAssets.minus(totalLiabilitiesAndEquity);
    const isBalanced = imbalance.abs().lt(0.01); // Safe precision check

    return {
        asOfDate: targetDate,
        assets: {
            currentAssets: {
                title: "الأصول المتداولة (Current Assets)",
                items: currentAssetItems.filter(i => i.balance !== 0),
                total: totalCurrentAssets.toNumber()
            },
            fixedAssets: {
                title: "الأصول الثابتة (Fixed Assets)",
                items: fixedAssetItems.filter(i => i.balance !== 0),
                total: totalFixedAssets.toNumber()
            },
            totalAssets: totalAssets.toNumber()
        },
        liabilities: {
            currentLiabilities: {
                title: "الخصوم المتداولة (Current Liabilities)",
                items: currentLiabilityItems.filter(i => i.balance !== 0),
                total: totalCurrentLiabilities.toNumber()
            },
            totalLiabilities: totalLiabilities.toNumber()
        },
        equity: {
            capital: {
                title: "رأس المال (Capital)",
                items: capitalItems.filter(i => i.balance !== 0),
                total: totalCapital.toNumber()
            },
            retainedEarnings: {
                title: "الأرباح المحتجزة (Retained Earnings)",
                items: retainedEarningsItems.filter(i => i.balance !== 0),
                total: totalRetainedEarnings.toNumber()
            },
            currentAccounts: {
                title: "الحسابات الجارية والمسحوبات (Partner Current Accounts / Drawings)",
                items: currentAccountItems.filter(i => i.balance !== 0),
                total: totalCurrentAccounts.toNumber()
            },
            currentPeriodProfit: currentPeriodProfit.toNumber(),
            totalEquity: totalEquity.toNumber()
        },
        totalLiabilitiesAndEquity: totalLiabilitiesAndEquity.toNumber(),
        isBalanced,
        imbalanceAmount: imbalance.toNumber()
    };
}
