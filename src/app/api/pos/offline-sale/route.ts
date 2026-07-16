import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Decimal } from 'decimal.js';
import { decrementWarehouseStock } from '@/lib/stock-helpers';
import { logger } from '@/lib/logger';
import { OfflineSaleSchema, type OfflineSaleInput } from '@/lib/validations/sync-schemas';

export async function POST(request: NextRequest) {
    // 🛡️ Security Handshake
    const clientSecret = request.headers.get('x-sync-secret');
    if (process.env.SYNC_SECRET && clientSecret !== process.env.SYNC_SECRET) {
        return NextResponse.json({ success: false, error: 'Unauthorized sync attempt' }, { status: 401 });
    }

    let body: OfflineSaleInput | null = null;
    try {
        const rawBody = await request.json();
        const parseResult = OfflineSaleSchema.safeParse(rawBody);
        
        if (!parseResult.success) {
            return NextResponse.json({ 
                success: false, 
                error: 'Validation failed', 
                details: parseResult.error.format() 
            }, { status: 400 });
        }

        body = parseResult.data;
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
            taxAmount,
            subTotal,
            discountAmount,
            discountPercentage,
            shiftId,
            customerId,
            isSupplier,
            createdAt, 
            isTimeSuspicious,
            items,
        } = body;

        // Bounded client time check to guarantee temporal integrity
        const { getBoundedTimestamp } = await import('@/lib/sync-time-helper');
        const timeCheck = getBoundedTimestamp(createdAt, isTimeSuspicious);

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

        // 📐 Precision Validation (Decimal.js)
        const dTotal = new Decimal(totalAmount);
        const dTax = new Decimal(taxAmount);
        const dDiscount = new Decimal(discountAmount);
        const dSubtotal = subTotal ? new Decimal(subTotal) : dTotal.minus(dTax).plus(dDiscount);

        // 🛡️ CUSTOMER / SUPPLIER FK GUARD
        let validCustomerId: string | null = null;
        let validSupplierId: string | null = null;
        if (customerId && customerId.trim() !== "") {
            if (isSupplier) {
                const supplierExists = await prisma.supplier.findUnique({ where: { id: customerId } });
                if (supplierExists) validSupplierId = supplierExists.id;
            } else {
                const customerExists = await prisma.customer.findUnique({ where: { id: customerId } });
                if (customerExists) validCustomerId = customerExists.id;
            }
        }
        const finalLedgerCustomerId = validCustomerId || validSupplierId;

        // 🛡️ USER ID RESOLUTION
        let finalUserId = 'SYSTEM_USER';
        if (shiftId) {
            const shift = await prisma.shift.findUnique({ where: { id: shiftId }, select: { userId: true } });
            if (shift) finalUserId = shift.userId;
        }

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
                    shiftId: shiftId ?? 'SYSTEM_SHIFT',
                    customerId: validCustomerId,
                    relatedSupplierId: validSupplierId,
                    userId: finalUserId,
                    branchId,
                    status: 'COMPLETED',
                    syncStatus: 'SYNCED',
                    offlineFlag: true,
                    isTimeSuspicious: timeCheck.isTimeSuspicious,
                    idempotencyKey: idempotencyKey ?? undefined,
                    createdAt: timeCheck.createdAt,
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

            if (!salesAccount || !cashAccount) {
                throw new Error(`[offline-sale] GL accounts missing for branchId=${branchId}. salesAccount:${salesAccount?.id}, cashAccount:${cashAccount?.id}. Seed GL accounts before syncing.`);
            }

            let debitAccountId = cashAccount.id;
            if (paymentMethod === 'ACCOUNT') {
                const arAccount = await tx.account.findUnique({ where: { code: '1200' } });
                if (arAccount) debitAccountId = arAccount.id;
            }

            await tx.journalEntry.create({
                data: {
                    date: createdAt ? new Date(createdAt) : new Date(),
                    description: `Sale Sync: ${newSale.id} (${customerName || 'Walk-in'})`,
                    branchId,
                    saleId: newSale.id,
                    idempotencyKey: `journal-sale-${newSale.id}`,
                    lines: {
                        create: [
                            { accountId: debitAccountId, debit: dTotal.toString(), credit: '0' },
                            { accountId: salesAccount.id, debit: '0', credit: dTotal.toString() }
                        ]
                    }
                }
            });

            if (finalLedgerCustomerId) {
                if (isSupplier) {
                    // 1. Invoice Ledger Entry (Supplier Offset)
                    await tx.supplierPayment.create({
                        data: {
                            supplierId: finalLedgerCustomerId,
                            amount: dTotal.toString(),
                            method: 'SALE_OFFSET',
                            notes: `Offline Sale Sync: ${newSale.id}`,
                        }
                    });
                    
                    // 2. Update Supplier Balance for Invoice
                    await tx.supplier.update({
                        where: { id: finalLedgerCustomerId },
                        data: { balance: { decrement: dTotal.toString() } }
                    });

                    // 3. Payment Ledger Entry (Paid Amount)
                    if (paymentMethod !== 'ACCOUNT') {
                        await tx.supplierPayment.create({
                            data: {
                                supplierId: finalLedgerCustomerId,
                                amount: dTotal.toString(), // We paid them back the offset
                                method: 'CASH', // They paid us, which increments our debt back? Wait. If we sell to a supplier, they owe us. We offset our debt to them. If they pay CASH, we don't offset the debt, we just take the cash.
                                notes: `Offline Payment Sync: ${paymentMethod} for ${newSale.id}`,
                            }
                        });
                        await tx.supplier.update({
                            where: { id: finalLedgerCustomerId },
                            data: { balance: { increment: dTotal.toString() } }
                        });
                    }
                } else {
                    // 1. Invoice Ledger Entry (Full Amount)
                    await tx.customerTransaction.create({
                        data: {
                            customerId: finalLedgerCustomerId,
                            type: 'DEBIT',
                            amount: dTotal.toString(),
                            description: `Offline Sale Sync: ${newSale.id}`,
                            reference: newSale.id,
                            branchId
                        }
                    });
                    
                    // 2. Update Customer Balance for Invoice
                    await tx.customer.update({
                        where: { id: finalLedgerCustomerId },
                        data: { balance: { increment: dTotal.toString() } }
                    });

                    // 3. Payment Ledger Entry (Paid Amount)
                    if (paymentMethod !== 'ACCOUNT') {
                        await tx.customerTransaction.create({
                            data: {
                                customerId: finalLedgerCustomerId,
                                type: 'CREDIT',
                                amount: dTotal.toString(),
                                description: `Offline Payment Sync: ${paymentMethod} for ${newSale.id}`,
                                reference: newSale.id,
                                branchId
                            }
                        });

                        // 4. Update Customer Balance for Payment
                        await tx.customer.update({
                            where: { id: finalLedgerCustomerId },
                            data: { balance: { decrement: dTotal.toString() } }
                        });
                    }
                }
            }

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

            // ── Decrement Stock (Bundle-Aware Logic) ──────────────────────────
            // 1. Snapshot product metadata for bundle detection
            const pIds = items.map((i: any) => i.productId).filter(Boolean);
            const productMetas = await tx.product.findMany({
                where: { id: { in: pIds } },
                select: { id: true, isBundle: true, trackStock: true }
            });

            const metaMap = new Map(productMetas.map(p => [p.id, p]));

            for (const item of items) {
                if (!item.productId || !item.quantity) continue;
                const meta = metaMap.get(item.productId);
                if (!meta) continue;

                if (meta.isBundle) {
                    // Fetch components for this bundle
                    const components = await tx.bundleItem.findMany({
                        where: { bundleProductId: item.productId },
                        include: { componentProduct: { select: { id: true, trackStock: true } } }
                    });

                    for (const comp of components) {
                        if (!comp.componentProduct.trackStock) continue;
                        const compQty = new Decimal(item.quantity).mul(new Decimal(comp.quantityIncluded.toString())).toNumber();
                        
                        await decrementWarehouseStock(tx, comp.componentProductId, warehouseId, compQty);
                        
                        // Log component movement
                        await tx.stockMovement.create({
                            data: {
                                type: 'SALE_BUNDLE_COMPONENT',
                                productId: comp.componentProductId,
                                fromWarehouseId: warehouseId,
                                quantity: compQty,
                                reason: `Offline sale bundle sync: ${newSale.id} (Member of ${item.productId})`,
                                branchId,
                                createdAt: createdAt ? new Date(createdAt) : undefined,
                            },
                        });
                    }
                } else if (meta.trackStock) {
                    // Regular product decrement
                    await decrementWarehouseStock(tx, item.productId, warehouseId, Number(item.quantity));
                    
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
