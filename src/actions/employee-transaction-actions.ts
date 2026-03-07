'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from './auth';
import { secureAction } from '@/lib/safe-action';
import { PERMISSIONS } from '@/lib/permissions';
import { Prisma } from '@prisma/client';

export type TransactionType = 'SALES_DEDUCTION' | 'MAINTENANCE_DEDUCTION' | 'MANUAL_DEDUCTION';

export const createEmployeeDeduction = secureAction(async (data: {
    userId: string;
    amount: number;
    type: TransactionType;
    referenceId?: string;
    referenceType?: string;
    description?: string;
}) => {
    const { userId, amount, type, referenceId, referenceType, description } = data;
    try {
        const transaction = await (prisma as any).employeeTransaction.create({
            data: {
                userId,
                amount: new Prisma.Decimal(amount), // Wrap in Decimal
                type,
                referenceId,
                referenceType,
                description
            }
        });

        revalidatePath(`/hq/employees/${userId}`);
        return { success: true, transaction };
    } catch (error) {
        console.error('Failed to create employee deduction:', error);
        return { success: false, error: 'Failed to record transaction' };
    }
}, { permission: PERMISSIONS.MANAGE_USERS });

export const getEmployeeTransactions = secureAction(async (userId: string) => {
    try {
        const transactions = await (prisma as any).employeeTransaction.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { name: true }
                }
            }
        });
        return {
            success: true, data: (transactions as any[]).map(t => ({
                ...t,
                amount: Number(t.amount)
            }))
        };
    } catch (error) {
        console.error('Failed to fetch employee transactions:', error);
        return { success: false, error: 'Failed to fetch transactions' };
    }
}, { permission: PERMISSIONS.MANAGE_USERS });

export const searchEmployeeByPhone = secureAction(async (phone: string) => {
    if (!phone || phone.length < 3) return { success: true, data: null };

    try {
        const user = await prisma.user.findFirst({
            where: {
                phone: {
                    contains: phone
                }
            },
            select: {
                id: true,
                name: true,
                phone: true,
                roleStr: true
            }
        });

        return { success: true, data: user };
    } catch (error) {
        console.error('Failed to search employee by phone:', error);
        return { success: false, error: 'Search failed' };
    }
}, { permission: PERMISSIONS.TICKET_PAY });
