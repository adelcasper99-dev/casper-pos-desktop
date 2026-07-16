import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
    if (process.env.NODE_ROLE === 'SUB_NODE') {
        return NextResponse.json({ success: true, message: 'Sub-node does not sync master data' });
    }

    try {
        const body = await request.json();
        const { cloudUrl, secret } = body;

        if (!cloudUrl) {
            return NextResponse.json({ success: false, error: 'Missing cloud URL' }, { status: 400 });
        }

        // 1. Fetch all local Models and Categories
        const [categories, models] = await Promise.all([
            prisma.category.findMany(),
            prisma.model.findMany()
        ]);

        // 2. Send to Cloud
        const response = await fetch(`${cloudUrl}/api/sync/master-data/push`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-sync-secret': secret || ''
            },
            body: JSON.stringify({ categories, models })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Cloud sync failed: ${errorText}`);
        }

        const data = await response.json();

        // 3. Process ID_OVERRIDES
        if (data.success && data.hasOverrides && data.overrides) {
            for (const override of data.overrides) {
                if (override.type === 'Category') {
                    // Update Products referencing this Category
                    await prisma.product.updateMany({
                        where: { categoryId: override.localId },
                        data: { categoryId: override.cloudId }
                    });
                    // Update Models referencing this Category
                    await prisma.model.updateMany({
                        where: { categoryId: override.localId },
                        data: { categoryId: override.cloudId }
                    });
                    // Delete the local Category (tombstone will track if needed, or simply delete and let pull fetch it later)
                    await prisma.category.delete({ where: { id: override.localId } }).catch(() => null);
                } else if (override.type === 'Model') {
                    // Update Products referencing this Model
                    await prisma.product.updateMany({
                        where: { modelId: override.localId },
                        data: { modelId: override.cloudId }
                    });
                    // Delete local Model
                    await prisma.model.delete({ where: { id: override.localId } }).catch(() => null);
                }
            }
        }

        return NextResponse.json({ success: true, pulled: data.overrides?.length || 0 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
