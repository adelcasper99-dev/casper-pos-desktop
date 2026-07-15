'use server';

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";

export async function getAgedDebts(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        // Find all customers with a positive balance
        const customers = await prisma.customer.findMany({
            where: {
                balance: { gt: 0 }
            },
            include: {
                sales: {
                    where: {
                        paymentMethod: 'ACCOUNT',
                        status: { notIn: ['VOIDED', 'REFUNDED'] }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 100
                }
            }
        });

        const now = new Date();

        const results = customers.map(customer => {
            const balance = Number(customer.balance);
            let remainingBalance = balance;
            
            let current = 0; // < 30 days
            let days30 = 0;  // 30 - 60 days
            let days60 = 0;  // 60 - 90 days
            let days90 = 0;  // > 90 days

            // Allocate remaining balance to sales from newest to oldest (FIFO payments)
            for (const sale of customer.sales) {
                if (remainingBalance <= 0) break;

                const saleAmount = Number(sale.totalAmount);
                const amountToAllocate = Math.min(remainingBalance, saleAmount);
                
                const ageDays = Math.floor((now.getTime() - new Date(sale.createdAt).getTime()) / (1000 * 60 * 60 * 24));

                if (ageDays < 30) {
                    current += amountToAllocate;
                } else if (ageDays < 60) {
                    days30 += amountToAllocate;
                } else if (ageDays < 90) {
                    days60 += amountToAllocate;
                } else {
                    days90 += amountToAllocate;
                }

                remainingBalance -= amountToAllocate;
            }

            // If there's still balance left (e.g., opening balance without sales), put it in >90 days
            if (remainingBalance > 0) {
                days90 += remainingBalance;
            }

            return {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                totalDue: balance,
                current,
                days30,
                days60,
                days90
            };
        });

        // Filter out those with no total due
        const validResults = results.filter(r => r.totalDue > 0);
        
        // Sort by total due descending
        validResults.sort((a, b) => b.totalDue - a.totalDue);

        const summary = {
            totalDue: validResults.reduce((sum, r) => sum + r.totalDue, 0),
            current: validResults.reduce((sum, r) => sum + r.current, 0),
            days30: validResults.reduce((sum, r) => sum + r.days30, 0),
            days60: validResults.reduce((sum, r) => sum + r.days60, 0),
            days90: validResults.reduce((sum, r) => sum + r.days90, 0),
            customerCount: validResults.length
        };

        return {
            success: true,
            data: {
                customers: validResults,
                summary
            }
        };

    } catch (error: any) {
        console.error('[getAgedDebts] Error:', error);
        return { success: false, error: error.message };
    }
}
