import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            type,
            amount,
            description,
            paymentMethod,
            treasuryId,
            shiftId,
            categoryId,
            idempotencyKey,
            isTimeSuspicious,
            createdAt
        } = body;

        // Bounded client time check to guarantee temporal integrity
        const { getBoundedTimestamp } = await import('@/lib/sync-time-helper');
        const timeCheck = getBoundedTimestamp(createdAt, isTimeSuspicious);

        if (idempotencyKey) {
            const existing = await prisma.transaction.findUnique({
                where: { idempotencyKey }
            });

            if (existing) {
                return NextResponse.json({
                    success: true,
                    existing: true,
                    id: existing.id,
                    message: 'Transaction already processed'
                });
            }
        }

        const transaction = await prisma.transaction.create({
            data: {
                type,
                amount,
                description,
                paymentMethod,
                treasuryId,
                shiftId: shiftId ?? 'SYSTEM_SHIFT',
                categoryId,
                idempotencyKey,
                isTimeSuspicious: timeCheck.isTimeSuspicious,
                createdAt: timeCheck.createdAt
            }
        });

        if (treasuryId) {
            const isPositive = ['IN', 'CAPITAL', 'SALE', 'TICKET', 'CUSTOMER_PAYMENT'].includes(type);
            await prisma.treasury.update({
                where: { id: treasuryId },
                data: {
                    balance: isPositive
                        ? { increment: amount }
                        : { decrement: amount }
                }
            });
        }

        return NextResponse.json({
            success: true,
            id: transaction.id,
            existing: false
        });
    } catch (error: any) {
        console.error('Offline treasury transaction failed', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
