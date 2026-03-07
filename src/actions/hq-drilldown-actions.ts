"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { TicketStatus } from "@/lib/constants";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { startOfDay, endOfDay, subHours } from "date-fns";

export type DrillDownType =
    | 'PENDING'
    | 'CRITICAL'
    | 'DELIVERED'
    | 'REPAIRED'
    | 'REJECTED'
    | 'AGING_LESS_24'
    | 'AGING_24_48'
    | 'AGING_MORE_48'
    | 'TECH_COMPLETED'
    | 'BRANCH_ACTIVE';

interface DrillDownFilters {
    branchId?: string;
    dateRange?: { from: Date; to: Date };
    technicianId?: string;
    specificBranchId?: string;
}

export const getHQDrilldownData = secureAction(async (data: { type: DrillDownType, filters: DrillDownFilters }) => {
    try {
        const { type, filters } = data;
        const { branchId, dateRange, technicianId, specificBranchId } = filters;

        // Base Where Clause
        let where: Prisma.TicketWhereInput = {
            deletedAt: null
        };

        // 1. Global Date Range Filter 
        if (dateRange && dateRange.from && dateRange.to) {
            if (['DELIVERED', 'REPAIRED', 'REJECTED', 'TECH_COMPLETED'].includes(type)) {
                where.updatedAt = {
                    gte: startOfDay(dateRange.from),
                    lte: endOfDay(dateRange.to)
                };
            } else {
                where.createdAt = {
                    gte: startOfDay(dateRange.from),
                    lte: endOfDay(dateRange.to)
                };
            }
        }

        // 2. Branch Filter (Global or Specific)
        const targetBranchId = specificBranchId || (branchId !== 'ALL' ? branchId : undefined);
        if (targetBranchId) {
            where.currentBranchId = targetBranchId;
        }

        // 3. Type Specific Filters
        switch (type) {
            case 'PENDING':
                where.status = {
                    in: [
                        TicketStatus.NEW,
                        TicketStatus.AT_CENTER,
                        TicketStatus.IN_PROGRESS,
                        TicketStatus.DIAGNOSING,
                        TicketStatus.WAITING_FOR_PARTS,
                        TicketStatus.QC_PENDING,
                        TicketStatus.PENDING_APPROVAL
                    ]
                };
                break;

            case 'CRITICAL':
                where.status = {
                    in: [
                        TicketStatus.NEW,
                        TicketStatus.AT_CENTER,
                        TicketStatus.IN_PROGRESS,
                        TicketStatus.DIAGNOSING,
                        TicketStatus.WAITING_FOR_PARTS,
                        TicketStatus.QC_PENDING,
                        TicketStatus.PENDING_APPROVAL
                    ]
                };
                where.createdAt = {
                    ...(where.createdAt as any),
                    lt: subHours(new Date(), 48)
                };
                break;

            case 'DELIVERED':
                where.status = TicketStatus.DELIVERED;
                break;

            case 'REPAIRED':
                where.status = {
                    in: [
                        TicketStatus.COMPLETED,
                        TicketStatus.DELIVERED,
                        TicketStatus.PICKED_UP,
                        TicketStatus.PAID_DELIVERED,
                        TicketStatus.READY_AT_BRANCH
                    ]
                };
                break;

            case 'REJECTED':
                where.status = TicketStatus.REJECTED;
                break;

            case 'AGING_LESS_24':
                where.status = {
                    notIn: [
                        TicketStatus.COMPLETED,
                        TicketStatus.DELIVERED,
                        TicketStatus.REJECTED,
                        TicketStatus.CANCELLED,
                        TicketStatus.PICKED_UP,
                        TicketStatus.PAID_DELIVERED,
                        TicketStatus.READY_AT_BRANCH
                    ]
                };
                where.createdAt = { gte: subHours(new Date(), 24) };
                break;

            case 'AGING_24_48':
                where.status = {
                    notIn: [
                        TicketStatus.COMPLETED,
                        TicketStatus.DELIVERED,
                        TicketStatus.REJECTED,
                        TicketStatus.CANCELLED,
                        TicketStatus.PICKED_UP,
                        TicketStatus.PAID_DELIVERED,
                        TicketStatus.READY_AT_BRANCH
                    ]
                };
                where.createdAt = {
                    gte: subHours(new Date(), 48),
                    lt: subHours(new Date(), 24)
                };
                break;

            case 'AGING_MORE_48':
                where.status = {
                    notIn: [
                        TicketStatus.COMPLETED,
                        TicketStatus.DELIVERED,
                        TicketStatus.REJECTED,
                        TicketStatus.CANCELLED,
                        TicketStatus.PICKED_UP,
                        TicketStatus.PAID_DELIVERED,
                        TicketStatus.READY_AT_BRANCH
                    ]
                };
                where.createdAt = { lt: subHours(new Date(), 48) };
                break;

            case 'TECH_COMPLETED':
                if (technicianId) where.technicianId = technicianId;
                where.status = {
                    in: [
                        TicketStatus.COMPLETED,
                        TicketStatus.DELIVERED,
                        TicketStatus.PICKED_UP,
                        TicketStatus.PAID_DELIVERED,
                        TicketStatus.READY_AT_BRANCH
                    ]
                };
                break;

            case 'BRANCH_ACTIVE':
                where.status = {
                    in: [
                        TicketStatus.NEW,
                        TicketStatus.AT_CENTER,
                        TicketStatus.IN_PROGRESS,
                        TicketStatus.DIAGNOSING,
                        TicketStatus.WAITING_FOR_PARTS,
                        TicketStatus.QC_PENDING,
                        TicketStatus.IN_TRANSIT_TO_CENTER,
                        TicketStatus.IN_TRANSIT_TO_BRANCH,
                        TicketStatus.PENDING_APPROVAL
                    ]
                };
                break;
        }

        // Fetch Data
        const tickets = await prisma.ticket.findMany({
            where,
            select: {
                id: true,
                barcode: true,
                status: true,
                createdAt: true,
                deviceBrand: true,
                deviceModel: true,
                customerName: true,
                technician: {
                    select: { name: true }
                },
                currentBranch: {
                    select: { name: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        // Map status for safer client consumption
        const safeTickets = tickets.map(t => ({
            id: t.id,
            ticketNumber: t.barcode,
            status: t.status,
            createdAt: t.createdAt.toISOString(),
            deviceName: `${t.deviceBrand} ${t.deviceModel}`.trim() || 'Unknown Device',
            customerName: t.customerName || 'Unknown',
            technicianName: t.technician?.name || '-',
            branchName: t.currentBranch?.name || '-'
        }));

        return { data: safeTickets };

    } catch (error: any) {
        console.error("Drilldown Error:", error);
        throw new Error("Failed to fetch details");
    }
}, { permission: PERMISSIONS.REPORTS_VIEW, requireCSRF: false });
