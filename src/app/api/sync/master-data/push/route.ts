import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeMasterDataName } from '@/shared/utils/string';

export async function POST(request: NextRequest) {
    const clientSecret = request.headers.get('x-sync-secret');
    if (process.env.SYNC_SECRET && clientSecret !== process.env.SYNC_SECRET) {
        return NextResponse.json({ success: false, error: 'Unauthorized sync attempt' }, { status: 401 });
    }

    try {
        const payload = await request.json();
        const { models = [], categories = [] } = payload;
        
        const translationMap: Record<string, string> = {};
        const overrides: any[] = [];
        
        const results = await prisma.$transaction(async (tx) => {
            // Process Categories
            for (const category of categories) {
                const normalized = normalizeMasterDataName(category.name);
                const existing = await tx.category.findFirst({
                    where: { name: { equals: normalized } } // assuming case-sensitive or db collation handles it, but normalized is strict
                });

                if (existing) {
                    if (existing.id !== category.id) {
                        translationMap[category.id] = existing.id;
                        overrides.push({ type: 'Category', localId: category.id, cloudId: existing.id });
                    }
                } else {
                    await tx.category.create({
                        data: {
                            id: category.id,
                            name: normalized,
                            color: category.color || '#06b6d4',
                            parentId: category.parentId || null
                        }
                    });
                }
            }

            // Process Models
            for (const model of models) {
                const normalized = normalizeMasterDataName(model.name);
                // Translate categoryId if it was overridden in this same payload
                let finalCategoryId = translationMap[model.categoryId] || model.categoryId;

                // 👻 Ghost ID Translation
                const tombstone = await tx.masterDataTombstone.findFirst({ where: { fromId: finalCategoryId } });
                if (tombstone) {
                    finalCategoryId = tombstone.toId;
                }

                const existing = await tx.model.findFirst({
                    where: { name: { equals: normalized }, categoryId: finalCategoryId }
                });

                if (existing) {
                    if (existing.id !== model.id) {
                        translationMap[model.id] = existing.id;
                        overrides.push({ type: 'Model', localId: model.id, cloudId: existing.id });
                    }
                } else {
                    await tx.model.create({
                        data: {
                            id: model.id,
                            name: normalized,
                            categoryId: finalCategoryId
                        }
                    });
                }
            }

            return { success: true };
        });

        return NextResponse.json({
            success: true,
            hasOverrides: overrides.length > 0,
            overrides
        });
        
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
