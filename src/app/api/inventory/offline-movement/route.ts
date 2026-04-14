import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
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
            createdAt, // 🆕 Extract original timestamp
        } = body;

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

        const result = await prisma.$transaction(async (tx) => {
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
                    idempotencyKey: idempotencyKey ?? undefined, // 🆕 Save the key
                    createdAt: createdAt ? new Date(createdAt) : undefined, // 🆕 Use original time
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
    } catch (error: any) {
        console.error('[offline-movement] failed:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
