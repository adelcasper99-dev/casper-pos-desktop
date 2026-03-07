'use server';

import { prisma } from '@/lib/prisma';

/**
 * Public ticket lookup - NO authentication required
 * Returns ONLY non-sensitive information
 */
export async function getPublicTicketStatus(query: {
    barcode?: string;
    phone?: string
}): Promise<{
    success: boolean;
    error?: string;
    data?: {
        barcode: string;
        status: string;
        statusLabel: string;
        deviceBrand: string;
        deviceModel: string;
        createdAt: string;
        updatedAt: string;
    }[];
}> {
    try {
        if (!query.barcode && !query.phone) {
            return { success: false, error: 'Please provide a ticket number or phone number' };
        }

        const where: any = { deletedAt: null };

        if (query.barcode) {
            where.barcode = query.barcode.trim();
        }

        if (query.phone) {
            const cleanPhone = query.phone.replace(/\D/g, '');
            where.customerPhone = { contains: cleanPhone };
        }

        const tickets = await prisma.ticket.findMany({
            where,
            select: {
                barcode: true,
                status: true,
                deviceBrand: true,
                deviceModel: true,
                createdAt: true,
                updatedAt: true
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        if (tickets.length === 0) {
            return { success: false, error: 'No tickets found.' };
        }

        const statusLabels: Record<string, string> = {
            'NEW': 'تم الاستلام',
            'IN_PROGRESS': 'جاري الإصلاح',
            'DIAGNOSING': 'جاري الفحص',
            'PENDING_APPROVAL': 'في انتظار الموافقة',
            'WAITING_FOR_PARTS': 'في انتظار قطع الغيار',
            'QC_PENDING': 'فحص الجودة',
            'COMPLETED': 'تم الإصلاح',
            'READY_AT_BRANCH': 'جاهز للاستلام',
            'DELIVERED': 'تم التسليم',
            'CANCELLED': 'ملغي',
            'RETURNED_FOR_REFIX': 'مرتجع للإصلاح',
        };

        const data = tickets.map((t) => ({
            barcode: t.barcode,
            status: t.status,
            statusLabel: statusLabels[t.status] || t.status,
            deviceBrand: t.deviceBrand,
            deviceModel: t.deviceModel,
            createdAt: t.createdAt.toISOString(),
            updatedAt: t.updatedAt.toISOString()
        }));

        return { success: true, data };
    } catch (error) {
        console.error('Public ticket lookup error:', error);
        return { success: false, error: 'An error occurred.' };
    }
}
