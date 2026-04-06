'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { secureAction } from '@/lib/safe-action';
import { z } from 'zod';
import { Decimal } from 'decimal.js';

const sparePartSchema = z.object({
    sku: z.string().optional(),
    productName: z.string().min(1),
    brand: z.string().min(1),
    quantity: z.string(),
    costPrice: z.string(),
    sellPrice: z.string(),
    price1: z.string().optional().default('0'),
    price2: z.string().optional().default('0'),
    price3: z.string().optional().default('0'),
});

// Get all spare parts with optional filters
export const getSpareParts = secureAction(async (filters?: {
    search?: string;
    brand?: string;
    page?: number;
    limit?: number;
}) => {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
        category: 'داخلي',
    };

    if (filters?.search) {
        where.productName = {
            contains: filters.search,
        };
    }

    if (filters?.brand && filters.brand !== 'all') {
        where.brand = filters.brand;
    }

    const [parts, total] = await Promise.all([
        prisma.sparePart.findMany({
            where,
            orderBy: {
                productName: 'asc',
            },
            skip,
            take: limit,
        }),
        prisma.sparePart.count({ where }),
    ]);

    return {
        parts,
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
}, { permission: 'INVENTORY_VIEW', requireCSRF: false });

// Get list of all brands
export const getAllBrands = secureAction(async () => {
    const brandsData = await prisma.sparePart.findMany({
        where: {
            category: 'داخلي',
        },
        select: {
            brand: true,
        },
        distinct: ['brand'],
        orderBy: {
            brand: 'asc',
        },
    });

    return { brands: brandsData.map((b) => b.brand) };
}, { permission: 'INVENTORY_VIEW', requireCSRF: false });

export const getSparePart = secureAction(async (id: string) => {
    try {
        const part = await prisma.sparePart.findUnique({
            where: { id },
        });
        return { part };
    } catch (error) {
        console.error('Error fetching spare part:', error);
        return { part: null, error: 'Failed' };
    }
}, { permission: 'INVENTORY_VIEW', requireCSRF: false });

export const updateSparePart = secureAction(async (data: {
    id: string;
    productName?: string;
    brand?: string;
    quantity?: string;
    costPrice?: string;
    sellPrice?: string;
    price1?: string;
    price2?: string;
    price3?: string;
    sku?: string;
}) => {
    try {
        const updateData: any = {};

        if (data.productName !== undefined) updateData.productName = data.productName;
        if (data.brand !== undefined) updateData.brand = data.brand;
        if (data.quantity !== undefined) updateData.quantity = data.quantity;
        if (data.costPrice !== undefined) updateData.costPrice = data.costPrice;
        if (data.sellPrice !== undefined) updateData.sellPrice = data.sellPrice;
        if (data.price1 !== undefined) updateData.price1 = data.price1;
        if (data.price2 !== undefined) updateData.price2 = data.price2;
        if (data.price3 !== undefined) updateData.price3 = data.price3;
        if (data.sku !== undefined) updateData.sku = data.sku;

        await prisma.sparePart.update({
            where: { id: data.id },
            data: updateData,
        });
        revalidatePath('/spare-parts');
        return { success: true };
    } catch (error) {
        console.error('Error updating spare part:', error);
        return { success: false, error: 'Failed to update part' };
    }
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });

export const deleteSparePart = secureAction(async (id: string) => {
    try {
        await prisma.sparePart.delete({
            where: { id },
        });
        revalidatePath('/spare-parts');
        return { success: true };
    } catch (error) {
        console.error('Error deleting spare part:', error);
        return { success: false, error: 'Failed to delete part' };
    }
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });

export const addSparePart = secureAction(async (data: z.infer<typeof sparePartSchema>) => {
    try {
        await prisma.sparePart.create({
            data: {
                ...data,
                category: 'داخلي',
            },
        });
        revalidatePath('/spare-parts');
        return { success: true };
    } catch (error) {
        console.error('Error adding spare part:', error);
        return { success: false, error: 'Failed to add part' };
    }
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });

// Import multiple spare parts at once
const importPartsSchema = z.object({
    parts: z.array(z.object({
        productName: z.string(),
        brand: z.string(),
        quantity: z.string(),
        costPrice: z.string(),
        sellPrice: z.string(),
        price1: z.string().optional(),
        price2: z.string().optional(),
        price3: z.string().optional(),
        sku: z.string().optional(),
    })),
});

export const importSpareParts = secureAction(async (data: z.infer<typeof importPartsSchema>) => {
    try {
        console.log(`[Import] Starting bulk import of ${data.parts.length} items...`);
        const results = {
            success: 0,
            updated: 0,
            failed: 0,
            errors: [] as string[]
        };

        // Optimization: Fetch all existing internal parts at once for local lookup
        const existingParts = await prisma.sparePart.findMany({
            where: { category: 'داخلي' },
            select: { id: true, productName: true, brand: true }
        });

        // Create a fast-lookup map using productName|brand as key
        const partMap = new Map<string, string>();
        existingParts.forEach(p => {
            const key = `${p.productName.trim().toLowerCase()}|${p.brand.trim().toLowerCase()}`;
            partMap.set(key, p.id);
        });

        // Use a single transaction to execute all mutations (Massive performance boost for SQLite/Postgres)
        await prisma.$transaction(async (tx: any) => {
            let i = 0;
            for (const part of data.parts) {
                i++;
                if (i % 500 === 0) console.log(`[Import] Processing row ${i}...`);
                
                try {
                    const key = `${part.productName.trim().toLowerCase()}|${part.brand.trim().toLowerCase()}`;
                    const existingId = partMap.get(key);

                    if (existingId) {
                        await tx.sparePart.update({
                            where: { id: existingId },
                            data: {
                                quantity: part.quantity,
                                costPrice: part.costPrice || '0',
                                sellPrice: part.sellPrice || '0',
                                price1: part.price1 || '0',
                                price2: part.price2 || '0',
                                price3: part.price3 || '0',
                                sku: part.sku || undefined,
                            },
                        });
                        results.updated++;
                    } else {
                        await tx.sparePart.create({
                            data: {
                                productName: part.productName.trim(),
                                brand: part.brand.trim(),
                                quantity: part.quantity,
                                costPrice: part.costPrice || '0',
                                sellPrice: part.sellPrice || '0',
                                price1: part.price1 || '0',
                                price2: part.price2 || '0',
                                price3: part.price3 || '0',
                                sku: part.sku || null,
                                category: 'داخلي',
                            },
                        });
                        results.success++;
                    }
                } catch (rowError: any) {
                    results.failed++;
                    results.errors.push(`Row ${i} (${part.productName}): ${rowError.message}`);
                }
            }
        }, { timeout: 120000 }); // Increase transaction timeout to 120s for huge files

        console.log(`[Import] Completed: ${results.success} new, ${results.updated} updated, ${results.failed} failed.`);
        revalidatePath('/spare-parts');
        return { success: true, results };
    } catch (error) {
        console.error('Error importing spare parts:', error);
        return { success: false, error: 'Failed to import parts' };
    }
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });

export const bulkUpdateSparePartPrices = secureAction(async (data: {
    percentage: number;
    brand?: string;
    search?: string;
    priceType: 'all' | 'sellPrice' | 'price1' | 'price2' | 'price3';
}) => {
    try {
        console.log(`[Bulk Update] Starting update: ${data.percentage}% for brand: ${data.brand || 'All'}...`);
        
        const where: any = { category: 'داخلي' };
        if (data.brand && data.brand !== 'all') where.brand = data.brand;
        if (data.search) where.productName = { contains: data.search };

        // 1. Fetch items to update
        const parts = await prisma.sparePart.findMany({
            where,
            select: { id: true, sellPrice: true, price1: true, price2: true, price3: true }
        });

        if (parts.length === 0) return { success: true, count: 0 };

        const multiplier = new Decimal(1).plus(new Decimal(data.percentage).dividedBy(100));

        // 2. Batch updates (500 items per batch to prevent SQLite lock timeouts)
        const BATCH_SIZE = 500;
        let updatedCount = 0;

        for (let i = 0; i < parts.length; i += BATCH_SIZE) {
            const batch = parts.slice(i, i + BATCH_SIZE);
            
            await prisma.$transaction(async (tx: any) => {
                for (const part of batch) {
                    const updateData: any = {};
                    
                    const updateField = (field: string) => {
                        const current = new Decimal(part[field as keyof typeof part] as string || '0');
                        if (current.isZero()) return;
                        updateData[field] = current.times(multiplier).toDecimalPlaces(2).toString();
                    };

                    if (data.priceType === 'all') {
                        updateField('sellPrice');
                        updateField('price1');
                        updateField('price2');
                        updateField('price3');
                    } else {
                        updateField(data.priceType);
                    }

                    if (Object.keys(updateData).length > 0) {
                        await tx.sparePart.update({
                            where: { id: part.id },
                            data: updateData
                        });
                        updatedCount++;
                    }
                }
            }, { timeout: 30000 });
            
            console.log(`[Bulk Update] Progress: ${Math.min(i + BATCH_SIZE, parts.length)}/${parts.length}...`);
        }

        revalidatePath('/spare-parts');
        return { success: true, count: updatedCount };
    } catch (error) {
        console.error('Error in bulk update:', error);
        return { success: false, error: 'Failed to update prices' };
    }
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });
