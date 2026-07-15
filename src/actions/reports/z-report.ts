'use server';

import { prisma } from "@/lib/prisma";

export async function getZReports(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const shifts = await prisma.shift.findMany({
            orderBy: {
                openedAt: 'desc'
            },
            take: 50,
            include: {
                user: {
                    select: { name: true }
                }
            }
        });

        // Calculate a summary across these shifts (optional, maybe just for the current month)
        const totalCash = shifts.reduce((sum, s) => sum + Number(s.totalCashSales || 0), 0);
        const totalCard = shifts.reduce((sum, s) => sum + Number(s.totalCardSales || 0), 0);
        const totalExpenses = shifts.reduce((sum, s) => sum + Number(s.totalExpenses || 0), 0);
        const totalRefunds = shifts.reduce((sum, s) => sum + Number(s.totalRefunds || 0), 0);
        const totalVariance = shifts.reduce((sum, s) => sum + Number(s.cashVariance || 0), 0);

        return {
            success: true,
            data: {
                shifts: shifts.map(s => ({
                    id: s.id,
                    status: s.status,
                    openedAt: s.openedAt,
                    closedAt: s.closedAt,
                    cashierName: s.cashierName || s.user?.name || 'غير معروف',
                    businessDate: s.businessDate,
                    startCash: Number(s.startCash || 0),
                    actualCash: Number(s.actualCash || 0),
                    expectedCash: Number(s.endCash || 0),
                    cashVariance: Number(s.cashVariance || 0),
                    totalCashSales: Number(s.totalCashSales || 0),
                    totalCardSales: Number(s.totalCardSales || 0),
                    totalAccountSales: Number(s.totalAccountSales || 0),
                    totalExpenses: Number(s.totalExpenses || 0),
                    totalRefunds: Number(s.totalRefunds || 0),
                    salesCount: s.totalSales
                })),
                summary: {
                    totalCash,
                    totalCard,
                    totalExpenses,
                    totalRefunds,
                    totalVariance
                }
            }
        };

    } catch (error: any) {
        console.error('[getZReports] Error:', error);
        return { success: false, error: error.message };
    }
}
