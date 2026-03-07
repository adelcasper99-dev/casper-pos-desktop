'use server';

import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { CACHE_KEYS, CACHE_TAGS, CACHE_CONFIG } from "@/lib/cache-keys";

/**
 * Get active tickets with caching
 */
export async function getCachedActiveTickets() {
    return unstable_cache(
        async () => {
            const tickets = await prisma.ticket.findMany({
                where: {
                    status: {
                        in: ['NEW', 'IN_PROGRESS', 'DIAGNOSING', 'QC_PENDING', 'AT_CENTER']
                    },
                    deletedAt: null
                },
                include: {
                    customer: true,
                    technician: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            });
            return tickets;
        },
        [CACHE_KEYS.TICKETS_ACTIVE],
        {
            revalidate: 300,
            tags: [CACHE_TAGS.TICKETS],
        }
    )();
}

/**
 * Get ticket by ID with caching
 */
export async function getCachedTicketById(id: string) {
    return unstable_cache(
        async () => {
            const ticket = await prisma.ticket.findUnique({
                where: { id },
                include: {
                    customer: true,
                    technician: true,
                    parts: {
                        include: { product: true }
                    },
                    notes: { orderBy: { createdAt: 'desc' } },
                    payments: true,
                },
            });
            return ticket;
        },
        [CACHE_KEYS.TICKET_BY_ID(id)],
        {
            revalidate: 60,
            tags: [CACHE_TAGS.TICKETS],
        }
    )();
}
