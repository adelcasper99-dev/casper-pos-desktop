import { NextRequest, NextResponse } from 'next/server';
import { prisma, secureTransaction } from '@/lib/prisma';
import { verifyServerLicense } from '@/lib/license/server-verify';
import { runWithTenant } from '@/lib/prisma-tenant-extension';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
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
            const body = await request.json();
            if (body.tenantId && body.tenantId !== tenantId) {
                return NextResponse.json({ success: false, error: 'Tenant mismatch' }, { status: 403 });
            }
        const {
            id,
            idempotencyKey,
            type,
            productId,
            fromWarehouseId,
            toWarehouseId,
            quantity,
            reason,
            performedById,
            branchId,
            createdAt,
        } = body;

        // Bounded client time check to guarantee temporal integrity
        const { getBoundedTimestamp } = await import('@/lib/sync-time-helper');
        const timeCheck = getBoundedTimestamp(createdAt);

        if (!type || !productId || !quantity) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: type, productId, quantity' },
                { status: 400 }
            );
        }

        // ── Idempotency Guard ──────────────────────────────────────────────────
        // Now using the explicit idempotencyKey field added to the schema.
        if (idempotencyKey || id) {
            const existing = idempotencyKey 
                ? await prisma.stockMovement.findUnique({ where: { idempotencyKey } })
                : await prisma.stockMovement.findUnique({ where: { id } });

            if (existing) {
                return NextResponse.json({
                    success: true,
                    existing: true,
                    id: existing.id,
                    message: 'Movement already processed',
                });
            }
        }

        const result = await secureTransaction(async (tx) => {
            const movement = await tx.stockMovement.create({
                data: {
                    ...(id ? { id } : {}),
                    type,
                    productId,
                    fromWarehouseId: fromWarehouseId ?? undefined,
                    toWarehouseId: toWarehouseId ?? undefined,
                    quantity,
                    reason: reason ?? `Offline sync (key: ${idempotencyKey ?? 'N/A'})`,
                    performedById: performedById ?? undefined,
                    branchId: branchId ?? undefined,
                    idempotencyKey: idempotencyKey ?? undefined,
                    createdAt: timeCheck.createdAt,
                },
            });

            // ── Adjust Stock Levels ────────────────────────────────────────────
            if (fromWarehouseId) {
                await tx.stock.updateMany({
                    where: { productId, warehouseId: fromWarehouseId },
                    data: { quantity: { decrement: quantity } },
                });
            }

            if (toWarehouseId) {
                // Upsert target stock record (may not exist yet for new warehouse assignments)
                const existing = await tx.stock.findUnique({
                    where: { productId_warehouseId: { productId, warehouseId: toWarehouseId } },
                });

                if (existing) {
                    await tx.stock.update({
                        where: { productId_warehouseId: { productId, warehouseId: toWarehouseId } },
                        data: { quantity: { increment: quantity } },
                    });
                } else {
                    await tx.stock.create({
                        data: { productId, warehouseId: toWarehouseId, quantity },
                    });
                }
            }

            return movement;
        });

        return NextResponse.json({ success: true, id: result.id, existing: false });
        });
    } catch (error: any) {
        console.error('[offline-movement] failed:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
