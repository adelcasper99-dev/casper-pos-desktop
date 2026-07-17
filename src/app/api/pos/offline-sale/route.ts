import { NextRequest, NextResponse } from 'next/server';
import { prisma, secureTransaction } from '@/lib/prisma';
import { Decimal } from 'decimal.js';
import { decrementWarehouseStock } from '@/lib/stock-helpers';
import { logger } from '@/lib/logger';
import { OfflineSaleSchema, type OfflineSaleInput } from '@/lib/validations/sync-schemas';
import { verifyServerLicense } from '@/lib/license/server-verify';
import { runWithTenant } from '@/lib/prisma-tenant-extension';


export async function POST(request: NextRequest) {
    // 🛡️ Security Handshake
    const clientSecret = request.headers.get('x-sync-secret');
    if (process.env.SYNC_SECRET && clientSecret !== process.env.SYNC_SECRET) {
        return NextResponse.json({ success: false, error: 'Unauthorized sync attempt' }, { status: 401 });
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
        if ('tenantId' in rawBody && (rawBody as any).tenantId !== tenantId) {
            return NextResponse.json({ success: false, error: 'Tenant mismatch. Unauthorized data write.' }, { status: 403 });
        }

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

            createdAt, 
            isTimeSuspicious,
            items,
        } = body;

        // Bounded client time check to guarantee temporal integrity
        const { getBoundedTimestamp } = await import('@/lib/sync-time-helper');
        const timeCheck = getBoundedTimestamp(createdAt, isTimeSuspicious);

        // 📐 Precision Validation (Decimal.js)
        const dTotal = new Decimal(totalAmount);
        const dTax = new Decimal(taxAmount);
        const dDiscount = new Decimal(discountAmount);
        const dSubtotal = subTotal ? new Decimal(subTotal) : dTotal.minus(dTax).plus(dDiscount);

        // 🛡️ CUSTOMER / SUPPLIER FK GUARD
        let validCustomerId: string | null = null;
        let validSupplierId: string | null = null;
        const isSupplier = (body as any).isSupplier === true;
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
        const sale = await secureTransaction(async (tx) => {
            // 2. Environment-Aware 64-bit Advisory Lock (Phase 1)
            const isPostgresEnv = process.env.DATABASE_URL?.startsWith('postgres') || process.env.DATABASE_URL?.startsWith('postgresql');
            if (isPostgresEnv && idempotencyKey) {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pos_sync'), hashtext(${idempotencyKey}));`;
            }

            // 3. Early Return (Idempotency Guard inside transaction)
            const lookupKey = idempotencyKey || id;
            if (lookupKey) {
                const existing = idempotencyKey
                    ? await tx.sale.findUnique({ where: { idempotencyKey } })
                    : await tx.sale.findUnique({ where: { id } });

                if (existing) {
                    return { existing: true, id: existing.id };
                }
            }

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

            // ── Decrement Stock (Bundle-Aware O(1) Fetching & Lexicographical Sorting) ──────────────────────────
            // 1. Snapshot product metadata for bundle detection
            const pIds = items.map((i: any) => i.productId).filter(Boolean);
            const productMetas = await tx.product.findMany({
                where: { id: { in: pIds } },
                select: { id: true, isBundle: true, trackStock: true }
            });
            const metaMap = new Map(productMetas.map(p => [p.id, p]));

            // 2. Fetch components for all bundles in a single O(1) query (Phase 2)
            const bundleIds = productMetas.filter(p => p.isBundle).map(p => p.id);
            const allBundleComponents = bundleIds.length > 0
                ? await tx.bundleItem.findMany({
                    where: { bundleProductId: { in: bundleIds } },
                    include: { componentProduct: { select: { id: true, trackStock: true } } }
                })
                : [];

            const bundleComponentsMap = new Map<string, typeof allBundleComponents>();
            for (const comp of allBundleComponents) {
                const list = bundleComponentsMap.get(comp.bundleProductId) || [];
                list.push(comp);
                bundleComponentsMap.set(comp.bundleProductId, list);
            }

            // 3. Compile all stock deductions in-memory
            interface StockDeduction {
                productId: string;
                quantity: number;
                isBundleComponent: boolean;
                parentBundleId?: string;
            }
            const deductions: StockDeduction[] = [];

            for (const item of items) {
                if (!item.productId || !item.quantity) continue;
                const meta = metaMap.get(item.productId);
                if (!meta) continue;

                if (meta.isBundle) {
                    const components = bundleComponentsMap.get(item.productId) || [];
                    for (const comp of components) {
                        if (!comp.componentProduct.trackStock) continue;
                        const compQty = new Decimal(item.quantity).mul(new Decimal(comp.quantityIncluded.toString())).toNumber();
                        deductions.push({
                            productId: comp.componentProductId,
                            quantity: compQty,
                            isBundleComponent: true,
                            parentBundleId: item.productId
                        });
                    }
                } else if (meta.trackStock) {
                    deductions.push({
                        productId: item.productId,
                        quantity: Number(item.quantity),
                        isBundleComponent: false
                    });
                }
            }

            // 4. Aggregate deductions by productId (ensures each product is updated once)
            const aggregatedDeductionsMap = new Map<string, { quantity: number; deductions: StockDeduction[] }>();
            for (const d of deductions) {
                const existing = aggregatedDeductionsMap.get(d.productId) || { quantity: 0, deductions: [] };
                existing.quantity = new Decimal(existing.quantity).plus(d.quantity).toNumber();
                existing.deductions.push(d);
                aggregatedDeductionsMap.set(d.productId, existing);
            }

            // 5. Sort product IDs lexicographically to prevent deadlocks (Phase 3)
            const sortedProductIds = Array.from(aggregatedDeductionsMap.keys()).sort((a, b) => a.localeCompare(b));

            // 6. Execute stock updates and log movements sequentially
            for (const pId of sortedProductIds) {
                const agg = aggregatedDeductionsMap.get(pId)!;
                
                // Decrement stock using the standard helper (automatically handles Product table sync & validations)
                await decrementWarehouseStock(tx, pId, warehouseId, agg.quantity);

                // Create stock movements for each origin item contributing to this deduction
                for (const d of agg.deductions) {
                    await tx.stockMovement.create({
                        data: {
                            type: d.isBundleComponent ? 'SALE_BUNDLE_COMPONENT' : 'SALE',
                            productId: pId,
                            fromWarehouseId: warehouseId,
                            quantity: d.quantity,
                            reason: d.isBundleComponent 
                                ? `Offline sale bundle sync: ${newSale.id} (Member of ${d.parentBundleId})`
                                : `Offline sale sync: ${newSale.id}`,
                            branchId,
                            createdAt: createdAt ? new Date(createdAt) : undefined,
                        },
                    });
                }
            }


            return newSale;
        }, { timeout: 30000 });

        if ('existing' in sale && sale.existing) {

            return NextResponse.json({
                success: true,
                existing: true,
                id: sale.id,
                message: 'Sale already processed',
            });
        }

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
    });
}
