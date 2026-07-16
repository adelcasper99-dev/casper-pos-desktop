import { NextRequest, NextResponse } from 'next/server';
import { prisma, secureTransaction } from '@/lib/prisma';
import { Decimal } from 'decimal.js';
import { OfflineReturnSchema, type OfflineReturnInput } from '@/lib/validations/sync-schemas';
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
        let body: OfflineReturnInput | null = null;
        try {
            const rawBody = await request.json();
            const parseResult = OfflineReturnSchema.safeParse(rawBody);

            if (!parseResult.success) {
                return NextResponse.json({ 
                    success: false, 
                    error: 'Validation failed', 
                    details: parseResult.error.format() 
                }, { status: 400 });
            }

            body = parseResult.data;
            if ('tenantId' in body && (body as any).tenantId !== tenantId) {
                return NextResponse.json({ success: false, error: 'Tenant mismatch. Unauthorized data write.' }, { status: 403 });
            }
            const {
            id,
            idempotencyKey,
            originalSaleId,
            returnType,
            amount,
            reason,
            items,
            customerPhone,
            warehouseId,
            shiftId,
            branchId,
            createdAt,
        } = body;
        
        const isTimeSuspicious = 'isTimeSuspicious' in body ? (body as any).isTimeSuspicious === true : false;

        // Bounded client time check to guarantee temporal integrity
        const { getBoundedTimestamp } = await import('@/lib/sync-time-helper');
        const timeCheck = getBoundedTimestamp(createdAt, isTimeSuspicious);

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
            select: { warehouseId: true, shiftId: true, customerId: true, branchId: true, taxAmount: true, totalAmount: true, userId: true },
        });

        if (!originalSale) {
            return NextResponse.json({ success: false, error: `Original sale ${originalSaleId} not found` }, { status: 404 });
        }

        const resolvedWarehouseId = warehouseId ?? originalSale.warehouseId;
        // Coerce null → undefined: Prisma StringFilter rejects null in where clauses
        const resolvedBranchId = (branchId ?? originalSale.branchId) ?? undefined;

        const returnSale = await secureTransaction(async (tx) => {
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
                    shiftId: shiftId ?? originalSale.shiftId ?? 'SYSTEM_SHIFT',
                    userId: originalSale.userId ?? 'SYSTEM_USER',
                    customerId: originalSale.customerId ?? undefined,
                    syncStatus: 'SYNCED',
                    offlineFlag: true,
                    isTimeSuspicious: timeCheck.isTimeSuspicious,
                    idempotencyKey: idempotencyKey ?? undefined,
                    createdAt: timeCheck.createdAt,
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

            if (!salesAccount || !cashAccount) {
                throw new Error(`[offline-return] GL accounts missing for branchId=${resolvedBranchId}. salesAccount:${salesAccount?.id}, cashAccount:${cashAccount?.id}. Seed GL accounts before syncing.`);
            }

            // Split tax from revenue reversal
            const creditAccountId = cashAccount.id;
            const returnTaxAmt = new Decimal(originalSale.taxAmount || 0)
                .mul(dAmount.abs()).div(new Decimal(originalSale.totalAmount).abs());
            const returnRevenueAmt = dAmount.abs().minus(returnTaxAmt);

            const returnLines: any[] = [
                { accountId: salesAccount.id, debit: returnRevenueAmt.toString(), credit: '0' },
                { accountId: creditAccountId, debit: '0', credit: dAmount.abs().toString() }
            ];

            // Reverse VAT if applicable
            if (returnTaxAmt.gt(0)) {
                const vatAccount = await tx.account.findUnique({ where: { code: '2100' } });
                if (vatAccount) {
                    returnLines.push({ accountId: vatAccount.id, debit: returnTaxAmt.toString(), credit: '0' });
                }
            }

            await tx.journalEntry.create({
                data: {
                    date: createdAt ? new Date(createdAt) : new Date(),
                    description: `Return Sync: ${refundSale.id} (Original: ${originalSaleId})`,
                    branchId: resolvedBranchId,
                    saleId: refundSale.id,
                    idempotencyKey: `journal-return-${refundSale.id}`,
                    lines: {
                        create: returnLines
                    }
                }
            });

            if (originalSale.customerId) {
                // 1. CREDIT the full return amount
                await tx.customerTransaction.create({
                    data: {
                        customerId: originalSale.customerId,
                        type: 'CREDIT',
                        amount: dAmount.abs().toString(),
                        description: `Offline Return Sync: ${refundSale.id}`,
                        reference: refundSale.id,
                        branchId: resolvedBranchId
                    }
                });
                await tx.customer.update({
                    where: { id: originalSale.customerId },
                    data: { balance: { decrement: dAmount.abs().toString() } }
                });

                // 2. DEBIT the cash refunded
                await tx.customerTransaction.create({
                    data: {
                        customerId: originalSale.customerId,
                        type: 'DEBIT',
                        amount: dAmount.abs().toString(),
                        description: `Offline Payment Sync (Refund): ${returnType} for ${refundSale.id}`,
                        reference: refundSale.id,
                        branchId: resolvedBranchId
                    }
                });
                await tx.customer.update({
                    where: { id: originalSale.customerId },
                    data: { balance: { increment: dAmount.abs().toString() } }
                });
            }

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
    });
}
