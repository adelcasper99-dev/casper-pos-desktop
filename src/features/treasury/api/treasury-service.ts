"use server";

import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { TreasuryLogEntry, TreasuryLogFilters, TreasurySummary } from "../types";

/**
 * Fetches the consolidated treasury log (Cash Book)
 * Logic:
 * 1. Calculate the initial balance by summing all transactions before the start date.
 * 2. Fetch all transactions within the range, sorted by date ASC.
 * 3. Iterate through and calculate running balance (balanceAfter).
 * 4. Reverse the array for UI display (newest first).
 */
export async function getTreasuryLog(filters: TreasuryLogFilters): Promise<{
    success: boolean;
    data?: { entries: TreasuryLogEntry[]; summary: TreasurySummary };
    error?: string;
}> {
    try {
        const startDate = filters.startDate ? startOfDay(new Date(filters.startDate)) : undefined;
        const endDate = filters.endDate ? endOfDay(new Date(filters.endDate)) : undefined;

        // 1. Find Account 1000 (Cash)
        const cashAccount = await prisma.account.findUnique({
            where: { code: '1000' }
        });

        if (!cashAccount) {
            return { success: false, error: "حساب النقدية (1000) غير موجود." };
        }

        // 2. Calculate Initial Balance (All time before startDate)
        let runningBalance = 0;
        if (startDate) {
            const initialAgg = await prisma.journalLine.aggregate({
                where: {
                    accountId: cashAccount.id,
                    journalEntry: {
                        date: { lt: startDate }
                    }
                },
                _sum: {
                    debit: true,
                    credit: true
                }
            });
            runningBalance = Number(initialAgg._sum.debit || 0) - Number(initialAgg._sum.credit || 0);
        }

        // 3. Fetch Transactions in range (ASC for calculation)
        const journalLines = await prisma.journalLine.findMany({
            where: {
                accountId: cashAccount.id,
                journalEntry: {
                    date: startDate && endDate ? { gte: startDate, lte: endDate } : undefined
                }
            },
            include: {
                journalEntry: {
                    include: {
                        sale: { select: { id: true, paymentMethod: true } },
                        purchase: { select: { id: true, paymentMethod: true } },
                        expense: { select: { id: true, category: true, paymentMethod: true } },
                        lines: {
                            include: { account: true }
                        }
                    }
                }
            },
            orderBy: {
                journalEntry: {
                    date: 'asc'
                }
            }
        });

        const entries: TreasuryLogEntry[] = [];
        let totalIn = 0;
        let totalOut = 0;

        for (const line of journalLines) {
            const debit = Number(line.debit);
            const credit = Number(line.credit);
            const amount = debit > 0 ? debit : -credit;

            runningBalance += amount;

            const je = line.journalEntry;
            let categoryLabel = "حركة متنوعة";

            if (debit > 0) {
                // INCOMING (وارد)
                const opposingLine = je.lines?.find(l => l.id !== line.id && Number(l.credit) > 0);

                if (je.sale) categoryLabel = "مبيعات";
                else if (je.description.includes("Customer Payment") || je.description.includes("سداد") || opposingLine?.account.code === '1100') categoryLabel = "سداد عميل";
                else if (je.description.includes("إيداع") || opposingLine?.account.code === '3000') categoryLabel = "إيداع نقدي";
                else if (je.description.includes("تحويل")) categoryLabel = "تحويل وارد";
                else categoryLabel = "وارد متنوع";
            } else {
                // OUTGOING (صادر)
                const opposingLine = je.lines?.find(l => l.id !== line.id && Number(l.debit) > 0);

                if (je.expense) {
                    categoryLabel = je.expense.category ? `مصاريف (${je.expense.category})` : "مصاريف عامة";
                } else if (je.purchase) {
                    categoryLabel = "مشتريات";
                } else if (je.description.includes("سحب") || opposingLine?.account.code === '3100') {
                    categoryLabel = "سحب نقدي";
                } else if (je.description.includes("تحويل")) {
                    categoryLabel = "تحويل صادر";
                } else if (opposingLine?.account.code.startsWith('5')) { // 5100, 5200, 5300
                    categoryLabel = "مصاريف عامة";
                } else if (opposingLine?.account.code.startsWith('13')) { // 1300 Asset purchases
                    categoryLabel = "مصاريف عامة"; // Keep it under expenses to match UI dropdown
                } else {
                    categoryLabel = "صادر متنوع";
                }
            }

            const entry: TreasuryLogEntry = {
                id: line.id,
                createdAt: line.journalEntry.date,
                categoryLabel,
                description: line.journalEntry.description,
                direction: debit > 0 ? 'IN' : 'OUT',
                amount: Math.abs(amount),
                balanceAfter: Number(runningBalance.toFixed(2)),
                referenceId: line.journalEntry.reference,
                paymentMethod: line.journalEntry.sale?.paymentMethod ||
                    line.journalEntry.purchase?.paymentMethod ||
                    line.journalEntry.expense?.paymentMethod || "CASH"
            };

            // Apply filters post-calculation (Direction & Search & Category)
            let matches = true;
            if (filters.direction && filters.direction !== 'ALL' && entry.direction !== filters.direction) {
                matches = false;
            }
            if (filters.category && filters.category !== 'ALL') {
                if (filters.category === 'مصاريف عامة' && entry.categoryLabel.startsWith('مصاريف')) {
                    // Match any expense
                } else if (entry.categoryLabel !== filters.category) {
                    matches = false;
                }
            }
            if (filters.search) {
                const searchLower = filters.search.toLowerCase();
                if (
                    !entry.description?.toLowerCase().includes(searchLower) &&
                    !entry.referenceId?.toLowerCase().includes(searchLower)
                ) {
                    matches = false;
                }
            }

            if (matches) {
                entries.push(entry);
                if (entry.direction === 'IN') totalIn += entry.amount;
                else totalOut += entry.amount;
            }
        }

        const summary: TreasurySummary = {
            totalIn: Number(totalIn.toFixed(2)),
            totalOut: Number(totalOut.toFixed(2)),
            netChange: Number((totalIn - totalOut).toFixed(2)),
            currentBalance: Number(runningBalance.toFixed(2))
        };

        // 4. Reverse for newest first display
        return {
            success: true,
            data: {
                entries: entries.reverse(),
                summary
            }
        };

    } catch (error: any) {
        console.error("[getTreasuryLog] Error:", error);
        return { success: false, error: error.message };
    }
}
