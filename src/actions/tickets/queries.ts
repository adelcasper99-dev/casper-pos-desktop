"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentUser } from "../auth";
import { getBranchFilter } from "@/lib/data-filters";
import { Prisma } from "@prisma/client";

export const getTickets = secureAction(async (filters?: {
    status?: string;
    search?: string;
    technicianId?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
}) => {
    const currentUser = await getCurrentUser();
    const branchFilter = getBranchFilter(currentUser);

    const where: Prisma.TicketWhereInput = {
        deletedAt: null,
        ...branchFilter
    };

    if (filters?.status) {
        const s = filters.status.toLowerCase();
        if (s === 'returns') {
            where.isWarrantyReturn = true;
        } else if (s === 'warranty') {
            where.isWarrantyReturn = true;
        } else {
            where.status = filters.status as any;
        }
    }

    if (filters?.technicianId) {
        where.technicianId = filters.technicianId;
    }

    if (filters?.startDate || filters?.endDate) {
        where.createdAt = {
            gte: filters.startDate ? new Date(filters.startDate) : undefined,
            lte: filters.endDate ? new Date(filters.endDate) : undefined,
        };
    }

    if (filters?.search) {
        const search = filters.search.trim();
        where.OR = [
            { barcode: { contains: search } },
            { customerName: { contains: search } },
            { customerPhone: { contains: search } },
            { deviceModel: { contains: search } }
        ];
    }

    const tickets = await prisma.ticket.findMany({
        where,
        include: {
            technician: { select: { name: true } },
            currentBranch: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' }
    });

    return { tickets };
}, { permission: PERMISSIONS.TICKET_VIEW });

export const getTicketDetails = secureAction(async (idOrBarcode: string) => {
    const ticket = await prisma.ticket.findFirst({
        where: {
            OR: [
                { id: idOrBarcode },
                { barcode: idOrBarcode }
            ],
            deletedAt: null
        },
        include: {
            technician: { select: { id: true, name: true } },
            currentBranch: { select: { name: true } },
            customer: true,
            parts: { 
                where: { deletedAt: null },
                include: { product: true }
            },
            payments: true,
            notes: { orderBy: { createdAt: 'desc' } },
            collaborators: { include: { technician: true } }
        }
    });

    return { ticket };
}, { permission: PERMISSIONS.TICKET_VIEW });

export const getAllTechnicians = secureAction(async () => {
    const techs = await prisma.user.findMany({
        where: {
            deletedAt: null,
            role: { name: { in: ['فني', 'مدير صيانة'] } }
        },
        select: { id: true, name: true, username: true }
    });
    return { technicians: techs };
}, { permission: PERMISSIONS.TICKET_VIEW });
