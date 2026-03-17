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
    let totalCommissions = 0;
    let highRiskCount = 0;
    let deliveredCount = 0;
    let returnCount = 0;

    const mappedTickets = tickets.map(ticket => {
        const ticketRevenue = Number(ticket.repairPrice || 0);
        const ticketPartsCost = Number(ticket.partsCost || 0);
        const commission = Number(ticket.commissionAmount || 0);
        
        totalRevenue += ticketRevenue;
        partsCOGS += ticketPartsCost;
        totalCommissions += commission;

        // Calculate Parts Revenue vs Cost
        const ticketPartsRevenue = ticket.parts
            .filter(p => p.product?.itemType !== 'SERVICE' && p.status !== 'SERVICE')
            .reduce((sum, p) => sum + Number(p.price || 0), 0);
        
        // Use effective parts revenue to properly split the total repairPrice
        const effectivePartsRevenue = Math.max(ticketPartsRevenue, ticketPartsCost);
        const ticketLaborRevenue = ticketRevenue - effectivePartsRevenue;
        
        laborRevenue += ticketLaborRevenue;

        // Refined Gap & Risk Analysis
        const lastUpdate = new Date(ticket.updatedAt).getTime();
        const diffMs = Date.now() - lastUpdate;
        
        // Workflow Gap (Delay vs Expected)
        let gapDescription = "0m";
        if (ticket.startedAt && ticket.expectedDuration) {
            const endTime = ticket.completedAt || new Date();
            const durationMs = endTime.getTime() - ticket.startedAt.getTime();
            const expectedMs = ticket.expectedDuration * 60 * 60 * 1000;
            if (durationMs > expectedMs) {
                const overMs = durationMs - expectedMs;
                const d = Math.floor(overMs / (1000 * 60 * 60 * 24));
                const h = Math.floor((overMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                gapDescription = d > 0 ? `${d}d ${h}h` : `${h}h`;
            }
        }

        // If no production delay, show time since last update
        if (gapDescription === "0m") {
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            gapDescription = diffDays > 0 ? `${diffDays}d ${diffHours}h` : `${diffHours}h`;
            if (diffDays === 0 && diffHours === 0) gapDescription = `${Math.floor(diffMs / 60000)}m`;
        }

        let riskLevel = 'low';
        if (ticket.returnCount > 0 || ticket.isWarrantyReturn) {
            riskLevel = 'high';
            highRiskCount++;
        } else if (diffMs > 3 * 24 * 60 * 60 * 1000) {
            riskLevel = 'medium';
        }

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
            riskLevel,
            status: ticket.status
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
                successRatio: successRatio.toFixed(1),
                highRiskCount
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
