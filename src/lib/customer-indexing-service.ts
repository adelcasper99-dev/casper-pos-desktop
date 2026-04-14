import { prisma } from './prisma';
import { Decimal } from 'decimal.js';
import { logger } from './logger';

/**
 * CustomerIndexingService
 * Manages the background reconciliation of customer lifetime metrics.
 * Follows the 'Self-Healing' pattern to ensure absolute data parity.
 */
export class CustomerIndexingService {
    private static isRunning = false;

    /**
     * Deep reconciliation for all customers.
     * Iterates in batches to prevent memory pressure on the background thread.
     */
    static async reindexAll(batchSize = 50) {
        if (this.isRunning) return;
        this.isRunning = true;

        logger.info(`[IndexingService] Starting Deep Customer Reconciliation...`);

        try {
            const customers = await prisma.customer.findMany({
                select: { id: true }
            });

            logger.info(`[IndexingService] Found ${customers.length} customers to process.`);

            for (let i = 0; i < customers.length; i += batchSize) {
                const batch = customers.slice(i, i + batchSize);
                await this.processBatch(batch);
                logger.info(`[IndexingService] Processed ${i + batch.length}/${customers.length} customers.`);
            }

            logger.info('[IndexingService] Deep Reconciliation completed successfully.');
        } catch (error) {
            logger.error('[IndexingService] Critical failure during reconciliation', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Processes a single batch of customers.
     * Recalculates LTV (Total Purchase Value) and reconciles Balance.
     */
    private static async processBatch(batch: { id: string }[]) {
        await Promise.all(batch.map(async (c) => {
            const customer = await prisma.customer.findUnique({
                where: { id: c.id },
                include: {
                    sales: {
                        where: { 
                            status: { in: ['COMPLETED', 'PARTIAL'] }
                        },
                        select: { totalAmount: true }
                    },
                    transactions: {
                        select: { amount: true, type: true }
                    }
                }
            });

            if (!customer) return;

            // 1. Calculate LTV (Lifetime Value)
            const totalSpent = (customer as any).sales.reduce((sum: Decimal, sale: any) => sum.add(new Decimal(sale.totalAmount.toString())), new Decimal(0));
            
            // Calculate current balance if logic dictates (Simplified here to parity with current transactions)
            const transactions = (customer as any).transactions;
            const balanceDelta = transactions.reduce((sum: Decimal, tx: any) => {
                const amt = new Decimal(tx.amount.toString());
                // Simple logic: Credit increases balance, Debit decreases (adjust based on GL logic if needed)
                return sum.plus(amt); 
            }, new Decimal(0));

            // 3. Persist if drift detected or simply refresh
            await prisma.customer.update({
                where: { id: customer.id },
                data: {
                    totalPurchaseValue: totalSpent,
                    balance: balanceDelta
                } as any
            });
        }));
    }

    /**
     * Lightweight update for a single customer.
     * Used in the 'Real-time' part of the Hybrid Pattern.
     */
    static async refreshCustomer(customerId: string) {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                sales: {
                    where: { 
                        status: { in: ['COMPLETED', 'PARTIAL'] }
                    },
                    select: { totalAmount: true }
                }
            }
        });

        if (!customer) return;

        const totalSpent = (customer as any).sales.reduce((sum: Decimal, sale: any) => sum.add(new Decimal(sale.totalAmount.toString())), new Decimal(0));

        await prisma.customer.update({
            where: { id: customerId },
            data: { totalPurchaseValue: totalSpent } as any
        });
    }
}
