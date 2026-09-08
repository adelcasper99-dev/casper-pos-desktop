'use server';

import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, subDays } from 'date-fns';
import Decimal from "decimal.js";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentUser } from "../auth";
import { getBranchFilter } from "@/lib/data-filters";
import { unstable_noStore as noStore } from "next/cache";

interface MaintenanceReportFilters {
    startDate?: string;
    endDate?: string;
    technicianId?: string;
    customerName?: string;
}

export const getMaintenanceProfitReport = secureAction(async (filters: MaintenanceReportFilters) => {
    noStore();
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
            },
            payments: true
        },
        orderBy: { createdAt: 'desc' }
    });

    let totalRevenue = new Decimal(0);
    let partsCOGS = new Decimal(0);
    let partsRevenue = new Decimal(0);
    let laborRevenue = new Decimal(0);
    let totalCommissions = new Decimal(0);
    let totalPartsProfit = new Decimal(0);
    let totalLaborProfit = new Decimal(0);
    let totalNetProfit = new Decimal(0);
    let deliveredCount = 0;
    let returnCount = 0;

    let totalDues = new Decimal(0);
    let totalPaid = new Decimal(0);
    let totalDeferred = new Decimal(0);

    const partsAggregation = new Map<string, { name: string; qty: number; revenue: number; profit: number; type: string }>();

    const mappedTickets = tickets.map(ticket => {
        // Use final customer price if closed/paid, otherwise repair price
        const ticketRevenue = new Decimal(ticket.finalCustomerPrice?.toString() || ticket.repairPrice?.toString() || '0');
        
        // Fix: Use partCostPrice (True Cost) for accurate Center Margin calculation.
        // Fallback to partsCost if historical/legacy ticket.
        const ticketPartsCost = new Decimal(
            Number(ticket.partCostPrice) > 0 
                ? ticket.partCostPrice.toString() 
                : (ticket.partsCost?.toString() || '0')
        );
            
        const commission = new Decimal(ticket.commissionAmount?.toString() || '0');

        // Calculate Parts Revenue vs Cost for this ticket
        // Physical parts must have a linked product (p.productId != null)
        const rawPartsRevenue = ticket.parts
            .filter(p => !!p.productId && p.product?.itemType !== 'SERVICE' && p.status !== 'SERVICE' && !p.deletedAt)
            .reduce((sum, p) => {
                const qty = new Decimal(Number(p.quantity || 1) - Number(p.refundedQty || 0));
                return qty.gt(0) ? sum.plus(new Decimal(p.price?.toString() || '0').times(qty)) : sum;
            }, new Decimal(0));

        // Realized parts revenue cannot exceed total ticket revenue
        const ticketPartsRevenue = Decimal.min(ticketRevenue, rawPartsRevenue);

        // Exact Option A unclamped algebra: PartsProfit + LaborProfit === NetProfit
        const ticketPartsProfit = ticketPartsRevenue.minus(ticketPartsCost);
        const ticketLaborRevenue = ticketRevenue.minus(ticketPartsRevenue);
        const ticketLaborProfit = ticketLaborRevenue.minus(commission);
        const ticketNetProfit = ticketPartsProfit.plus(ticketLaborProfit);
        
        totalRevenue = totalRevenue.plus(ticketRevenue);
        partsCOGS = partsCOGS.plus(ticketPartsCost);
        partsRevenue = partsRevenue.plus(ticketPartsRevenue);
        laborRevenue = laborRevenue.plus(ticketLaborRevenue);
        totalCommissions = totalCommissions.plus(commission);
        totalPartsProfit = totalPartsProfit.plus(ticketPartsProfit);
        totalLaborProfit = totalLaborProfit.plus(ticketLaborProfit);
        totalNetProfit = totalNetProfit.plus(ticketNetProfit);

        // Calculate Dues, Paid, and Deferred
        const ticketDues = new Decimal(ticket.initialQuote?.toString() || ticket.repairPrice?.toString() || '0');
        totalDues = totalDues.plus(ticketDues);

        let ticketDeferredVal = ticket.payments
            .filter(p => p.method === 'ACCOUNT')
            .reduce((sum, p) => sum.plus(new Decimal(p.amount?.toString() || '0')), new Decimal(0));
            
        if (ticket.payments.length === 0 && ticket.paymentMethod === 'ACCOUNT') {
            ticketDeferredVal = new Decimal(ticket.amountPaid?.toString() || '0');
        }
        totalDeferred = totalDeferred.plus(ticketDeferredVal);

        let ticketPaidVal = ticket.payments
            .filter(p => p.method !== 'ACCOUNT')
            .reduce((sum, p) => sum.plus(new Decimal(p.amount?.toString() || '0')), new Decimal(0));
            
        if (ticket.payments.length === 0 && ticket.paymentMethod !== 'ACCOUNT') {
            ticketPaidVal = new Decimal(ticket.amountPaid?.toString() || '0');
        }
        totalPaid = totalPaid.plus(ticketPaidVal);

        // Top Selling / Profitable parts & services aggregation
        ticket.parts.forEach(p => {
            if (p.deletedAt) return;
            const partName = p.name || p.product?.name || 'قطعة غير معروفة';
            const qty = Number(p.quantity || 1) - Number(p.refundedQty || 0);
            if (qty <= 0) return;
            
            const pRevenue = new Decimal(p.price?.toString() || '0').times(qty);
            const pCost = new Decimal(p.baseCostPrice?.toString() || p.cost?.toString() || '0').times(qty);
            const pProfit = pRevenue.minus(pCost);
            
            const isService = !p.productId || p.product?.itemType === 'SERVICE' || p.status === 'SERVICE';
            const typeLabel = isService ? 'SERVICE' : 'PART';
            
            if (!partsAggregation.has(partName)) {
                partsAggregation.set(partName, {
                    name: partName,
                    qty: 0,
                    revenue: 0,
                    profit: 0,
                    type: typeLabel
                });
            }
            const agg = partsAggregation.get(partName)!;
            agg.qty += qty;
            agg.revenue = new Decimal(agg.revenue).plus(pRevenue).toNumber();
            agg.profit = new Decimal(agg.profit).plus(pProfit).toNumber();
        });

        // Refined Gap Analysis
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

        if (['DELIVERED', 'PAID_DELIVERED', 'PICKED_UP'].includes(ticket.status)) deliveredCount++;
        if (ticket.returnCount > 0) returnCount++;

        return {
            id: ticket.id,
            barcode: ticket.barcode,
            date: ticket.createdAt,
            customerName: ticket.customerName,
            technicianName: ticket.technician?.name || 'غير محدد',
            revenue: ticketRevenue.toNumber(),
            partsCost: ticketPartsCost.toNumber(),
            commission: commission.toNumber(),
            partsProfit: ticketPartsProfit.toNumber(),
            laborProfit: ticketLaborProfit.toNumber(),
            netProfit: ticketNetProfit.toNumber(),
            gap: gapDescription,
            status: ticket.status,
            issueDescription: ticket.issueDescription
        };
    });

    const successRatio = (deliveredCount + returnCount) > 0 
        ? (deliveredCount / (deliveredCount + returnCount)) * 100 
        : 100;

    const topSellingParts = Array.from(partsAggregation.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

    const mostProfitableParts = Array.from(partsAggregation.values())
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5);

    return {
        success: true,
        data: {
            kpis: {
                totalRevenue: totalRevenue.toNumber(),
                partsCOGS: partsCOGS.toNumber(),
                totalCommissions: totalCommissions.toNumber(),
                laborNetProfit: totalLaborProfit.toNumber(),
                partsNetProfit: totalPartsProfit.toNumber(),
                totalNetProfit: totalNetProfit.toNumber(),
                successRatio: successRatio.toFixed(1),
                totalDues: totalDues.toNumber(),
                totalPaid: totalPaid.toNumber(),
                totalDeferred: totalDeferred.toNumber(),
                laborRevenue: laborRevenue.toNumber(),
                partsRevenue: partsRevenue.toNumber()
            },
            topParts: {
                selling: topSellingParts,
                profitable: mostProfitableParts
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
