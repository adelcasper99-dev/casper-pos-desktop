'use server';

import { prisma } from '@/lib/prisma';
import { secureAction } from '@/lib/safe-action';


/**
 * Search for existing customers by name or phone
 * Returns customers from the Customer table with their actual UUIDs
 */
export const searchCustomers = secureAction(async (query: string) => {
    if (!query || query.length < 2) {
        return { customers: [] };
    }

    // First, try to find in the Customer table (preferred source)
    const existingCustomers = await prisma.customer.findMany({
        where: {
            OR: [
                { name: { contains: query } },
                { phone: { contains: query } }
            ]
        },
        select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            balance: true
        },
        take: 10,
        orderBy: { updatedAt: 'desc' }
    });

    if (existingCustomers.length > 0) {
        return {
            customers: existingCustomers.map(c => ({
                id: c.id, // Real UUID from Customer table
                name: c.name,
                phone: c.phone,
                email: c.email || undefined, // Convert null to undefined
                balance: Number(c.balance) // Serialize Decimal to number
            }))
        };
    }

    return {
        customers: []
    };
}, { permission: 'TICKET_VIEW', requireCSRF: false });
