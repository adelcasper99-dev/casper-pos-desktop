import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session?.user || !session.user.permissions?.includes(PERMISSIONS.MANAGE_SETTINGS)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { type, fromId, toId } = body;

        if (!type || !fromId || !toId || fromId === toId) {
            return NextResponse.json({ success: false, error: 'Invalid merge parameters' }, { status: 400 });
        }

        await prisma.$transaction(async (tx) => {
            if (type === 'Category') {
                // Update Products
                await tx.product.updateMany({
                    where: { categoryId: fromId },
                    data: { categoryId: toId }
                });
                // Update Models
                await tx.model.updateMany({
                    where: { categoryId: fromId },
                    data: { categoryId: toId }
                });

                // Create Tombstone
                await tx.masterDataTombstone.create({
                    data: {
                        fromId: fromId,
                        toId: toId,
                        entityType: 'Category'
                    }
                });

                // Delete old
                await tx.category.delete({ where: { id: fromId } });

            } else if (type === 'Model') {
                // Update Products
                await tx.product.updateMany({
                    where: { modelId: fromId },
                    data: { modelId: toId }
                });

                // Create Tombstone
                await tx.masterDataTombstone.create({
                    data: {
                        fromId: fromId,
                        toId: toId,
                        entityType: 'Model'
                    }
                });

                // Delete old
                await tx.model.delete({ where: { id: fromId } });
            } else {
                throw new Error('Invalid type for merge');
            }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
