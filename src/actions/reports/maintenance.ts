'use server';

import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { Decimal } from "@prisma/client/runtime/library";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentUser } from "../auth";
import { getBranchFilter } from "@/lib/data-filters";

interface MaintenanceReportFilters {
    startDate?: string;
    endDate?: string;
    technicianId?: string;
    customerName?: string;
}

export const getMaintenanceProfitReport = secureAction(async (filters: MaintenanceReportFilters) => {
    const currentUser = await getCurrentUser();
    const branchFilter = getBranchFilter(currentUser);

    const now = new Date();
    const startDate = filters.startDate ? startOfDay(new Date(filters.startDate)) : startOfDay(subDays(now, 30));
    const endDate = filters.endDate ? endOfDay(new Date(filters.endDate)) : endOfDay(now);

    const where: any = {
        deletedAt: null,
        status: { in: ['DELIVERED', 'PAID_DELIVERED', 'CLOSED', 'PICKED_UP', 'COMPLETED', 'READY_AT_BRANCH'] },
        createdAt: { gte: startDate, lte: endDate },
        ...branchFilter
    };

    if (filters.technicianId && filters.technicianId !== 'all') {
        where.technicianId = filters.technicianId;
    }

    if (filters.customerName) {
        where.customerName = { contains: filters.customerName };
    }

    const tickets = await prisma.ticket.findMany({
        where,
        include: {
            technician: true,
            customer: true,
            parts: {
                include: { product: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    let totalRevenue = 0;
    let partsCOGS = 0;
    let laborRevenue = 0;
        if (['DELIVERED', 'PAID_DELIVERED', 'PICKED_UP'].includes(ticket.status)) deliveredCount++;
        if (ticket.returnCount > 0) returnCount++;

        return {
            id: ticket.id,
            barcode: ticket.barcode,
            date: ticket.createdAt,
            customerName: ticket.customerName,
            technicianName: ticket.technician?.name || 'غير محدد',
            revenue: ticketRevenue,
            partsCost: ticketPartsCost,
            commission: commission,
            netProfit: ticketRevenue - (ticketPartsCost + commission),
            gap: gapDescription,
            status: ticket.status,
            issueDescription: ticket.issueDescription
        };
    });

    const successRatio = (deliveredCount + returnCount) > 0 
        ? (deliveredCount / (deliveredCount + returnCount)) * 100 
        : 100;

    return {
        success: true,
        data: {
            kpis: {
                totalRevenue,
                partsCOGS,
                totalCommissions,
                laborNetProfit: laborRevenue - totalCommissions,
                partsNetProfit: (totalRevenue - laborRevenue) - partsCOGS,
                totalNetProfit: totalRevenue - (partsCOGS + totalCommissions),
                successRatio: successRatio.toFixed(1)
            },
            tickets: mappedTickets
        }
    };
}, { permission: PERMISSIONS.TICKET_VIEW, requireCSRF: false });

export async function getTechnicians() {
    try {
        const technicians = await prisma.technician.findMany({
            where: {
                deletedAt: null
            },
            select: { 
                id: true, 
                name: true,
                user: { select: { username: true } }
            }
        });
        
        return { 
            success: true, 
            technicians: technicians.map(t => ({
                id: t.id,
                name: t.name,
                username: t.user?.username || t.name
            }))
        };
    } catch (error) {
        console.error("Error fetching technicians:", error);
        return { success: false, technicians: [] };
    }
}
