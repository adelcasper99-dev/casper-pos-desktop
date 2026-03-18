"use server";

import { prisma } from '@/lib/prisma';
import { secureAction } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { Decimal } from '@prisma/client/runtime/library';
import { getTranslations } from '@/lib/i18n-mock';
import { getCurrentUser } from './auth';
import { getCurrentShiftInternal } from './shift-management-actions';
import { AccountingEngine } from '@/lib/accounting/transaction-factory';
import { financialRepo } from '@/lib/repositories/financial-repo';
import { z } from 'zod';


/**
 * Search for existing customers by name or phone
 * Returns customers from the Customer table with their actual UUIDs
 */
export const searchCustomers = secureAction(async (query: string) => {
    if (!query || query.length < 2) {
        return { customers: [] };
    }

    // 1. Search in Customer table
    const customers = await prisma.customer.findMany({
        where: {
            OR: [
                { name: { contains: query } },
                { phone: { contains: query } }
            ]
        },
        select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            balance: true,
            address: true,
            linkedEmployeeId: true
        },
        take: 10,
        orderBy: { updatedAt: 'desc' }
    });

    // 2. Search in Supplier table
    const suppliers = await prisma.supplier.findMany({
        where: {
            OR: [
                { name: { contains: query } },
                { phone: { contains: query } }
            ]
        },
        select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            balance: true,
            address: true,
            linkedEmployeeId: true
        },
        take: 5
    });

    const results = [
        ...customers.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email || undefined,
            address: c.address || undefined,
            balance: Number(c.balance),
            linkedEmployeeId: c.linkedEmployeeId || undefined,
            type: 'CUSTOMER' as const
        })),
        ...suppliers.map(s => ({
            id: s.id,
            name: s.name,
            phone: s.phone || '',
            email: s.email || undefined,
            address: s.address || undefined,
            balance: Number(s.balance),
            linkedEmployeeId: s.linkedEmployeeId || undefined,
            type: 'SUPPLIER' as const
        }))
    ];

    return {
        customers: results
    };
}, { permission: 'CUSTOMER_VIEW', requireCSRF: false });

/**
 * Create a new customer with name and phone
 */
export const createCustomer = secureAction(async ({ name, phone, address, linkedEmployeeId, openingBalance = 0 }: { name: string; phone: string; address?: string; linkedEmployeeId?: string | null; openingBalance?: number }) => {
    if (!name || name.trim().length < 2) {
        return { error: 'الاسم قصير جداً' };
    }

    try {
        // Optional: Ensure phone uniqueness if provided
        if (phone) {
            const existing = await prisma.customer.findUnique({
                where: { phone: phone.trim() }
            });

            if (existing) {
                return {
                    error: 'هذا الرقم مسجل مسبقاً',
                    customer: {
                        id: existing.id,
                        name: existing.name,
                        phone: existing.phone,
                        balance: Number(existing.balance)
                    }
                };
            }
        }

        const customer = await prisma.$transaction(async (tx) => {
            const c = await tx.customer.create({
                data: {
                    name: name.trim(),
                    phone: phone.trim(),
                    address: address?.trim() || null,
                    linkedEmployeeId: linkedEmployeeId || null,
                    balance: new Decimal(openingBalance)
                }
            });

            if (openingBalance && openingBalance !== 0) {
                // 1. Create opening transaction record - with auto journal
                const currentUser = await getCurrentUser();
                const transaction = await financialRepo.createCustomerTransaction(tx, {
                    customerId: c.id,
                    type: 'OPENING_BALANCE',
                    amount: openingBalance,
                    description: 'Initial Opening Balance',
                    branchId: currentUser?.branchId || null
                });
                await AccountingEngine.recordTransaction({
                    description: `Opening Balance: ${c.name}`,
                    reference: transaction.id,
                    branchId: currentUser?.branchId ?? undefined,
                    lines: [
                        { accountCode: '1100', debit: openingBalance, credit: 0, description: 'Initial Accounts Receivable' },
                        { accountCode: '3000', debit: 0, credit: openingBalance, description: 'Opening Balance Equity' }
                    ]
                }, tx);
            }

            return c;
        });

        return {
            customer: {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                address: customer.address || undefined,
                balance: Number(customer.balance)
            }
        };
    } catch (e: any) {
        console.error(e);
        return { error: 'حدث خطأ أثناء إضافة العميل' };
    }
}, { permission: 'CUSTOMER_MANAGE', requireCSRF: false });

/**
 * Get all customers with balances for Customer Accounts tab
 */
export const getCustomersWithBalance = secureAction(async (filters?: {
    search?: string;
    hasBalance?: boolean;
}) => {
    const where: any = {};

    if (filters?.search) {
        where.OR = [
            { name: { contains: filters.search } },
            { phone: { contains: filters.search } }
        ];
    }

    if (filters?.hasBalance) {
        where.NOT = { balance: 0 };
    }

    const customers = await prisma.customer.findMany({
        where,
        orderBy: [
            { updatedAt: 'desc' },
            { balance: 'desc' }
        ],
        include: {
            _count: {
                select: { transactions: true, sales: true }
            }
        },
        take: 100
    });

    return {
        customers: customers.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email || undefined,
            balance: Number(c.balance),
            creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
            transactionCount: c._count.transactions,
            saleCount: c._count.sales
        }))
    };
}, { permission: 'CUSTOMER_VIEW', requireCSRF: false });

/**
 * Update customer credit limit
 */
export const updateCustomerCreditLimit = secureAction(async (data: {
    customerId: string;
    creditLimit: number | null;
}) => {
    const { customerId, creditLimit } = data;

    const customer = await prisma.customer.update({
        where: { id: customerId },
        data: { creditLimit }
    });

    revalidatePath('/customers');

    return {
        success: true,
        customer: {
            id: customer.id,
            name: customer.name,
            creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null
        }
    };
}, { permission: 'CUSTOMER_MANAGE', requireCSRF: false });

/**
 * Get customer details with full history
 */
export const getCustomerDetails = secureAction(async (customerId: string) => {
    const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: {
            transactions: {
                orderBy: { createdAt: 'desc' },
                take: 50
            },
            sales: {
                orderBy: { createdAt: 'desc' },
                take: 50,
                include: {
                    items: {
                        include: { product: true }
                    }
                }
            }
        }
    });

    if (!customer) {
        const t = await getTranslations('SystemMessages.Errors');
        throw new Error(t('notFound'));
    }

    return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        balance: Number(customer.balance),
        creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
        transactions: customer.transactions.map(tx => ({
            ...tx,
            amount: Number(tx.amount)
        })),
        sales: customer.sales.map(s => ({
            id: s.id,
            totalAmount: Number(s.totalAmount),
            status: s.status,
            createdAt: s.createdAt,
            items: s.items.map(i => ({
                productName: i.product.name,
                quantity: i.quantity,
                unitPrice: Number(i.unitPrice)
            }))
        }))
    };
}, { permission: 'CUSTOMER_VIEW', requireCSRF: false });

/**
 * Record payment against customer balance (paying off debt)
 */
export const recordCustomerPayment = secureAction(async (data: {
    customerId: string;
    amount: number;
    paymentMethod: 'CASH' | 'VISA' | 'WALLET' | 'INSTAPAY';
    reference?: string;
}) => {
    const { customerId, amount, paymentMethod, reference } = data;
    const t = await getTranslations('SystemMessages.Errors');

    if (amount <= 0) {
        throw new Error('Payment amount must be greater than zero');
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error(t('unauthorized'));

    // Get current shift
    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error(t('shiftOpenError'));
    }

    // Atomic transaction for all updates
    const result = await prisma.$transaction(async (tx) => {
        // 1. Create CREDIT transaction (reduces what customer owes) - with auto journal
        const transaction = await financialRepo.createCustomerTransaction(tx, {
            customerId,
            type: 'CREDIT',
            amount,
            description: `Payment received - ${paymentMethod}`,
            reference,
            createdBy: currentUser.id,
            branchId: currentUser.branchId || null
        });

        // 2. Reduce customer balance
        const customer = await tx.customer.update({
            where: { id: customerId },
            data: {
                balance: { decrement: amount }
            }
        });

        // 3. Update shift totals
        const shiftUpdate: any = {};
        switch (paymentMethod) {
            case 'CASH':
                shiftUpdate.totalCashSales = { increment: amount };
                break;
            case 'VISA':
                shiftUpdate.totalCardSales = { increment: amount };
                break;
            case 'WALLET':
                shiftUpdate.totalWalletSales = { increment: amount };
                break;
            case 'INSTAPAY':
                shiftUpdate.totalInstapay = { increment: amount };
                break;
        }

        await tx.shift.update({
            where: { id: shiftResult.shift!.id },
            data: shiftUpdate
        });

        // 4. Treasury Integration
        let defaultTreasuryId: string | null = null;
        if (currentUser.branchId) {
            const defaultTreasury = await tx.treasury.findFirst({
                where: { branchId: currentUser.branchId, isDefault: true }
            });
            if (defaultTreasury) defaultTreasuryId = defaultTreasury.id;
        }

        await tx.transaction.create({
            data: {
                type: 'CUSTOMER_PAYMENT',
                amount: new Decimal(amount),
                paymentMethod: paymentMethod,
                description: `Customer Payment - ${customer.name} (Acct Credit)`,
                treasuryId: defaultTreasuryId
            }
        });

        // 5. Update Treasury Balance
        if (defaultTreasuryId) {
            await tx.treasury.update({
                where: { id: defaultTreasuryId },
                data: { balance: { increment: amount } }
            });
        }

        // 6. Accounting Engine Sync
        try {
            await AccountingEngine.recordTransaction({
                description: `Customer Payment: ${customer.name}`,
                reference: transaction.id,
                branchId: currentUser.branchId ?? undefined,
                lines: [
                    { accountCode: '1000', debit: amount, credit: 0, description: `Cash Received (${paymentMethod})` },
                    { accountCode: '1100', debit: 0, credit: amount, description: 'Customer AR Reduced' }
                ]
            }, tx);
        } catch (accError) {
            console.error('[Accounting Sync Error]:', accError);
        }

        return customer;
    });

    revalidatePath('/customers');

    return {
        success: true,
        newBalance: Number(result.balance),
        message: `Payment of ${amount} recorded successfully`
    };
}, { permission: 'CUSTOMER_MANAGE', requireCSRF: false });

/**
 * Get customer transaction history
 */
export const getCustomerTransactions = secureAction(async (customerId: string) => {
    const transactions = await prisma.customerTransaction.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 50
    });

    return {
        transactions: transactions.map(tx => ({
            ...tx,
            amount: Number(tx.amount)
        }))
    };
}, { permission: 'CUSTOMER_VIEW', requireCSRF: false });

/**
 * Get active employees list for selection in customer/supplier linking
 */
export const getEmployeesForLink = secureAction(async () => {
    try {
        const users = await prisma.user.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, username: true }
        });

        return {
            success: true,
            employees: users.map(u => ({ 
                id: u.id, 
                name: u.name || u.username 
            }))
        };
    } catch (e) {
        console.error(e);
        return { success: false, error: 'حدث خطأ أثناء جلب قائمة الموظفين' };
    }
}, { permission: 'CUSTOMER_VIEW', requireCSRF: false });

/**
 * Adjust customer or supplier balance manually (B42)
 */
export const adjustAccountBalance = secureAction(async (data: {
    entityId: string;
    entityType: 'CUSTOMER' | 'SUPPLIER';
    amount: number;
    type: 'FEE' | 'WRITE_OFF' | 'ADJUSTMENT';
    reason: string;
}) => {
    const { entityId, entityType, amount, type, reason } = data;
    const { getTranslations } = await import('@/lib/i18n-mock');
    const t = await getTranslations('SystemMessages.Errors');

    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error(t('unauthorized'));

    const result = await prisma.$transaction(async (tx) => {
        let name = '';
        const absAmount = Math.abs(amount);

        if (entityType === 'CUSTOMER') {
            const customer = await tx.customer.update({
                where: { id: entityId },
                data: { balance: { increment: amount } }
            });
            name = customer.name;

            // 1. Sub-ledger entry - with auto journal
            const transaction = await financialRepo.createCustomerTransaction(tx, {
                customerId: entityId,
                type: amount > 0 ? 'DEBIT' : 'CREDIT',
                amount: absAmount,
                description: `${type}: ${reason}`,
                createdBy: currentUser.id,
                branchId: currentUser.branchId || null,
                skipJournal: true // Skip auto-journal since we have manual GL entry below
            });

            // 2. GL Entry
            // Fee: DR 1100 (AR) / CR 4400 (Other Income)
            // Write-off: DR 5200 (Expense) / CR 1100 (AR)
            const lines = amount > 0 
                ? [
                    { accountCode: '1100', debit: absAmount, credit: 0, description: `Manual Fee: ${reason}` },
                    { accountCode: '4400', debit: 0, credit: absAmount, description: `Manual Fee: ${reason}` }
                  ]
                : [
                    { accountCode: '5200', debit: absAmount, credit: 0, description: `Manual Adjustment: ${reason}` },
                    { accountCode: '1100', debit: 0, credit: absAmount, description: `Manual Adjustment: ${reason}` }
                  ];

            await AccountingEngine.recordTransaction({
                description: `Manual Adjustment (${type}): ${name}`,
                reference: transaction.id,
                branchId: currentUser.branchId ?? undefined,
                lines
            }, tx);

        } else {
            const supplier = await tx.supplier.update({
                where: { id: entityId },
                data: { balance: { increment: amount } }
            });
            name = supplier.name;

            // 1. Sub-ledger entry (using SupplierPayment as a generic txn log) - with auto journal
            const payment = await financialRepo.createSupplierPayment(tx, {
                supplierId: entityId,
                amount: absAmount,
                method: 'ADJUSTMENT',
                notes: `${type}: ${reason}`,
                branchId: currentUser.branchId || null,
                skipJournal: true // Skip auto-journal since we have manual GL entry below
            });

            // 2. GL Entry
            // Increase Liability (Fee from supplier): DR 5200 (Expense) / CR 2000 (AP)
            // Decrease Liability (Credit from supplier): DR 2000 (AP) / CR 4400 (Other Income)
            const lines = amount > 0
                ? [
                    { accountCode: '5200', debit: absAmount, credit: 0, description: `Supplier Adjustment: ${reason}` },
                    { accountCode: '2000', debit: 0, credit: absAmount, description: `Supplier Adjustment: ${reason}` }
                  ]
                : [
                    { accountCode: '2000', debit: absAmount, credit: 0, description: `Supplier Credit: ${reason}` },
                    { accountCode: '4400', debit: 0, credit: absAmount, description: `Supplier Credit: ${reason}` }
                  ];

            await AccountingEngine.recordTransaction({
                description: `Manual Adjustment (${type}): ${name}`,
                reference: payment.id,
                branchId: currentUser.branchId ?? undefined,
                lines
            }, tx);
        }

        return { success: true, name };
    });

    revalidatePath(entityType === 'CUSTOMER' ? '/customers' : '/inventory');

    return result;
}, { permission: 'CUSTOMER_MANAGE', requireCSRF: false });
