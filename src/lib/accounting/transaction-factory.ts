
import { prisma } from '@/lib/prisma';
// Types will be available after generation
import { Account, JournalEntry } from '@prisma/client';

export type TransactionLineInput = {
    accountCode: string;
    debit: number;
    credit: number;
    description?: string;
};

export class AccountingEngine {

    /**
     * Records a balanced double-entry transaction.
     * Throws error if debits != credits.
     */
    static async recordTransaction(data: {
        description: string;
        reference?: string;
        date?: Date;
        lines: TransactionLineInput[];
        // Context links
        saleId?: string;
        purchaseId?: string;
        expenseId?: string;
    }, tx?: any) { // PrismaTransactionClient
        const db = tx || prisma;

        // 1. Validate Balance
        const totalDebit = data.lines.reduce((sum, line) => sum + line.debit, 0);
        const totalCredit = data.lines.reduce((sum, line) => sum + line.credit, 0);

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            throw new Error(`Transaction Unbalanced: Debit ${totalDebit} != Credit ${totalCredit}`);
        }

        // 2. Resolve Account IDs from Codes
        let accounts = await db.account.findMany({
            where: { code: { in: data.lines.map(l => l.accountCode) } }
        });

        // 🆕 Bulletproof: If any accounts are missing, try to seed them once
        if (accounts.length < new Set(data.lines.map(l => l.accountCode)).size) {
            console.log(`[ENGINE] Missing accounts detected. Triggering seed...`);
            const { seedAccounts } = await import('./seed-accounts');
            await seedAccounts();
            // Re-fetch
            accounts = await db.account.findMany({
                where: { code: { in: data.lines.map(l => l.accountCode) } }
            });
            console.log(`[ENGINE] Post-seed account count: ${accounts.length}`);
        }

        const accountMap = new Map(accounts.map((a: { code: string; id: string }) => [a.code, a.id]));

        for (const line of data.lines) {
            if (!accountMap.has(line.accountCode)) {
                console.error(`[ENGINE ERROR] Account Code ${line.accountCode} STILL NOT FOUND after seeding.`);
                throw new Error(`Critical Account Missing: ${line.accountCode}. Please visit Accounting Dashboard to repair.`);
            }
        }

        // 3. Create Journal Entry
        return await db.journalEntry.create({
            data: {
                description: data.description,
                reference: data.reference,
                date: data.date || new Date(),
                saleId: data.saleId,
                purchaseId: data.purchaseId,
                expenseId: data.expenseId,
                lines: {
                    create: data.lines.map(line => ({
                        accountId: accountMap.get(line.accountCode)!,
                        debit: line.debit,
                        credit: line.credit,
                        description: line.description
                    }))
                }
            }
        });
    }

    /**
     * Helper: Record a Sale (Cash)
     */
    /**
     * Helper: Record a Sale
     * Handles CASH vs DEFERRED (AR)
     */
    static async recordSale(saleId: string, amount: number, paymentMethod: string = 'CASH') {
        const isDeferred = paymentMethod === 'DEFERRED' || paymentMethod === 'ACCOUNT';

        // Debit Cash (1000) OR Accounts Receivable (1200)
        // Credit Sales Revenue (4000)

        return this.recordTransaction({
            description: `Sale #${saleId}`,
            reference: saleId,
            saleId: saleId,
            lines: [
                {
                    accountCode: isDeferred ? '1200' : '1000',
                    debit: amount,
                    credit: 0,
                    description: isDeferred ? 'Customer Debt' : 'Cash received'
                },
                { accountCode: '4000', debit: 0, credit: amount, description: 'Sales Revenue' }
            ]
        });
    }

    /**
    * Helper: Record an Expense (Cash)
    */
    static async recordExpense(expenseId: string, amount: number, description: string) {
        return this.recordTransaction({
            description: `Expense: ${description}`,
            reference: expenseId,
            expenseId: expenseId,
            lines: [
                { accountCode: '5200', debit: amount, credit: 0, description: description },
                { accountCode: '1000', debit: 0, credit: amount, description: 'Cash paid' }
            ]
        });
    }
}
