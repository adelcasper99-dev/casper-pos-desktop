import { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";

/**
 * FinancialReversalService
 * Centralized logic for reversing treasury impacts and accounting entries.
 */
export class FinancialReversalService {
    /**
     * Reverses all treasury transactions linked to a specific reference.
     * @param tx Prisma Transaction client
     * @param referenceId The ID of the source record (e.g. EmployeeTransaction ID)
     * @param referenceType The type tag
     * @param reason Reason for reversal
     */
    static async reverseTreasuryImpacts(
        tx: any, 
        referenceId: string, 
        referenceType: string, 
        reason: string
    ) {
        // 1. Find all transactions linked to this reference that aren't already reversed
        const transactions = await tx.transaction.findMany({
            where: {
                referenceId,
                referenceType,
                deletedAt: null,
                isReversed: false
            }
        });

        if (transactions.length === 0) {
            console.warn(`No active treasury transactions found for reversal: ${referenceType} - ${referenceId}`);
            return;
        }

        for (const transaction of transactions) {
            const amount = new Decimal(transaction.amount);
            
            // 2. Reverse the physical balance if tied to a treasury
            if (transaction.treasuryId) {
                // Logic: 
                // If it was an EXPENSE/REFUND (represented as positive in 'amount' but decremented from balance in logic)
                // OR it was an INCOME (represented as positive in 'amount' and incremented)
                // We need to look at the 'type' to know if we should increment or decrement back.
                
                const IN_TYPES = new Set([
                    'IN', 'SALE', 'CAPITAL', 'CUSTOMER_PAYMENT', 'SAFE_DROP', 'TRANSFER_IN', 'SALE_PAYMENT'
                ]);

                // We follow the logic in deleteTreasuryTransaction in treasury.ts
                const isIncome = IN_TYPES.has(transaction.type);

                await tx.treasury.update({
                    where: { id: transaction.treasuryId },
                    data: {
                        balance: isIncome 
                            ? { decrement: amount } // Remove income
                            : { increment: amount } // Return expense
                    }
                });
            }

            // 3. Mark the transaction as reversed
            await tx.transaction.update({
                where: { id: transaction.id },
                data: {
                    isReversed: true,
                    deletedAt: new Date(),
                    deletedReason: `Reversed via ${referenceType} reversal: ${reason}`
                }
            });

            // 4. Audit Log
            await tx.auditLog.create({
                data: {
                    entityType: "TRANSACTION",
                    entityId: transaction.id,
                    action: "REVERSAL",
                    previousData: JSON.stringify(transaction),
                    reason: reason,
                }
            });
        }
    }

    /**
     * Voids journal entries linked to a specific reference.
     */
    static async reverseAccountingEntries(
        tx: any,
        referenceId: string,
        reason: string
    ) {
        // Find journal entries where reference field in DB matches referenceId
        const entries = await tx.journalEntry.findMany({
            where: { reference: referenceId },
            include: { lines: true }
        });

        for (const entry of entries) {
            // Reversing via contra-entry instead of hard delete to preserve audit trail
            if (entry.lines.length > 0) {
                await tx.journalEntry.create({
                    data: {
                        description: `VOID: ${entry.description} — ${reason}`,
                        reference: `VOID-${entry.reference || entry.id.slice(0, 8)}`,
                        branchId: entry.branchId,
                        date: new Date(),
                        lines: {
                            create: entry.lines.map((l: any) => ({
                                accountId: l.accountId,
                                debit: l.credit,      // swapped
                                credit: l.debit,      // swapped
                                description: `VOID: ${l.description || reason}`
                            }))
                        }
                    }
                });
            }

            // Audit
            await tx.auditLog.create({
                data: {
                    entityType: "JOURNAL_ENTRY",
                    entityId: entry.id,
                    action: "VOID_CONTRA_REVERSAL",
                    previousData: JSON.stringify(entry),
                    reason: reason,
                }
            });
        }
    }

    /**
     * Unified entry point for full reversal
     */
    static async fullReversal(
        tx: any,
        referenceId: string,
        referenceType: string,
        reason: string
    ) {
        await this.reverseTreasuryImpacts(tx, referenceId, referenceType, reason);
        await this.reverseAccountingEntries(tx, referenceId, reason);
    }
}
