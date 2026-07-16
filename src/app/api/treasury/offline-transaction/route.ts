import { NextRequest, NextResponse } from 'next/server';
import { prisma, secureTransaction } from '@/lib/prisma';
import { verifyServerLicense } from '@/lib/license/server-verify';
import { runWithTenant } from '@/lib/prisma-tenant-extension';

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

        const licenseJwt = request.headers.get('x-license-jwt');
        const licenseCheck = verifyServerLicense(licenseJwt);
        if (!licenseCheck.valid && licenseCheck.response) {
            return licenseCheck.response;
        }

        const tenantId = licenseCheck.tenantId;
        if (!tenantId) {
            return NextResponse.json({ success: false, error: 'Invalid tenant context in license' }, { status: 400 });
        }

        return await runWithTenant(tenantId, async () => {
            const body = await request.json();
            if (body.tenantId && body.tenantId !== tenantId) {
                return NextResponse.json({ success: false, error: 'Tenant mismatch. Unauthorized data write.' }, { status: 403 });
            }

            const {
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

            const transaction = await secureTransaction(async (tx) => {
                const newTransaction = await tx.transaction.create({
                    data: {
                        type,
                        amount,
                        description,
                        paymentMethod,
                        treasuryId,
                        shiftId,
                        categoryId,
                        idempotencyKey,
                        isTimeSuspicious: isTimeSuspicious || false,
                        createdAt: createdAt ? new Date(createdAt) : undefined
                    }
                });

                if (treasuryId) {
                    const isPositive = ['IN', 'CAPITAL', 'SALE', 'TICKET', 'CUSTOMER_PAYMENT'].includes(type);
                    await tx.treasury.update({
                        where: { id: treasuryId },
                        data: {
                            balance: isPositive
                                ? { increment: amount }
                                : { decrement: amount }
                        }
                    });
                }
                
                return newTransaction;
            });

            return NextResponse.json({
                success: true,
                id: transaction.id,
                existing: false
            });
        });
    } catch (error: any) {
        console.error('Offline treasury transaction failed', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
