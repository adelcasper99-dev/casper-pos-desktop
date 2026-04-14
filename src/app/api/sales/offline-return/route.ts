import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Decimal } from 'decimal.js';

export async function POST(request: NextRequest) {
    // 🛡️ Security Handshake
    const clientSecret = request.headers.get('x-sync-secret');
    if (process.env.SYNC_SECRET && clientSecret !== process.env.SYNC_SECRET) {
        return NextResponse.json({ success: false, error: 'Unauthorized sync attempt' }, { status: 401 });
    }

    let body: any = null;
    try {
        body = await request.json();
        const {
            id,
            idempotencyKey,
            originalSaleId,
            returnType = 'CASH',
            amount,
            reason,
            items = [],
            customerPhone,
            warehouseId,
            shiftId,
            branchId,
            createdAt
        } = body;

        if (!originalSaleId || !amount) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: originalSaleId, amount' },
                { status: 400 }
            );
        }

        // ── Idempotency Guard ──────────────────────────────────────────────────
        if (idempotencyKey || id) {
            const existing = idempotencyKey 
                ? await prisma.sale.findUnique({ where: { idempotencyKey } })
                : await prisma.sale.findUnique({ where: { id } });

            if (existing) {
                return NextResponse.json({
                    success: true,
                    existing: true,
                    id: existing.id,
                    message: 'Return already processed',
                });
            }
        }

        const dAmount = new Decimal(amount);

        const originalSale = await prisma.sale.findUnique({
            where: { id: originalSaleId },
            select: { warehouseId: true, shiftId: true, customerId: true, branchId: true },
        });

        if (!originalSale) {
            return NextResponse.json({ success: false, error: `Original sale ${originalSaleId} not found` }, { status: 404 });
        }

        const resolvedWarehouseId = warehouseId ?? originalSale.warehouseId;
        const resolvedBranchId = branchId ?? originalSale.branchId;

        const returnSale = await prisma.$transaction(async (tx) => {
            // 1. Create the return sale record
            const refundSale = await tx.sale.create({
                data: {
                    ...(id ? { id } : {}),
                    customerPhone: customerPhone ?? undefined,
                    warehouseId: resolvedWarehouseId,
                    branchId: resolvedBranchId,
                    totalAmount: dAmount.abs().negated().toString(),
                    paymentMethod: returnType,
                    status: 'REFUNDED',
                    refundReason: reason,
                    isReturn: true,
                    parentId: originalSaleId,
                    shiftId: shiftId ?? originalSale.shiftId ?? undefined,
                    customerId: originalSale.customerId ?? undefined,
                    syncStatus: 'SYNCED',
                    offlineFlag: true,
                    idempotencyKey: idempotencyKey ?? undefined,
                    createdAt: createdAt ? new Date(createdAt) : undefined,
                    items: {
                        create: items.map((item: any) => ({
                            productId: item.productId,
                            quantity: -Math.abs(item.quantity),
                            unitPrice: new Decimal(item.unitPrice).toString(),
                            unitCost: new Decimal(item.unitCost ?? 0).toString(),
                        })),
                    },
                },
            });

            // 2. Double-Entry Bookkeeping Reversal
            const salesAccount = await tx.account.findUnique({ where: { code: '4000' } });
            const treasury = await tx.treasury.findFirst({ 
                where: { branchId: resolvedBranchId, paymentMethod: returnType === 'CASH' ? 'CASH' : undefined } 
            });
            const cashAccount = await tx.account.findUnique({ where: { code: treasury?.glCode || '1000' } });

            if (salesAccount && cashAccount) {
                await tx.journalEntry.create({
                    data: {
                        date: createdAt ? new Date(createdAt) : new Date(),
                        description: `Return Sync: ${refundSale.id} (Original: ${originalSaleId})`,
                        branchId: resolvedBranchId,
                        saleId: refundSale.id,
                        idempotencyKey: `journal-return-${refundSale.id}`,
                        lines: {
                            create: [
                                { accountId: salesAccount.id, debit: dAmount.abs().toString(), credit: '0' },
                                { accountId: cashAccount.id, debit: '0', credit: dAmount.abs().toString() }
                            ]
                        }
                    }
                });
            }

            // 3. Increment Stock
            for (const item of items) {
                if (!item.productId || !item.quantity) continue;
                await tx.stock.updateMany({
                    where: { productId: item.productId, warehouseId: resolvedWarehouseId },
                    data: { quantity: { increment: Math.abs(item.quantity) } },
                });
                await tx.stockMovement.create({
                    data: {
                        type: 'RETURN',
                        productId: item.productId,
                        toWarehouseId: resolvedWarehouseId,
                        quantity: Math.abs(item.quantity),
                        reason: `Offline return sync: ${refundSale.id} (original: ${originalSaleId})`,
                        branchId: resolvedBranchId,
                        createdAt: createdAt ? new Date(createdAt) : undefined,
                    },
                });
            }

            // 4. Update Original Sale Status
            await tx.sale.update({
                where: { id: originalSaleId },
                data: { status: 'REFUNDED' },
            });

            return refundSale;
        }, { timeout: 30000 });

        return NextResponse.json({ success: true, id: returnSale.id, existing: false });
    } catch (error: any) {
        if ((error.code === 'P2002' || error.code === 'P2028')) {
            const { idempotencyKey, id } = body || {};
            if (idempotencyKey || id) {
                let existing = await prisma.sale.findUnique({ 
                    where: idempotencyKey ? { idempotencyKey } : { id } 
                });
                if (!existing) {
                    await new Promise(r => setTimeout(r, 100));
                    existing = await prisma.sale.findUnique({ 
                        where: idempotencyKey ? { idempotencyKey } : { id } 
                    });
                }
                if (existing) {
                    return NextResponse.json({
                        success: true,
                        existing: true,
                        id: existing.id,
                        message: 'Return already processed (Recovered from race)',
                    });
                }
            }
        }
        console.error('[offline-return] failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
