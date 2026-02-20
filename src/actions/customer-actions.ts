"use server";

import { prisma } from '@/lib/prisma';
import { secureAction } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { Decimal } from '@prisma/client/runtime/library';
import { getTranslations } from '@/lib/i18n-mock';
import { getCurrentUser } from './auth';
import { getCurrentShiftInternal } from './shift-management-actions';
import { AccountingEngine } from '@/lib/accounting/transaction-factory';


/**
 * Search for existing customers by name or phone
 * Returns customers from the Customer table with their actual UUIDs
 */
export const searchCustomers = secureAction(async (query: string) => {
    if (!query || query.length < 2) {
        return { customers: [] };
    }

    // First, try to find in the Customer table (preferred source)
    const existingCustomers = await prisma.customer.findMany({
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
            balance: true
        },
        take: 10,
        orderBy: { updatedAt: 'desc' }
    });

    if (existingCustomers.length > 0) {
        return {
            customers: existingCustomers.map(c => ({
                id: c.id, // Real UUID from Customer table
                name: c.name,
                phone: c.phone,
                email: c.email || undefined, // Convert null to undefined
                balance: Number(c.balance) // Serialize Decimal to number
            }))
        };
    }

    return {
        customers: []
    };
}, { permission: 'CUSTOMER_VIEW', requireCSRF: false });

/**
 * Create a new customer with name and phone
 */
export const createCustomer = secureAction(async ({ name, phone }: { name: string; phone: string }) => {
    if (!name || name.trim().length < 2) {
        return { error: 'الاسم قصير جداً' };
    }
    if (!phone || phone.trim().length < 7) {
        return { error: 'رقم الهاتف غير صحيح' };
    }

    // Check if phone already exists
    const existing = await prisma.customer.findFirst({
        where: { phone: phone.trim() }
    });
    if (existing) {
        return {
            error: 'يوجد عميل بنفس رقم الهاتف',
            customer: {
                id: existing.id,
                name: existing.name,
                phone: existing.phone,
                balance: Number(existing.balance)
            }
        };
    }

    const customer = await prisma.customer.create({
        data: {
            name: name.trim(),
            phone: phone.trim(),
        }
    });

    return {
        customer: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            balance: Number(customer.balance)
        }
    };
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
        // 1. Create CREDIT transaction (reduces what customer owes)
        const transaction = await tx.customerTransaction.create({
            data: {
                customerId,
                type: 'CREDIT',
                amount,
                description: `Payment received - ${paymentMethod}`,
                reference,
                createdBy: currentUser.id
            }
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
                lines: [
                    { accountCode: '1000', debit: amount, credit: 0, description: `Cash Received (${paymentMethod})` },
                    { accountCode: '1200', debit: 0, credit: amount, description: 'Customer AR Reduced' }
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
