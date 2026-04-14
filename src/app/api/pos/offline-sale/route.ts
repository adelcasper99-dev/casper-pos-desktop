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
            customerName,
            customerPhone,
            customerAddress,
            warehouseId,
            branchId,
            totalAmount,
            paymentMethod,
            taxAmount = 0,
            subTotal,
            discountAmount = 0,
            discountPercentage = 0,
            shiftId,
            customerId,
            createdAt, 
            items = [],
        } = body;

        // ── Idempotency Guard ──────────────────────────────────────────────────
        const lookupKey = idempotencyKey || id;
        if (lookupKey) {
            const existing = idempotencyKey
                ? await prisma.sale.findUnique({ where: { idempotencyKey } })
                : await prisma.sale.findUnique({ where: { id } });

            if (existing) {
                return NextResponse.json({
                    success: true,
                    existing: true,
                    id: existing.id,
                    message: 'Sale already processed',
                });
            }
        }

        if (!warehouseId || !totalAmount || !paymentMethod) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: warehouseId, totalAmount, paymentMethod' },
                { status: 400 }
            );
        }

        // 📐 Precision Validation (Decimal.js)
        const dTotal = new Decimal(totalAmount);
        const dTax = new Decimal(taxAmount);
        const dDiscount = new Decimal(discountAmount);
        const dSubtotal = subTotal ? new Decimal(subTotal) : dTotal.minus(dTax).plus(dDiscount);

        // ── Atomic Sale Creation & Ledger ──────────────────────────────────────
        const sale = await prisma.$transaction(async (tx) => {
            const newSale = await tx.sale.create({
                data: {
                    ...(id ? { id } : {}),
                    customerName,
                    customerPhone,
                    customerAddress,
                    warehouseId,
                    totalAmount: dTotal.toString(),
                    paymentMethod,
                    taxAmount: dTax.toString(),
                    subTotal: dSubtotal.toString(),
                    discountAmount: dDiscount.toString(),
                    discountPercentage: discountPercentage,
                    shiftId,
                    customerId,
                    branchId,
                    status: 'COMPLETED',
                    syncStatus: 'SYNCED',
                    offlineFlag: true,
                    idempotencyKey: idempotencyKey ?? undefined,
                    createdAt: createdAt ? new Date(createdAt) : undefined,
                    items: {
                        create: items.map((item: any) => ({
                            productId: item.productId,
                            quantity: item.quantity,
                            unitPrice: new Decimal(item.unitPrice).toString(),
                            unitCost: new Decimal(item.unitCost ?? 0).toString(),
                            imei: item.imei ?? undefined,
                            condition: item.condition ?? undefined,
                            color: item.color ?? undefined,
                            deviceType: item.deviceType ?? undefined,
                        })),
                    },
                },
            });

            // ── Double-Entry Bookkeeping ──────────────────────────────────────
            // 1. Resolve Accounts
            const salesAccount = await tx.account.findUnique({ where: { code: '4000' } }); // Revenue
            const treasury = await tx.treasury.findFirst({ 
                where: { branchId, paymentMethod: paymentMethod === 'CASH' ? 'CASH' : undefined } 
            });
            const cashAccount = await tx.account.findUnique({ where: { code: treasury?.glCode || '1000' } });

            if (salesAccount && cashAccount) {
                await tx.journalEntry.create({
                    data: {
                        date: createdAt ? new Date(createdAt) : new Date(),
                        description: `Sale Sync: ${newSale.id} (${customerName || 'Walk-in'})`,
                        branchId,
                        saleId: newSale.id,
                        idempotencyKey: `journal-sale-${newSale.id}`,
                        lines: {
                            create: [
                                { accountId: cashAccount.id, debit: dTotal.toString(), credit: '0' },
                                { accountId: salesAccount.id, debit: '0', credit: dTotal.toString() }
                            ]
                        }
                    }
                });
            }

            // ── Decrement Stock ────────────────────────────────────────────────
            for (const item of items) {
                if (!item.productId || !item.quantity) continue;
                await tx.stock.updateMany({
                    where: { productId: item.productId, warehouseId },
                    data: { quantity: { decrement: item.quantity } },
                });
                await tx.stockMovement.create({
                    data: {
                        type: 'SALE',
                        productId: item.productId,
                        fromWarehouseId: warehouseId,
                        quantity: item.quantity,
                        reason: `Offline sale sync: ${newSale.id}`,
                        branchId,
                        createdAt: createdAt ? new Date(createdAt) : undefined,
                    },
                });
            }

            return newSale;
        }, { timeout: 30000 });

        return NextResponse.json({ success: true, id: sale.id, existing: false });
    } catch (error: any) {
        // 🛡️ Rescue from Idempotency Race
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
                        message: 'Sale already processed (Recovered from race)',
                    });
                }
            }
        }
        console.error('[offline-sale] failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
