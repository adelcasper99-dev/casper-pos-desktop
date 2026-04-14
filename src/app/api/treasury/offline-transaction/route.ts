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
            createdAt // 🆕 Extract original timestamp
        } = body;

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
                shiftId,
                categoryId,
                idempotencyKey,
                createdAt: createdAt ? new Date(createdAt) : undefined // 🆕 Use original time
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
