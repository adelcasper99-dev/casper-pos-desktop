
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { Account, JournalEntry } from '@prisma/client';
import { validateDoubleEntryBalance } from './validation';

// ── BL-08: Use Decimal throughout to prevent floating-point accumulation ──────
// Previously: sum + line.debit (JS number → 0.1 + 0.2 = 0.30000000004)
// Now: Decimal.add() for exact fixed-point arithmetic

export type TransactionLineInput = {
    accountCode: string;
    debit: number;   // Accepts plain numbers; converted to Decimal internally
    credit: number;
    description?: string;
};

/** Payment shape used by recordSale — maps method → GL account */
export type SalePaymentInput = {
    method: string; // CASH | VISA | CARD | VODAFONE_CASH | INSTAPAY | DEFERRED | ACCOUNT
    amount: number;
};

/**
 * GL account code map for payment methods.
 * 1000 = Cash on Hand
 * 1010 = Bank / Card
 * 1020 = Mobile Wallet (Vodafone Cash, Instapay)
 * 1200 = Accounts Receivable (deferred / account customers)
 */
const PAYMENT_ACCOUNT_MAP: Record<string, string> = {
    CASH: '1000',
    VISA: '1010',
    MASTERCARD: '1010',
    CARD: '1010',
    BANK: '1010',
    TRANSFER: '1010',
    VODAFONE_CASH: '1020',
    INSTAPAY: '1020',
    WALLET: '1020',
    DEFERRED: '1200',
    ACCOUNT: '1200',
};

export class AccountingEngine {

    /**
     * Records a balanced double-entry transaction.
     * BL-08: Uses Decimal arithmetic for exact balance validation.
     * BL-09: seedAccounts removed from here — runs in db-init.ts at startup.
     * @param tx  Optional Prisma transaction client — MUST be passed when called inside $transaction
     */
    static async recordTransaction(data: {
        description: string;
        reference?: string;
        date?: Date;
        lines: TransactionLineInput[];
        saleId?: string;
        purchaseId?: string;
        expenseId?: string;
    }, tx?: any) {
        const db = tx || prisma;

        // ── Phase 1.2: Refactored Balance Validation ───────────────────
        const validation = validateDoubleEntryBalance(data.lines);
        if (!validation.isValid) {
            throw new Error(validation.error);
        }

        // ── Resolve Account IDs from GL codes ───────────────────────────────
        const uniqueCodes = Array.from(new Set(data.lines.map(l => l.accountCode)));
        const accounts = await db.account.findMany({
            where: { code: { in: uniqueCodes } }
        });

        // ── BL-09: No lazy seed inside transaction — if accounts missing, fail clearly ─
        if (accounts.length < uniqueCodes.length) {
            const foundCodes = new Set(accounts.map((a: { code: string }) => a.code));
            const missing = uniqueCodes.filter(c => !foundCodes.has(c));
            throw new Error(
                `Missing GL accounts: [${missing.join(', ')}]. ` +
                `Run the app once (db-init seeds Chart of Accounts automatically).`
            );
        }

        const accountMap = new Map(accounts.map((a: { code: string; id: string }) => [a.code, a.id]));

        // ── Create Journal Entry ────────────────────────────────────────────
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

    static async recordSale(
        saleId: string,
        payments: SalePaymentInput[],
        discountAmount: number = 0,
        cogsAmount: number = 0,
        tx?: any
    ) {
        // Gross revenue is net paid + discount
        const netRevenue = payments.reduce((s, p) => s + p.amount, 0);
        const grossRevenue = netRevenue + discountAmount;

        const debitLines: TransactionLineInput[] = payments.map(p => ({
            accountCode: PAYMENT_ACCOUNT_MAP[p.method] ?? '1000',
            debit: p.amount,
            credit: 0,
            description: `${p.method} received`,
        }));

        const lines: TransactionLineInput[] = [
            ...debitLines,
            { accountCode: '4000', debit: 0, credit: grossRevenue, description: 'Sales Revenue' }
        ];

        // ── Phase 2.1: Add Discounts ──
        if (discountAmount > 0) {
            lines.push({ accountCode: '4300', debit: discountAmount, credit: 0, description: 'Sales Discounts' });
        }

        // ── Phase 2.1: Add COGS and Inventory Deduction ──
        if (cogsAmount > 0) {
            lines.push({ accountCode: '5000', debit: cogsAmount, credit: 0, description: 'Cost of Goods Sold' });
            lines.push({ accountCode: '1200', debit: 0, credit: cogsAmount, description: 'Inventory Asset (Out)' });
        }

        return this.recordTransaction({
            description: `Sale #${saleId}`,
            reference: saleId,
            saleId,
            lines
        }, tx);
    }

    /**
     * Phase 2.2: Implement Purchasing & Accounts Payable Logic
     */
    static async recordPurchase(
        purchaseId: string,
        invoiceNumber: string,
        totalInvoiceValue: number,
        paidAmount: number,
        tx?: any
    ) {
        const deferredAmount = totalInvoiceValue - paidAmount;

        const lines: TransactionLineInput[] = [
            { accountCode: '1200', debit: totalInvoiceValue, credit: 0, description: 'Inventory Asset (In)' }
        ];

        if (paidAmount > 0) {
            lines.push({ accountCode: '1000', debit: 0, credit: paidAmount, description: 'Cash Paid' });
        }

        if (deferredAmount > 0) {
            lines.push({ accountCode: '2000', debit: 0, credit: deferredAmount, description: 'Accounts Payable' });
        }

        return this.recordTransaction({
            description: `Purchase Invoice #${invoiceNumber}`,
            reference: invoiceNumber,
            purchaseId,
            lines
        }, tx);
    }

    /**
     * Helper: Record an Expense (Cash)
     */
    static async recordExpense(expenseId: string, amount: number, description: string, tx?: any) {
        return this.recordTransaction({
            description: `Expense: ${description}`,
            reference: expenseId,
            expenseId,
            lines: [
                { accountCode: '5200', debit: amount, credit: 0, description },
                { accountCode: '1000', debit: 0, credit: amount, description: 'Cash paid' }
            ]
        }, tx);
    }
}
