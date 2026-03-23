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
    // ... same logic ...
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

export const updateSparePartPrices = secureAction(async (data: {
    id: string;
    costPrice: string;
    sellPrice: string;
    price1?: string;
    price2?: string;
    price3?: string;
}) => {
    try {
        await prisma.sparePart.update({
            where: { id: data.id },
            data: {
                costPrice: data.costPrice,
                sellPrice: data.sellPrice,
                price1: data.price1 || "0",
                price2: data.price2 || "0",
                price3: data.price3 || "0",
            },
        });
        revalidatePath('/spare-parts');
        return { success: true };
    } catch (error) {
        console.error('Error updating spare part prices:', error);
        return { success: false, error: 'Failed to update prices' };
    }
}, { permission: 'INVENTORY_MANAGE' });

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
}, { permission: 'INVENTORY_MANAGE' });

export const addSparePart = secureAction(async (data: z.infer<typeof sparePartSchema>) => {
    try {
        await prisma.sparePart.create({
            data: {
                ...data,
                category: 'داخلي', // Default category
            },
        });
        revalidatePath('/spare-parts');
        return { success: true };
    } catch (error) {
        console.error('Error adding spare part:', error);
        return { success: false, error: 'Failed to add part' };
    }
}, { permission: 'INVENTORY_MANAGE' });
