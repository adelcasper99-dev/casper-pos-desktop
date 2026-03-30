'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from './auth';
import { secureAction } from '@/lib/safe-action';
import { PERMISSIONS } from '@/lib/permissions';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

export type TransactionType = 'SALES_DEDUCTION' | 'MAINTENANCE_DEDUCTION' | 'MANUAL_DEDUCTION';

const CreateDeductionSchema = z.object({
    userId: z.string().uuid('معرّف المستخدم غير صالح'),
    amount: z.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
    type: z.enum(['SALES_DEDUCTION', 'MAINTENANCE_DEDUCTION', 'MANUAL_DEDUCTION'] as const, {
        message: 'نوع المعاملة غير صالح'
    }),
    referenceId: z.string().uuid('معرّف المرجع غير صالح').optional().or(z.literal('')),
    referenceType: z.string().optional(),
    description: z.string().optional(),
});

export const createEmployeeDeduction = secureAction(async (data: z.infer<typeof CreateDeductionSchema>) => {
    const validated = CreateDeductionSchema.parse(data);
    const { userId, amount, type, referenceId, referenceType, description } = validated;
    
    try {
        const transaction = await (prisma as any).employeeTransaction.create({
            data: {
                userId,
                amount: new Prisma.Decimal(amount),
                type,
                referenceId: referenceId || undefined,
                referenceType,
                description: description || undefined,
                branchId: (await getCurrentUser())?.branchId || null
            } as any
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
