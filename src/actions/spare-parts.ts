'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { secureAction } from '@/lib/safe-action';
import { z } from 'zod';

const sparePartSchema = z.object({
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
    })),
});

export const importSpareParts = secureAction(async (data: z.infer<typeof importPartsSchema>) => {
    try {
        const results = {
            success: 0,
            failed: 0,
            errors: [] as string[]
        };

        for (const part of data.parts) {
            try {
                await prisma.sparePart.create({
                    data: {
                        productName: part.productName,
                        brand: part.brand,
                        quantity: part.quantity,
                        costPrice: part.costPrice || '0',
                        sellPrice: part.sellPrice || '0',
                        price1: part.price1 || '0',
                        price2: part.price2 || '0',
                        price3: part.price3 || '0',
                        category: 'داخلي',
                    },
                });
                results.success++;
            } catch (error: any) {
                results.failed++;
                results.errors.push(`Failed to import "${part.productName}": ${error.message}`);
            }
        }

        revalidatePath('/spare-parts');
        return { success: true, results };
    } catch (error) {
        console.error('Error importing spare parts:', error);
        return { success: false, error: 'Failed to import parts' };
    }
}, { permission: 'INVENTORY_MANAGE', requireCSRF: false });
