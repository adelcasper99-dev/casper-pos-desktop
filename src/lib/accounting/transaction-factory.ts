
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
    DEFERRED: '1100',
    ACCOUNT: '1100',
    SUPPLIER_OFFSET: '2000',
    STORE_CREDIT: '2150',
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
        branchId?: string;
        lines: TransactionLineInput[];
        saleId?: string;
        purchaseId?: string;
        expenseId?: string;
        ticketId?: string;
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
                branchId: data.branchId,
                saleId: data.saleId,
                purchaseId: data.purchaseId,
                expenseId: data.expenseId,
                ticketId: data.ticketId,
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
        discountAmount: number | Decimal = 0,
        cogsAmount: number | Decimal = 0,
        taxAmount: number | Decimal = 0,
        branchId?: string,
        tx?: any
    ) {
        // Gross revenue is net paid + discount - tax
        const netRevenue = payments.reduce((s, p) => s.add(new Decimal(p.amount)), new Decimal(0));
        const grossRevenue = netRevenue.add(new Decimal(discountAmount)).sub(new Decimal(taxAmount));

        const debitLines: TransactionLineInput[] = payments.map(p => ({
            accountCode: PAYMENT_ACCOUNT_MAP[p.method] ?? '1000',
            debit: new Decimal(p.amount).toNumber(),
            credit: 0,
            description: `${p.method} received`,
        }));

        const lines: TransactionLineInput[] = [
            ...debitLines,
            { accountCode: '4000', debit: 0, credit: grossRevenue.toNumber(), description: 'Sales Revenue (ex-tax)' }
        ];

        // ── B2: Add Tax Journalization ──
        if (new Decimal(taxAmount).gt(0)) {
            lines.push({ accountCode: '2100', debit: 0, credit: new Decimal(taxAmount).toNumber(), description: 'Sales Tax Payable' });
        }

        // ── Phase 2.1: Add Discounts ──
        if (new Decimal(discountAmount).gt(0)) {
            lines.push({ accountCode: '4300', debit: new Decimal(discountAmount).toNumber(), credit: 0, description: 'Sales Discounts' });
        }

        // ── Phase 2.1: Add COGS and Inventory Deduction ──
        if (new Decimal(cogsAmount).gt(0)) {
            lines.push({ accountCode: '5000', debit: new Decimal(cogsAmount).toNumber(), credit: 0, description: 'Cost of Goods Sold' });
            lines.push({ accountCode: '1200', debit: 0, credit: new Decimal(cogsAmount).toNumber(), description: 'Inventory Asset (Out)' });
        }

        return this.recordTransaction({
            description: `Sale #${saleId}`,
            reference: saleId,
            branchId,
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
        totalInvoiceValue: number | Decimal,
        paidAmount: number | Decimal,
        taxAmount: number | Decimal = 0,
        branchId?: string,
        tx?: any
    ) {
        const amount = new Decimal(totalInvoiceValue);
        const tax = new Decimal(taxAmount);
        const inventoryValue = amount.sub(tax);
        const deferredAmount = amount.sub(new Decimal(paidAmount));

        const lines: TransactionLineInput[] = [
            { accountCode: '1200', debit: inventoryValue.toNumber(), credit: 0, description: 'Inventory Asset (Net of Tax)' }
        ];

        if (tax.gt(0)) {
            lines.push({ accountCode: '1210', debit: tax.toNumber(), credit: 0, description: 'Input VAT (Recoverable)' });
        }

        if (new Decimal(paidAmount).gt(0)) {
            lines.push({ accountCode: '1000', debit: 0, credit: new Decimal(paidAmount).toNumber(), description: 'Cash Paid' });
        }

        if (deferredAmount.gt(0)) {
            lines.push({ accountCode: '2000', debit: 0, credit: deferredAmount.toNumber(), description: 'Supplier Credit (AP)' });
        }

        return this.recordTransaction({
            description: `Purchase Invoice #${invoiceNumber}`,
            reference: invoiceNumber,
            branchId,
            purchaseId,
            lines
        }, tx);
    }

    /**
     * Helper: Record an Expense (Cash)
     */
    static async recordExpense(expenseId: string, amount: number, description: string, branchId?: string, tx?: any) {
        return this.recordTransaction({
            description: `Expense: ${description}`,
            reference: expenseId,
            branchId,
            expenseId,
            lines: [
                { accountCode: '5200', debit: amount, credit: 0, description },
                { accountCode: '1000', debit: 0, credit: amount, description: 'Cash paid' }
            ]
        }, tx);
    }

    /**
     * Unified Refund Helper
     * Handles both retail sales and maintenance refunds.
     */
    static async recordRefund(data: {
        amount: number | Decimal;
        method: string;
        description: string;
        reference: string;
        saleId?: string;
        ticketId?: string;
        cogsReversal?: number | Decimal;
        spoilageAmount?: number | Decimal;
        branchId?: string;
    }, tx?: any) {
        const { amount, method, description, reference, saleId, ticketId, cogsReversal, spoilageAmount, branchId } = data;
        const absAmount = new Decimal(amount).abs();
        const accountCode = PAYMENT_ACCOUNT_MAP[method] ?? '1000';
        const isDeferred = method === 'DEFERRED' || method === 'ACCOUNT';

        const lines: TransactionLineInput[] = [
            // Refund: Debit Revenue (reverse) / Credit Asset/AR
            {
                accountCode: ticketId ? '4100' : '4000',
                debit: absAmount.toNumber(),
                credit: 0,
                description: ticketId ? 'Service Revenue Reversed' : 'Sales Revenue Reversed'
            },
            {
                accountCode,
                debit: 0,
                credit: absAmount.toNumber(),
                description: method === 'STORE_CREDIT'
                    ? 'Store Credit Issued (Wallet)'
                    : (isDeferred ? 'Customer AR Reduced' : 'Cash/Bank Refunded')
            }
        ];

        // Handle COGS reversal if provided (for retail returns)
        if (cogsReversal && new Decimal(cogsReversal).gt(0)) {
            lines.push({ accountCode: '1200', debit: new Decimal(cogsReversal).toNumber(), credit: 0, description: 'Inventory Asset Restored' });
            lines.push({ accountCode: '5000', debit: 0, credit: new Decimal(cogsReversal).toNumber(), description: 'COGS Reversed' });
        }

        // Handle Spoilage if item was damaged (returns that go straight to wastage)
        if (spoilageAmount && new Decimal(spoilageAmount).gt(0)) {
            lines.push({ accountCode: '5600', debit: new Decimal(spoilageAmount).toNumber(), credit: 0, description: 'Inventory Spoilage' });
            lines.push({ accountCode: '1200', debit: 0, credit: new Decimal(spoilageAmount).toNumber(), description: 'Inventory Asset (Wastage)' });
        }

        return this.recordTransaction({
            description: `Refund: ${description}`,
            reference,
            branchId,
            saleId,
            ticketId,
            lines
        }, tx);
    }

    /**
     * Records a payment for a maintenance ticket.
     * Prevents the "Accounting Black Hole" where revenue was reversed as refunds.
     */
    static async recordMaintenancePayment(data: {
        amount: number | Decimal;
        method: string;
        description: string;
        reference: string;
        ticketId: string;
        branchId?: string;
    }, tx?: any) {
        const { amount, method, description, reference, ticketId, branchId } = data;
        const absAmount = new Decimal(amount).abs();
        const assetAccount = PAYMENT_ACCOUNT_MAP[method] ?? '1000';

        return this.recordTransaction({
            description: `Service Payment: ${description}`,
            reference,
            branchId: branchId,
            ticketId,
            lines: [
                { accountCode: assetAccount, debit: absAmount.toNumber(), credit: 0, description: `Service Payment received (${method})` },
                { accountCode: '4100', debit: 0, credit: absAmount.toNumber(), description: 'Service Revenue' }
            ]
        }, tx);
    }

    /**
     * Records the cost of goods sold for parts used in a repair.
     */
    static async recordMaintenanceCOGS(data: {
        ticketId: string;
        partsCost: number | Decimal;
        barcode: string;
        branchId?: string;
    }, tx?: any) {
        const { ticketId, partsCost, barcode, branchId } = data;
        const cost = new Decimal(partsCost);
        if (cost.lte(0)) return null;

        return this.recordTransaction({
            description: `Maintenance COGS: Ticket #${barcode}`,
            reference: ticketId,
            ticketId,
            lines: [
                { accountCode: '5000', debit: cost.toNumber(), credit: 0, description: 'Cost of Parts Used' },
                { accountCode: '1200', debit: 0, credit: cost.toNumber(), description: 'Inventory Asset (Out)' }
            ]
        }, tx);
    }


    /**
     * recordSaleReturn (New centralized helper)
     * Handles full/partial returns with item-level logic (Bypass Services)
     */
    static async recordSaleReturn(data: {
        saleId: string;
        returnSaleId: string;
        totalRefund: number | Decimal;
        cashPortion: number | Decimal;
        arPortion: number | Decimal;
        walletPortion: number | Decimal;
        items: { productId: string; quantity: number | Decimal; unitCost: number | Decimal; isDamaged?: boolean }[];
        reason?: string;
        branchId?: string;
    }, tx?: any) {
        const { totalRefund, cashPortion, arPortion, walletPortion, items, returnSaleId, saleId, reason, branchId } = data;
        const db = tx || prisma;

        // 1. Core Revenue Reversal
        const lines: TransactionLineInput[] = [
            { 
                accountCode: '4000', 
                debit: new Decimal(totalRefund).toNumber(), 
                credit: 0, 
                description: `Sales Revenue Reversed: #${saleId.slice(0, 8)}` 
            }
        ];

        // 2. Financial Reversals
        if (new Decimal(cashPortion).gt(0)) {
            lines.push({ accountCode: '1000', debit: 0, credit: new Decimal(cashPortion).toNumber(), description: 'Cash Refunded' });
        }
        if (new Decimal(arPortion).gt(0)) {
            lines.push({ accountCode: '1100', debit: 0, credit: new Decimal(arPortion).toNumber(), description: 'AR Reduced' });
        }
        if (new Decimal(walletPortion).gt(0)) {
            lines.push({ accountCode: '2150', debit: 0, credit: new Decimal(walletPortion).toNumber(), description: 'Store Credit Issued' });
        }

        // 3. COGS / Inventory Reversal (Centralized Bypass Logic)
        const productIds = items.map(i => i.productId);
        const products = await db.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, itemType: true }
        });
        const productTypeMap = new Map(products.map((p: any) => [p.id, p.itemType]));

        let totalCogsReversal = new Decimal(0);
        let totalSpoilage = new Decimal(0);

        for (const item of items) {
            const type = productTypeMap.get(item.productId);
            if (type !== 'SERVICE') {
                const itemCost = new Decimal(item.unitCost).mul(new Decimal(item.quantity));
                totalCogsReversal = totalCogsReversal.add(itemCost);
                if (item.isDamaged) {
                    totalSpoilage = totalSpoilage.add(itemCost);
                }
            }
        }

        if (totalCogsReversal.gt(0)) {
            lines.push({ 
                accountCode: '1200', 
                debit: totalCogsReversal.toNumber(), 
                credit: 0, 
                description: 'Inventory Asset Restored' 
            });
            lines.push({ 
                accountCode: '5000', 
                debit: 0, 
                credit: totalCogsReversal.toNumber(), 
                description: 'COGS Reversed' 
            });
        }

        // If any item was damaged, immediately write it off from Inventory to Spoilage
        if (totalSpoilage.gt(0)) {
            lines.push({ 
                accountCode: '5600', 
                debit: totalSpoilage.toNumber(), 
                credit: 0, 
                description: 'Spoilage (Damaged Return)' 
            });
            lines.push({ 
                accountCode: '1200', 
                debit: 0, 
                credit: totalSpoilage.toNumber(), 
                description: 'Inventory Written Off' 
            });
        }

        return this.recordTransaction({
            description: `Return Transaction: ${reason || 'Customer Return'}`,
            reference: returnSaleId,
            branchId,
            saleId: returnSaleId,
            lines
        }, tx);
    }

    /**
     * Helper: Record Inventory Wastage (Shrinkage/Spoilage)
     */
    static async recordWastage(data: {
        wastageId: string;
        amount: number | Decimal;
        description: string;
        branchId?: string;
    }, tx?: any) {
        const amount = new Decimal(data.amount);
        const lines: TransactionLineInput[] = [
            { accountCode: '5600', debit: amount.toNumber(), credit: 0, description: 'Inventory Wastage/Shrinkage' },
            { accountCode: '1200', debit: 0, credit: amount.toNumber(), description: 'Inventory Asset Reduced' }
        ];

        return this.recordTransaction({
            description: data.branchId ? `[Branch: ${data.branchId}] ${data.description}` : data.description,
            reference: data.wastageId,
            branchId: data.branchId,
            lines
        }, tx);
    }

    /**
     * Helper: Record Inventory Surplus (Gain)
     */
    static async recordStockGain(data: {
        productId: string;
        amount: number | Decimal;
        description: string;
        branchId?: string;
    }, tx?: any) {
        const amount = new Decimal(data.amount);
        const lines: TransactionLineInput[] = [
            { accountCode: '1200', debit: amount.toNumber(), credit: 0, description: 'Inventory Asset Increased' },
            { accountCode: '4400', debit: 0, credit: amount.toNumber(), description: 'Inventory Surplus / Other Income' }
        ];

        return this.recordTransaction({
            description: data.branchId ? `[Branch: ${data.branchId}] ${data.description}` : data.description,
            reference: data.productId,
            branchId: data.branchId,
            lines
        }, tx);
    }
}
