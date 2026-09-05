"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { Prisma, Shift } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "./auth";
import { getCurrentShiftInternal, updateShiftHeartbeat } from "./shift-management-actions";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { GL, PAYMENT_METHOD_GL_MAP } from "@/shared/constants/accounting-mappings";
import { ticketSchema } from "@/lib/validation/tickets";
import { logger } from "@/lib/logger";
import { calculateNetProfit, calculateCommission, resolveCommission } from "@/lib/commission-validation";
import { getBranchFilter } from "@/lib/data-filters";
import { TicketStatus } from "@/lib/constants";
import { handleReturnedPartStock, decrementWarehouseStock, incrementWarehouseStock } from "@/lib/stock-helpers";
import { serialize } from "@/lib/serialization";


import { getFormattedTicketNumber } from "@/lib/id-generator";

/**
 * Hardened atomic sequential ticket number generation
 */
async function getNextTicketNumber() {
    return await getFormattedTicketNumber();
}

/**
 * Helper to check if a ticket is locked (Delivered, Picked Up, etc.)
 * Returns true if the ticket is LOCKED.
 * Admins can always bypass the lock.
 */
function checkTicketLock(ticket: { status: string }, user: any) {
    if (!ticket || !user) return false;
    const canBypassLock = hasPermission(user.permissions, PERMISSIONS.TICKET_OVERRIDE);
    if (canBypassLock) return false;

    if (ticket.status === 'RETURNED_FOR_REFIX') return false;

    const lockedStatuses = ['DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'CANCELLED', 'REJECTED'];
    return lockedStatuses.includes(ticket.status);
}

/**
 * Get tickets for the main list
 */
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
        ...branchFilter // 🔒 Branch-level isolation
    };

    if (filters?.status) {
        const s = filters.status.toLowerCase();
        if (s === 'returns') {
            where.isWarrantyReturn = true;
        } else if (s === 'warranty') {
            where.warrantyExpiryDate = { gte: new Date() };
        } else if (s !== 'all') {
            where.status = s.toUpperCase();
        }
    }

    if (filters?.technicianId && filters.technicianId !== 'unassigned') {
        where.technicianId = filters.technicianId;
    } else if (filters?.technicianId === 'unassigned') {
        where.technicianId = null;
    }

    if (filters?.search) {
        where.OR = [
            { barcode: { contains: filters.search } },
            { customerName: { contains: filters.search } },
            { customerPhone: { contains: filters.search } },
            { deviceModel: { contains: filters.search } },
            { deviceImei: { contains: filters.search } },
        ];
    }

    if (filters?.branchId && filters.branchId !== 'ALL') {
        if (!branchFilter.currentBranchId) { // Only allow override if no forced branch filter (e.g. Admin)
            where.currentBranchId = filters.branchId;
        }
    }

    if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
        if (filters.endDate) {
            const endDate = new Date(filters.endDate);
            endDate.setHours(23, 59, 59, 999);
            where.createdAt.lte = endDate;
        }
    }

    const tickets = await prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
            technician: true,
            currentBranch: true,
            customer: true,
            clientUser: true,
            clientSupplier: true,
            shift: true,
            movement: true,
            completedBy: true,
        },
        take: 200,
    });

    const deliveredCount = tickets.filter(t => ['DELIVERED', 'PAID_DELIVERED', 'PICKED_UP'].includes(t.status)).length;
    const returnCount = tickets.filter(t => (t as any).returnCount > 0 || t.status === 'RETURNED_FOR_REFIX').length;
    const ratio = (deliveredCount + returnCount) > 0 ? (deliveredCount / (deliveredCount + returnCount)) * 100 : 0;

    // 🚀 Intelligence: Fetch success ratio for all customers in this batch in parallel
    const customerIds = Array.from(new Set(tickets.map(t => t.customerId).filter(Boolean))) as string[];
    
    // Get total tickets per customer
    const totalCounts = await prisma.ticket.groupBy({
        by: ['customerId'],
        where: { customerId: { in: customerIds }, deletedAt: null },
        _count: { id: true }
    });

    // Get successful (delivered) tickets per customer
    const successStatuses = ['DELIVERED', 'PAID_DELIVERED', 'PICKED_UP', 'COMPLETED'];
    const successCounts = await prisma.ticket.groupBy({
        by: ['customerId'],
        where: { 
            customerId: { in: customerIds }, 
            status: { in: successStatuses },
            deletedAt: null 
        },
        _count: { id: true }
    });

    const customerSuccessMap: Record<string, string> = {};
    customerIds.forEach(id => {
        const total = totalCounts.find(c => c.customerId === id)?._count.id || 0;
        const success = successCounts.find(c => c.customerId === id)?._count.id || 0;
        customerSuccessMap[id] = total > 0 ? ((success / total) * 100).toFixed(0) : "100";
    });

    const processedTickets = tickets.map(t => {
        // Calculate Gap: Time since last update
        const lastUpdate = new Date(t.updatedAt).getTime();
        const now = Date.now();
        const diffMs = now - lastUpdate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        let gap = "";
        if (diffDays > 0) gap = `${diffDays}d ${diffHours}h`;
        else if (diffHours > 0) gap = `${diffHours}h`;
        else gap = `${Math.floor(diffMs / 60000)}m`;

        // Calculate overdue status
        let isOverdue = false;
        if (t.expectedDuration && !['COMPLETED', 'READY_AT_BRANCH', 'DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'REJECTED'].includes(t.status)) {
            const created = new Date(t.createdAt).getTime();
            const dueTime = created + (t.expectedDuration * 60000);
            isOverdue = now > dueTime;
        }

        return {
            ...t,
            initialQuote: t.initialQuote?.toString() || "0",
            repairPrice: t.repairPrice?.toString() || "0",
            amountPaid: t.amountPaid?.toString() || "0",
            deposit: t.deposit?.toString() || "0",
            gap, 
            isOverdue,
            customerSuccessRatio: t.customerId ? customerSuccessMap[t.customerId] : "100"
        };
    });


    const overdueCount = processedTickets.filter(t => t.isOverdue).length;

    const totalSummary = await prisma.ticket.aggregate({
        where,
        _sum: {
            amountPaid: true
        }
    });

    return {
        tickets: processedTickets,
        stats: {
            delivered: deliveredCount,
            returns: returnCount,
            ratio: ratio.toFixed(1),
            totalPaid: Number(totalSummary._sum.amountPaid || 0),
            overdueCount
        }
    };
}, { permission: PERMISSIONS.TICKET_VIEW, requireCSRF: false });

/**
 * Get ticket details by ID or Barcode
 */
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
            technician: true,
            currentBranch: true,
            customer: true,
            clientUser: true,
            clientSupplier: true,
            completedBy: true,
            movement: true,
            logs: { 
                select: {
                    id: true,
                    type: true,
                    status: true,
                    metadata: true,
                    sentAt: true
                },
                orderBy: { sentAt: 'desc' },
                take: 5
            },
            notes: { orderBy: { createdAt: 'desc' } },
            parts: { include: { product: true } },
            payments: true,
            collaborators: { include: { technician: true } },
            feedback: true,
            shift: true,
            returnTickets: { select: { id: true, barcode: true } },
            parentTicket: {
                select: {
                    id: true,
                    barcode: true,
                    amountPaid: true,
                    repairPrice: true
                }
            }
        }
    });

    if (!ticket) throw new Error("Ticket not found");

    // 🔍 Auto-Link/Fallback: If no direct customer relation, try lookup by phone
    let effectiveCustomer = ticket.customer;
    if (!effectiveCustomer && ticket.customerPhone) {
        effectiveCustomer = await prisma.customer.findUnique({
            where: { phone: ticket.customerPhone }
        });
    }

    // 🚀 Intelligence Metrics Calculation
    const now = new Date();
    const lastUpdate = new Date(ticket.updatedAt);
    const diffMs = now.getTime() - lastUpdate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    let gap = '';
    if (diffDays > 0) gap = `${diffDays}d ${diffHours % 24}h`;
    else if (diffHours > 0) gap = `${diffHours}h`;
    else gap = `${Math.floor(diffMs / 60000)}m`;

    let isOverdue = false;
    if (ticket.expectedDuration && !['COMPLETED', 'READY_AT_BRANCH', 'DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'REJECTED'].includes(ticket.status)) {
        const created = new Date(ticket.createdAt).getTime();
        const dueTime = created + (ticket.expectedDuration * 60000);
        isOverdue = now.getTime() > dueTime;
    }

    // Success Ratio: Customer's historical completion rate
    const totalCustomerTickets = await prisma.ticket.count({ where: { customerId: ticket.customerId } });
    const successfulCustomerTickets = await prisma.ticket.count({ 
        where: { 
            customerId: ticket.customerId, 
            status: { in: ['COMPLETED', 'DELIVERED', 'PAID_DELIVERED', 'PICKED_UP', 'READY_AT_BRANCH'] } 
        } 
    });
    const successRatio = totalCustomerTickets > 0 ? (successfulCustomerTickets / totalCustomerTickets) * 100 : 100;

    return {
        ticket: {
            ...ticket,
            customer: effectiveCustomer,
            initialQuote: ticket.initialQuote?.toString() || "0",
            repairPrice: ticket.repairPrice?.toString() || "0",
            partsCost: ticket.partsCost?.toString() || "0",
            deposit: ticket.deposit?.toString() || "0",
            commissionAmount: ticket.commissionAmount?.toString() || "0",
            netProfit: ticket.netProfit?.toString() || "0",
            amountPaid: ticket.amountPaid?.toString() || "0",
            gap,
            isOverdue,
            successRatio,
            parts: ticket.parts.map(p => ({
                ...p,
                cost: p.cost?.toString() || "0",
                price: p.price?.toString() || "0",
            })),
            payments: ticket.payments.map(p => ({
                ...p,
                amount: p.amount?.toString() || "0",
            })),
            parentTicket: ticket.parentTicket ? {
                ...ticket.parentTicket,
                amountPaid: ticket.parentTicket.amountPaid?.toString() || "0",
                repairPrice: ticket.parentTicket.repairPrice?.toString() || "0"
            } : null
        }
    };
}, { permission: PERMISSIONS.TICKET_VIEW, requireCSRF: false });

/**
 * Create a new repair ticket
 */
export const createTicket = secureAction(async (rawData: z.infer<typeof ticketSchema> & { csrfToken?: string, idempotencyKey?: string }) => {
    const { idempotencyKey, ...schemaRaw } = rawData;
    const data = ticketSchema.parse(schemaRaw);
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Unauthorized");

    // SHIFT GUARD: Ensure active shift exists
    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error("No active shift. Please open a shift first.");
    }
    const currentShift = shiftResult.shift;

    let branchId = currentUser.branchId;
    if (!branchId) {
        const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'Admin' || currentUser.role === 'مدير النظام' || currentUser.role === 'المالك';
        if (isAdmin) {
            const { ensureMainBranch } = await import('@/lib/ensure-main-branch');
            branchId = await ensureMainBranch().catch(() => null);
        }
    }

    if (!branchId) {
        throw new Error("User must be assigned to a branch to create tickets");
    }

    // 1. Sequential ID Generation with Retry Loop
    let barcode = '';
    let retries = 0;
    const MAX_RETRIES = 3;
    while (retries < MAX_RETRIES) {
        barcode = await getNextTicketNumber();
        const existing = await prisma.ticket.findUnique({ where: { barcode } });
        if (!existing) break;
        await new Promise(res => setTimeout(res, Math.random() * 200));
        retries++;
    }
    if (retries >= MAX_RETRIES) throw new Error("System is busy (ID Collision), please try again.");

    // 2. SMART LINKING: User / Supplier / Customer by Phone
    let customerId = (data as any).customerId;
    let clientUserId: string | undefined = undefined;
    let clientSupplierId: string | undefined = undefined;

    const result = await prisma.$transaction(async (tx: any) => {
        // TK-02: Secure Customer Linking (Atomic Upsert)
        if (data.customerPhone && data.customerPhone.trim().length > 0) {
            const normalizedPhone = data.customerPhone.trim();

            const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
            const phoneCheck = await checkGlobalPhoneUniqueness(normalizedPhone);

            if (!phoneCheck.unique) {
                if (phoneCheck.usedBy === 'USER') clientUserId = phoneCheck.entityId;
                else if (phoneCheck.usedBy === 'SUPPLIER') clientSupplierId = phoneCheck.entityId;
                else if (phoneCheck.usedBy === 'CUSTOMER') customerId = phoneCheck.entityId;
            } else if (!customerId) {
                // Find existing customer by phone within tenant context or create new
                const existingCustomer = await tx.customer.findFirst({
                    where: { phone: normalizedPhone }
                });

                if (existingCustomer) {
                    if (data.customerName && existingCustomer.name !== data.customerName) {
                        await tx.customer.update({
                            where: { id: existingCustomer.id },
                            data: { name: data.customerName }
                        });
                    }
                    customerId = existingCustomer.id;
                } else {
                    const newCustomer = await tx.customer.create({
                        data: {
                            name: data.customerName,
                            phone: normalizedPhone,
                            balance: 0
                        }
                    });
                    customerId = newCustomer.id;
                }
            }
        }

        // Idempotency Guard
        if (idempotencyKey) {
            const existing = await tx.ticket.findUnique({
                where: { idempotencyKey },
                select: { id: true, barcode: true }
            });
            if (existing) {
                logger.info(`[Ticket] Idempotency hit for ${idempotencyKey}`);
                return existing;
            }
        }

        // Create ticket with all links
        const ticket = await tx.ticket.create({
            data: {
                barcode,
                customerName: data.customerName,
                customerPhone: data.customerPhone,
                customerEmail: data.customerEmail || null,
                customerId: customerId || null,
                clientUserId: clientUserId || null,
                clientSupplierId: clientSupplierId || null,
                deviceBrand: data.deviceBrand,
                deviceModel: data.deviceModel,
                deviceImei: data.deviceImei || null,
                deviceColor: data.deviceColor || null,
                issueDescription: data.issueDescription,
                conditionNotes: data.conditionNotes || null,
                securityCode: data.securityCode || null,
                patternData: data.patternData || null,
                status: 'NEW',
                currentBranchId: branchId,
                initialQuote: new Decimal(data.repairPrice || 0),
                repairPrice: new Decimal(data.repairPrice || 0),
                shiftId: currentShift.id,
                expectedDuration: data.expectedDuration || null,
                idempotencyKey: idempotencyKey || null,
            }
        });

        // Log creation
        await tx.ticketNote.create({
            data: {
                ticketId: ticket.id,
                text: "Ticket created",
                author: currentUser.name || currentUser.username || "System",
                isInternal: true
            }
        });

        // Increment shift ticket count
        await tx.shift.update({
            where: { id: currentShift.id },
            data: { totalTickets: { increment: 1 }, lastHeartbeat: new Date() }
        });

        return ticket;
    }, { timeout: 60000 });

    revalidatePath("/ar/maintenance/tickets");
    revalidateTag("dashboard");

    return { success: true, ticketId: result.id, barcode: result.barcode };
}, { permission: PERMISSIONS.TICKET_EDIT });

// 🔄 SYNC TOOL: Create customers from existing tickets AND POS Sales
export const syncCustomersFromActivity = secureAction(async () => {
    // 1. Sync from Tickets (Unlinked)
    const unlinkedTickets = await prisma.ticket.findMany({
        where: {
            customerId: null,
            customerPhone: { not: '' }
        },
        select: { id: true, customerName: true, customerPhone: true },
        take: 1000 // Safety cap for batch sync
    });

    let createdCount = 0;
    let linkedTicketsCount = 0;

    const phonesToProcess = new Set<string>();
    unlinkedTickets.forEach(t => {
        if (t.customerPhone && t.customerPhone.length > 5) phonesToProcess.add(t.customerPhone);
    });

    // 2. Sync from POS Sales (No direct link field yet, but we need to ensure they exist)
    const sales = await prisma.sale.groupBy({
        by: ['customerPhone'],
        where: {
            customerPhone: { not: null }
        },
        _max: {
            customerName: true
        }
    });

    sales.forEach(s => {
        if (s.customerPhone && s.customerPhone.length > 5) phonesToProcess.add(s.customerPhone!);
    });

    // 3. Find which ones already exist
    const phoneArray = Array.from(phonesToProcess);
    const existingCustomers = await prisma.customer.findMany({
        where: { phone: { in: phoneArray } },
        select: { phone: true, id: true }
    });

    const existingMap = new Map(existingCustomers.map(c => [c.phone, c.id]));

    // 4. Creation Loop
    for (const phone of phoneArray) {
        if (existingMap.has(phone)) continue;

        // Determine name (Prioritize Ticket name, then Sale name)
        const ticketMatch = unlinkedTickets.find(t => t.customerPhone === phone);
        const saleMatch = sales.find(s => s.customerPhone === phone);

        const name = ticketMatch?.customerName || saleMatch?._max.customerName || 'Pos Customer';

        try {
            const newC = await prisma.customer.create({
                data: {
                    name,
                    phone,
                    balance: 0
                }
            });
            existingMap.set(phone, newC.id);
            createdCount++;
        } catch (e) {
            console.error(`Failed to create customer for ${phone}`, e);
        }
    }

    // 5. Link Tickets (Sales don't have customerId yet, so we skip linking them for now - just aggregated visibility)
    // We only link tickets that were unlinked
    for (const ticket of unlinkedTickets) {
        if (!ticket.customerPhone) continue;
        const cid = existingMap.get(ticket.customerPhone);
        if (cid) {
            await prisma.ticket.update({
                where: { id: ticket.id },
                data: { customerId: cid }
            });
            linkedTicketsCount++;
        }
    }

    revalidatePath('/customers');
    return { success: true, created: createdCount, linkedTickets: linkedTicketsCount };
}, { permission: 'MANAGE_SETTINGS', requireCSRF: false });


/**
 * Assign a technician to a ticket
 */
export const assignTechnician = secureAction(async (data: { ticketId: string, technicianId: string, csrfToken?: string }) => {
    const { ticketId, technicianId } = data;
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const existing = await prisma.ticket.findUnique({ 
        where: { id: ticketId },
        include: { technician: true }
    });
    
    if (!existing) throw new Error("Ticket not found");

    if (checkTicketLock(existing, user)) {
        throw new Error("هذه التذكرة مغلقة ولا يمكن تغيير الفني المسؤول.");
    }

    // 🛡️ STRICT WARRANTY GUARD: Block reassignment for warranty returns unless Admin/Override
    if (existing.isWarrantyReturn) {
        const canOverride = hasPermission(user.permissions, PERMISSIONS.TICKET_OVERRIDE);
        if (!canOverride) {
            throw new Error("لا يمكن إعادة تعيين الفني لتذكرة ضمان إلا من قبل مدير النظام (صلاحية تجاوز).");
        }
    }


    const result = await prisma.$transaction(async (tx) => {
        const technician = await tx.technician.findUnique({
            where: { id: technicianId },
            select: { commissionRate: true, name: true }
        });

        if (!technician) throw new Error("Technician profile not found");

        const oldTechName = existing.technician?.name || "غير مسند";
        const newTechName = technician.name || "فني غير معروف";

        const ticket = await tx.ticket.update({
            where: { id: ticketId },
            data: {
                technicianId,
                status: "IN_PROGRESS",
                startedAt: new Date(),
                commissionRate: technician.commissionRate
            }
        });

        await tx.ticketNote.create({
            data: {
                ticketId,
                text: existing.isWarrantyReturn 
                    ? `⚠️ إعادة تعيين استثنائية لتذكرة ضمان: تم النقل من [${oldTechName}] إلى [${newTechName}]`
                    : `Technician assigned: ${newTechName} (Comm: ${technician.commissionRate}%)`,
                author: user.name || user.username || "System",
                isInternal: true
            }
        });

        return ticket;
    });

    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    return { success: true, ticket: result };
}, { permission: PERMISSIONS.TICKET_ASSIGN });


/**
 * Update core ticket details
 */
export const updateTicketDetails = secureAction(async (ticketId: string, updates: {
    repairPrice?: number;
    issueDescription?: string;
    securityCode?: string;
    technicianId?: string;
    expectedDuration?: number;
    patternData?: string;
    csrfToken?: string;
}) => {
    const data: Prisma.TicketUpdateInput = {};
    if (updates.repairPrice !== undefined) data.repairPrice = new Decimal(updates.repairPrice);
    if (updates.issueDescription !== undefined) data.issueDescription = updates.issueDescription;
    if (updates.securityCode !== undefined) data.securityCode = updates.securityCode;
    if (updates.patternData !== undefined) data.patternData = updates.patternData;
    if (updates.technicianId !== undefined) {
        if (updates.technicianId) {
            data.technician = { connect: { id: updates.technicianId } };
        } else {
            data.technician = { disconnect: true };
        }
    }
    if (updates.expectedDuration !== undefined) data.expectedDuration = updates.expectedDuration;

    const existing = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { technician: true } });
    const currentUser = await getCurrentUser();
    if (existing && checkTicketLock(existing, currentUser as any)) {
        throw new Error("هذه التذكرة مغلقة ولا يمكن تعديل بياناتها.");
    }

    const ticket = await prisma.ticket.update({
        where: { id: ticketId },
        data
    });

    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    revalidatePath("/ar/maintenance/tickets");
    return { success: true, ticket };
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Update ticket status (Completed, Delivered, etc.)
 */
export const updateTicketStatus = secureAction(async (data: {
    ticketId: string;
    status: string;
    repairPrice?: number;
    partsCost?: number;
    technicianId?: string;
    csrfToken?: string;
}) => {
    const { ticketId, status, repairPrice, partsCost, technicianId } = data;
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const existingTicket = await prisma.ticket.findFirst({
        where: { id: ticketId },
        include: { parts: true, payments: true }
    });

    if (!existingTicket) throw new Error("Ticket not found");

    // NEW VALIDATION: Cannot transition to IN_PROGRESS without a technician assigned
    if (status === 'IN_PROGRESS' && !existingTicket.technicianId && !technicianId) {
        throw new Error("لا يمكن بدء الإصلاح قبل تعيين مهندس للتذكرة");
    }

    const result = await prisma.$transaction(async (tx) => {
        // Workflow Validation: Prevent illogical transitions
        if (existingTicket.status === 'DELIVERED' && status !== 'RETURNED_FOR_REFIX') {
            throw new Error("Delivered tickets can only be changed to 'RETURNED_FOR_REFIX'");
        }
        if (existingTicket.status === 'PAID_DELIVERED' && status !== 'RETURNED_FOR_REFIX') {
            throw new Error("Finalized tickets can only be changed to 'RETURNED_FOR_REFIX'");
        }

        const updateData: Prisma.TicketUpdateInput = {
            status,
            previousStatus: existingTicket.status
        };

        if (status === 'COMPLETED') {
            // NEW VALIDATION: Must have at least one part or service
            if (!existingTicket.parts || existingTicket.parts.length === 0) {
                throw new Error("لا يمكن تحويل التذكرة إلى تم الإصلاح بدون إضافة بنود تكلفة (قطع غيار أو خدمات)");
            }

            updateData.completedAt = new Date();
            const compId = technicianId || existingTicket.technicianId;
            if (compId) {
                updateData.completedBy = { connect: { id: compId } };

                const leadTech = await prisma.technician.findUnique({ 
                    where: { id: compId },
                    include: { commissionRule: true }
                });

                if (leadTech) {
                    // Fetch final parts cost and repair price with Decimal precision
                    const ticketTotal = await prisma.ticket.findUnique({
                        where: { id: ticketId },
                        select: { repairPrice: true, partsCost: true }
                    });

                    const currentRepairPrice = new Decimal(ticketTotal?.repairPrice?.toString() || '0');
                    const currentPartsCost = new Decimal(ticketTotal?.partsCost?.toString() || '0');
                    const netProfit = calculateNetProfit(currentRepairPrice, currentPartsCost);

                    const { commissionAmount, commissionRate } = resolveCommission(leadTech, netProfit);

                    updateData.commissionRate = commissionRate;
                    updateData.commissionAmount = commissionAmount;
                    updateData.netProfit = netProfit;
                }
            }
        }

        if (status === 'DELIVERED') {
            updateData.deliveredAt = new Date();
            // Warranty date is now set ONLY upon payment/delivery confirmation to ensure it starts from the receipt date.
        }

        const ticket = await tx.ticket.update({
            where: { id: ticketId },
            data: updateData
        });

        // B19 Fix: Record Maintenance COGS (Parts Cost) in GL when COMPLETED
        if (status === 'COMPLETED' && existingTicket.status !== 'COMPLETED') {
            const inventoryParts = await tx.ticketPart.findMany({
                where: { ticketId: ticket.id, status: 'ACTIVE', productId: { not: null } }
            });
            const inventoryPartsCost = inventoryParts.reduce((sum, p) => sum.plus(new Decimal(p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));
            
            if (inventoryPartsCost.gt(0)) {
                await AccountingEngine.recordMaintenanceCOGS({
                    ticketId: ticket.id,
                    barcode: ticket.barcode,
                    partsCost: inventoryPartsCost,
                    branchId: user.branchId ?? undefined
                }, tx);
            }
        }

        // Add history note
        await tx.ticketNote.create({
            data: {
                ticketId,
                text: `Status changed to: ${status}`,
                author: user.name || user.username || "System",
                isInternal: true
            }
        });

        return ticket;
    }, { timeout: 60000 });
    
    // 🚀 Intelligence-Aware Notifications (Async/Non-blocking)
    const notificationTriggers = ['COMPLETED', 'READY_AT_BRANCH', 'REJECTED', 'IN_PROGRESS', 'PICKED_UP'];
    if (notificationTriggers.includes(status)) {
        // We use dynamic import to ensure the service is loaded only when needed 
        // and to keep this action's initial bundle smaller.
        import('@/lib/notification-service').then(({ NotificationService }) => {
            NotificationService.sendTicketStatusNotification(ticketId, status);
        }).catch(err => console.error('[Notification Trigger Error]:', err));
    }

    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    revalidatePath("/ar/maintenance/tickets");
    revalidateTag("dashboard");

    return { success: true, ticket: result };
}, { permission: PERMISSIONS.TICKET_WORKFLOW });

/**
 * Log a manual notification attempt (e.g. WhatsApp Quick Button)
 */
export const logTicketNotification = secureAction(async (data: {
    ticketId: string;
    type: string;
    status: string;
    metadata?: any;
}) => {
    const { ticketId, type, status, metadata } = data;
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    // 🛡️ 60-second Deduplication Guard:
    // Prevents double-send when manual button is clicked immediately after auto-trigger
    const recentDup = await prisma.notificationLog.findFirst({
        where: {
            ticketId,
            type: 'WHATSAPP',
            metadata: { contains: `"messageType":"${metadata?.messageType || status}"` },
            sentAt: { gte: new Date(Date.now() - 60000) }, // 60-second window
        },
        select: { id: true }
    });
    if (recentDup) return { success: true, log: recentDup, skipped: true };

    const log = await prisma.notificationLog.create({
        data: {
            ticketId,
            type,
            status,
            metadata: metadata ? JSON.stringify({
                ...metadata,
                staffName: user.name || user.username,
                source: 'MANUAL_UI'
            }) : JSON.stringify({
                staffName: user.name || user.username,
                source: 'MANUAL_UI'
            })
        }
    });

    return { success: true, log };
}, { permission: PERMISSIONS.TICKET_VIEW }); // View permission is enough to log communication attempts

/**
 * Undo the last status change for a ticket
 */
export const undoTicketStatus = secureAction(async (data: {
    ticketId: string;
    csrfToken?: string;
}) => {
    const { ticketId } = data;
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId }
    });

    if (!ticket) throw new Error("Ticket not found");
    if (!ticket.previousStatus) throw new Error("No previous status found to undo");

    // NEW VALIDATION: Block undoing PAID_DELIVERED tickets. Must use Return flow.
    if (ticket.status === 'PAID_DELIVERED') {
        throw new Error("لا يمكن التراجع عن تذكرة مدفوعة. يرجى استخدام خيار 'مرتجع'");
    }

    const result = await prisma.$transaction(async (tx) => {
        const updatedTicket = await tx.ticket.update({
            where: { id: ticketId },
            data: {
                status: ticket.previousStatus!,
                previousStatus: null // Clear previous status after undo to prevent infinite loops/confusion
            }
        });

        await tx.ticketNote.create({
            data: {
                ticketId,
                text: `🔄 Undo: Status reverted from ${ticket.status} to ${ticket.previousStatus}`,
                author: user.name || user.username || "System",
                isInternal: true
            }
        });

        return updatedTicket;
    }, { timeout: 60000 });

    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    revalidatePath("/ar/maintenance/tickets");
    revalidateTag("dashboard");

    return { success: true, ticket: result };
}, { permission: PERMISSIONS.TICKET_WORKFLOW });

/**
 * Reject a ticket with a required reason (Admin/Supervisor only)
 */
export const rejectTicket = secureAction(async (data: {
    ticketId: string;
    reason: string;
    refundDeposit?: boolean;
    refundMethod?: 'CASH' | 'ACCOUNT';
    csrfToken?: string;
}) => {
    const { ticketId, reason, refundDeposit = false, refundMethod = 'CASH' } = data;
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    // Check if user has override or workflow admin permissions
    const canReject = hasPermission(user.permissions, PERMISSIONS.TICKET_OVERRIDE) || hasPermission(user.permissions, PERMISSIONS.TICKET_WORKFLOW);
    if (!canReject) {
        throw new Error("لا يمكنك رفض التذكرة. يتطلب الأمر صلاحية المدير أو المشرف.");
    }

    // Validate reason is provided
    if (!reason || reason.trim().length === 0) {
        throw new Error("يرجى إدخال سبب الرفض");
    }

    const existingTicket = await prisma.ticket.findUnique({
        where: { id: ticketId }
    });

    if (!existingTicket) throw new Error("Ticket not found");

    // Check if ticket is already in a finalized state
    if (['REJECTED', 'PAID_DELIVERED', 'VOIDED'].includes(existingTicket.status)) {
        throw new Error("لا يمكن رفض هذه التذكرة في حالتها الحالية");
    }

    const result = await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.update({
            where: { id: ticketId },
            data: {
                status: TicketStatus.REJECTED,
                previousStatus: existingTicket.status,
                rejectionReason: reason.trim(),
                rejectedAt: new Date(),
                rejectedBy: user.id
            }
        });

        // Add history note
        await tx.ticketNote.create({
            data: {
                ticketId,
                text: `تم رفض التذكرة. السبب: ${reason.trim()}`,
                author: user.name || user.username || "System",
                isInternal: true
            }
        });

        // Handle Automatic Deposit Refund if requested and deposit exists
        const amountPaidDec = new Decimal(existingTicket.amountPaid?.toString() || '0');
        if (refundDeposit && amountPaidDec.gt(0)) {
            const shiftResult = await getCurrentShift(user.id);
            if (!shiftResult.success || !shiftResult.shift) {
                throw new Error("لا توجد وردية مفتوحة لصرف العربون من الدرج. يرجى فتح وردية أولاً.");
            }
            const currentShift = shiftResult.shift;

            if (refundMethod === 'CASH') {
                let defaultTreasuryId: string | null = null;
                if (user.branchId) {
                    const defaultTreasury = await tx.treasury.findFirst({
                        where: { branchId: user.branchId, isDefault: true }
                    });
                    if (defaultTreasury) defaultTreasuryId = defaultTreasury.id;
                }
                if (!defaultTreasuryId) {
                    throw new Error("لا يوجد صندوق افتراضي لهذا الفرع.");
                }

                const treasury = await tx.treasury.findUnique({ where: { id: defaultTreasuryId } });
                if (treasury && new Decimal(treasury.balance?.toString() || '0').lt(amountPaidDec)) {
                    throw new Error(`رصيد الدرج (${treasury.balance}) غير كافٍ لصرف العربون (${amountPaidDec}).`);
                }

                // Cross-shift check
                const priorPayments = await tx.repairPayment.findMany({
                    where: { ticketId: existingTicket.id, type: { in: ['DEPOSIT', 'PAYMENT'] } },
                    orderBy: { recordedAt: 'asc' }
                });
                const hasPriorShiftDeposit = priorPayments.some(p => new Date(p.recordedAt) < new Date(currentShift.openedAt));

                if (hasPriorShiftDeposit) {
                    await tx.shift.update({
                        where: { id: currentShift.id },
                        data: {
                            crossShiftRefundsIssued: { increment: amountPaidDec },
                            totalRefunds: { increment: amountPaidDec }
                        }
                    });
                } else {
                    await tx.shift.update({
                        where: { id: currentShift.id },
                        data: {
                            totalCashRefunds: { increment: amountPaidDec },
                            totalTicketRevenueCash: { increment: amountPaidDec.negated() },
                            totalRefunds: { increment: amountPaidDec }
                        }
                    });
                }

                await tx.transaction.create({
                    data: {
                        type: 'EXPENSE',
                        amount: amountPaidDec,
                        paymentMethod: 'CASH',
                        description: `صرف واسترداد عربون تذكرة #${existingTicket.barcode} للعميل (رفض التذكرة)`,
                        shiftId: currentShift.id,
                        treasuryId: defaultTreasuryId
                    }
                });

                await tx.treasury.update({
                    where: { id: defaultTreasuryId },
                    data: { balance: { decrement: amountPaidDec } }
                });
            } else if (refundMethod === 'ACCOUNT' && existingTicket.customerId) {
                await tx.customer.update({
                    where: { id: existingTicket.customerId },
                    data: { balance: { increment: amountPaidDec } }
                });
                await tx.customerTransaction.create({
                    data: {
                        customerId: existingTicket.customerId,
                        type: 'CREDIT',
                        amount: amountPaidDec,
                        description: `إيداع عربون مسترد لتذكرة #${existingTicket.barcode} في الحساب (رفض التذكرة)`,
                        reference: existingTicket.id,
                        createdBy: user.id,
                        branchId: user.branchId || undefined
                    }
                });
            }

            const refundIdempotencyKey = `REFUND_REJECT_${existingTicket.id}_${amountPaidDec.toFixed(2)}`;
            await tx.repairPayment.create({
                data: {
                    ticketId: existingTicket.id,
                    type: 'REFUND',
                    amount: amountPaidDec.negated(),
                    method: refundMethod,
                    reference: refundIdempotencyKey,
                    recordedBy: user.name || user.username || 'System'
                }
            });

            // Double-entry GL 2150 relief
            await AccountingEngine.recordTransaction({
                description: `رد عربون تذكرة #${existingTicket.barcode} عند رفض الصيانة`,
                reference: existingTicket.id,
                ticketId: existingTicket.id,
                branchId: user.branchId ?? undefined,
                idempotencyKey: refundIdempotencyKey,
                lines: [
                    {
                        accountCode: GL.LIABILITIES.CUSTOMER_DEPOSITS,
                        debit: amountPaidDec,
                        credit: new Decimal(0),
                        description: `إخلاء ذمة عربون العميل عند رفض تذكرة #${existingTicket.barcode}`
                    },
                    {
                        accountCode: refundMethod === 'ACCOUNT' ? GL.ASSETS.RECEIVABLES : GL.ASSETS.CASH,
                        debit: new Decimal(0),
                        credit: amountPaidDec,
                        description: refundMethod === 'ACCOUNT' ? 'تخفيض حساب العميل' : 'صرف نقدي من الدرج'
                    }
                ]
            }, tx);

            // Set amountPaid to 0 on ticket
            await tx.ticket.update({
                where: { id: ticketId },
                data: {
                    amountPaid: new Decimal(0),
                    paymentStatus: 'unpaid'
                }
            });

            await tx.ticketNote.create({
                data: {
                    ticketId,
                    text: `تم صرف واسترداد العربون المسجل (${amountPaidDec} ج.م) للعميل نقداً بمناسبة رفض التذكرة.`,
                    author: user.name || user.username || "System",
                    isInternal: true
                }
            });
        }

        // Create audit log
        await tx.auditLog.create({
            data: {
                user: user.id,
                action: "TICKET_REJECTED",
                entityType: "Ticket",
                entityId: ticket.id,
                newData: JSON.stringify({
                    barcode: ticket.barcode,
                    reason: reason.trim(),
                    refundedDeposit: refundDeposit ? amountPaidDec.toString() : null,
                    previousStatus: existingTicket.status
                }),
                branchId: user.branchId
            }
        });

        return ticket;
    }, { timeout: 60000 });

    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    revalidatePath("/ar/maintenance/tickets");
    revalidateTag("dashboard");

    return { success: true, ticket: result };
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Add a note to a ticket
 */
export const addTicketNote = secureAction(async (data: {
    ticketId: string;
    text: string;
    isInternal?: boolean;
    csrfToken?: string;
}) => {
    const { ticketId, text, isInternal = true } = data;
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId }
    });
    if (ticket && checkTicketLock(ticket, user)) {
        throw new Error("هذه التذكرة مغلقة ولا يمكن إضافة أي شيء إليها. (إلا في حالة المرتجع)");
    }

    const note = await prisma.ticketNote.create({
        data: {
            ticketId,
            text,
            author: user.name || user.username || "System",
            isInternal
        }
    });

    revalidatePath(`/tickets/${ticketId}`);
    return { success: true, note };
});




/**
 * Refund a ticket payment
 */
export const refundTicket = secureAction(async (data: {
    ticketId: string;
    amount: number;
    reason: string;
    csrfToken?: string;
}) => {
    const { ticketId, amount, reason } = data;
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    // SHIFT GUARD
    const shiftResult = await getCurrentShiftInternal({ userId: user.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error("No active shift.");
    }
    const currentShift = shiftResult.shift;

    const result = await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.findFirst({
            where: { OR: [{ id: ticketId }, { barcode: ticketId }] },
            include: { payments: true }
        });
        if (!ticket) throw new Error("Ticket not found");
        const allowedStatuses = ['DELIVERED', 'PAID_DELIVERED', 'RETURNED_FOR_REFIX'];
        if (!allowedStatuses.includes(ticket.status)) {
            throw new Error("Cannot refund this ticket in its current status.");
        }
        const currentPaid = Number(ticket.amountPaid) || 0;
        if (!amount || amount <= 0) throw new Error("Invalid refund amount.");
        if (amount > currentPaid) throw new Error("Refund amount exceeds paid amount.");

        const lastPayment = ticket.payments.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
        const refundMethod = lastPayment?.method || ticket.paymentMethod || 'CASH';

        // 1. Create refund record
        const payment = await tx.repairPayment.create({
            data: {
                ticketId,
                amount: new Decimal(amount),
                type: 'REFUND',
                method: refundMethod,
                reference: reason,
                recordedBy: user.name || user.username || "System"
            }
        });

        // 2. Update financials
        const newAmountPaid = currentPaid - amount;
        const repairPrice = Number(ticket.repairPrice) || 0;
        let paymentStatus = 'partial';
        if (newAmountPaid <= 0) paymentStatus = 'unpaid';
        else if (repairPrice > 0 && newAmountPaid >= repairPrice) paymentStatus = 'paid';
        await tx.ticket.update({
            where: { id: ticketId },
            data: {
                amountPaid: { decrement: amount },
                paymentStatus
            }
        });

        if (refundMethod === 'ACCOUNT' || refundMethod === 'DEFERRED') {
            if (!ticket.customerId) throw new Error("Customer is required for account refunds.");

            await tx.customerTransaction.create({
                data: {
                    customerId: ticket.customerId,
                    type: 'CREDIT',
                    amount: new Decimal(amount),
                    description: `Ticket #${ticket.barcode} - Refund`,
                    reference: ticket.id,
                    createdBy: user.id
                }
            });

            await tx.customer.update({
                where: { id: ticket.customerId },
                data: { balance: { decrement: new Decimal(amount) } }
            });

            await tx.shift.update({
                where: { id: currentShift.id },
                data: {
                    totalRefunds: { increment: new Decimal(amount) },
                    totalAccountRefunds: { increment: new Decimal(amount) },
                    lastHeartbeat: new Date()
                }
            });
        } else {
            const absAmount = new Decimal(amount);
            const shiftUpdate: any = {
                totalRefunds: { increment: absAmount },
                lastHeartbeat: new Date()
            };

            switch (refundMethod) {
                case 'CASH':
                    shiftUpdate.totalCashRefunds = { increment: absAmount };
                    shiftUpdate.totalTicketRevenueCash = { increment: absAmount.negated() };
                    break;
                case 'VISA':
                case 'CARD':
                case 'MASTERCARD':
                    shiftUpdate.totalTicketRevenueCard = { increment: absAmount.negated() };
                    break;
                case 'WALLET':
                case 'VODAFONE_CASH':
                    shiftUpdate.totalTicketRevenueWallet = { increment: absAmount.negated() };
                    break;
                case 'INSTAPAY':
                    shiftUpdate.totalTicketRevenueInstapay = { increment: absAmount.negated() };
                    break;
            }

            await tx.shift.update({
                where: { id: currentShift.id },
                data: shiftUpdate
            });

            const treasury = await tx.treasury.findFirst({
                where: { branchId: user.branchId!, isDefault: true }
            });

            if (treasury) {
                await tx.transaction.create({
                    data: {
                        type: 'REFUND',
                        amount: new Decimal(amount).negated(),
                        paymentMethod: refundMethod,
                        description: `Refund: Ticket #${ticket.barcode}`,
                        shiftId: currentShift.id,
                        treasuryId: treasury.id
                    }
                });

                await tx.treasury.update({
                    where: { id: treasury.id },
                    data: { balance: { decrement: amount } }
                });
            }
        }

        const je = await AccountingEngine.recordRefund({
            amount,
            method: refundMethod,
            description: `Refund: Ticket #${ticket.barcode}`,
            reference: ticketId,
            ticketId: ticketId,
            cogsReversal: 0, // No COGS reversal on simple refund
            branchId: user.branchId ?? undefined
        }, tx);

        if (je) {
            await tx.repairPayment.update({
                where: { id: payment.id },
                data: { journalEntryId: je.id }
            });
        }

        return payment;
    }, { timeout: 60000 });

    revalidatePath(`/tickets/${ticketId}`);
    return { success: true, refund: result };
}, { permission: PERMISSIONS.POS_REFUND });

/**
 * Soft delete a ticket
 */
export const softDeleteTicket = secureAction(async (data: {
    ticketId: string;
    reason: string;
    csrfToken?: string;
}) => {
    const { ticketId, reason } = data;
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Fetch comprehensive ticket data
    const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
            parts: { where: { status: 'ACTIVE' } },
            payments: true,
            technician: true,
            customer: true,
            parentTicket: true
        }
    });

    if (!ticket) throw new Error("التذكرة غير موجودة.");
    if (ticket.deletedAt) throw new Error("التذكرة ممسوحة بالفعل.");

    // 2. Shift Guard if money needs to be reversed
    const amountToRefund = Number(ticket.amountPaid) || 0;
    let currentShift: Shift | null = null;
    if (amountToRefund > 0) {
        const shiftResult = await getCurrentShiftInternal({ userId: user.id });
        if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
            throw new Error("يجب فتح وردية أولاً للتراجع عن المبالغ المدفوعة في التذكرة.");
        }
        currentShift = shiftResult.shift;
    }

    const result = await prisma.$transaction(async (tx) => {
        // --- Part 1: Stock Reversal ---
        let totalPartsCostReversal = new Decimal(0);
        for (const part of ticket.parts) {
            if (part.productId) {
                totalPartsCostReversal = totalPartsCostReversal.plus(new Decimal(part.cost || 0).mul(part.quantity));
                await handleReturnedPartStock(tx, {
                    productId: part.productId,
                    warehouseId: ticket.technician?.warehouseId || part.warehouseId || null,
                    quantity: new Decimal(part.quantity).toNumber(),
                    isDamaged: false, // Return implies parts are good
                    reason: `مسح التذكرة #${ticket.barcode}: ${reason}`,
                    performedById: user.id
                });
            }
        }

        // --- Part 2: Financial Reversal (If money involved) ---
        if (amountToRefund > 0 && currentShift) {
            const lastPayment = ticket.payments.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
            const refundMethod = lastPayment?.method || ticket.paymentMethod || 'CASH';

            // 1. RepairPayment (Audit)
            const payment = await tx.repairPayment.create({
                data: {
                    ticketId: ticket.id,
                    type: 'REFUND',
                    amount: new Decimal(amountToRefund),
                    method: refundMethod,
                    reference: `مسح التذكرة: ${reason}`,
                    recordedBy: user.name || user.username || 'System'
                }
            });

            // 2. Shift Totals
            if (refundMethod !== 'ACCOUNT') {
                await tx.shift.update({
                    where: { id: currentShift.id },
                    data: {
                        totalRefunds: { increment: amountToRefund },
                        totalCashRefunds: { increment: refundMethod === 'CASH' ? amountToRefund : 0 }
                    }
                });

                // 3. Treasury & Transaction
                const defaultTreasury = await tx.treasury.findFirst({
                    where: { branchId: user.branchId!, isDefault: true }
                });

                if (!defaultTreasury && user.branchId) {
                    throw new Error("لا يوجد صندوق افتراضي لهذا الفرع. يرجى تكوين صندوق قبل إتمام الاسترجاع.");
                }

                if (defaultTreasury) {
                    await tx.transaction.create({
                        data: {
                            type: 'REFUND',
                            amount: new Decimal(-amountToRefund),
                            paymentMethod: refundMethod,
                            description: `Delete Ticket #${ticket.barcode} - ${reason}`,
                            shiftId: currentShift.id,
                            treasuryId: defaultTreasury.id
                        }
                    });

                    await tx.treasury.update({
                        where: { id: defaultTreasury.id },
                        data: { balance: { decrement: amountToRefund } }
                    });
                }
            } else if (ticket.customerId) {
                // 4. Customer Balance (Account Payment)
                await tx.customer.update({
                    where: { id: ticket.customerId },
                    data: { balance: { decrement: amountToRefund } }
                });

                await tx.customerTransaction.create({
                    data: {
                        customerId: ticket.customerId,
                        type: 'CREDIT',
                        amount: new Decimal(-amountToRefund),
                        description: `Ticket #${ticket.barcode} Deleted - Refund to Account`,
                        reference: ticket.id,
                        createdBy: user.id
                    }
                });
            }

            // 5. Accounting
            const je = await AccountingEngine.recordRefund({
                amount: amountToRefund,
                method: refundMethod,
                description: `Delete Ticket: #${ticket.barcode}`,
                reference: ticket.id,
                ticketId: ticket.id,
                cogsReversal: totalPartsCostReversal,
                branchId: user.branchId ?? undefined
            }, tx);

            if (je) {
                await tx.repairPayment.update({
                    where: { id: payment.id },
                    data: { journalEntryId: je.id }
                });
            }
        }

        // --- Part 3: Relationship Cleanup ---
        if (ticket.parentTicketId) {
            await tx.ticket.update({
                where: { id: ticket.parentTicketId },
                data: { returnCount: { decrement: 1 } }
            });
        }

        // --- Part 4: Ticket & Part Deletion ---
        await tx.ticketPart.updateMany({
            where: { ticketId: ticket.id, status: 'ACTIVE' },
            data: { 
                status: 'REFUNDED',
                deletedAt: new Date() 
            }
        });

        const deletedTicket = await tx.ticket.update({
            where: { id: ticketId },
            data: {
                deletedAt: new Date(),
                status: TicketStatus.VOIDED,
                repairPrice: new Decimal(0),
                partsCost: new Decimal(0),
                netProfit: new Decimal(0),
                commissionAmount: new Decimal(0),
                amountPaid: new Decimal(0),
                paymentStatus: 'refunded'
            }
        });

        // 6. Comprehensive Accounting Reversal (T-02)
        const { FinancialReversalService } = await import('@/lib/financial-reversal-service');
        await FinancialReversalService.reverseAccountingEntries(tx, ticketId, `مسح التذكرة: ${reason}`, "ticketId");

        // --- Part 5: Final Audit Log ---
        await tx.auditLog.create({
            data: {
                entityType: 'TICKET',
                entityId: ticketId,
                action: 'SOFT_DELETE',
                reason,
                user: user.name || user.username || "Unknown"
            }
        });

        // Reverse the original distribution journal entry if it exists
        const lastEntry = await tx.journalEntry.findFirst({
            where: { reference: ticketId, description: { startsWith: 'Maintenance Distribution' } },
            orderBy: { createdAt: 'desc' }
        });

        if (lastEntry) {
            await AccountingEngine.reverseJournalEntry(
                lastEntry.id,
                `REVERSAL_${lastEntry.id}`,
                tx
            );
        }

        return deletedTicket;
    }, { timeout: 60000 });

    revalidatePath('/ar/maintenance/tickets');
    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    revalidateTag("dashboard");

    return { success: true };
}, { permission: PERMISSIONS.TICKET_DELETE });

/**
 * Mark a ticket for re-repair (Warranty)
 */
export const markForReRepair = secureAction(async (data: {
    ticketId: string;
    returnReason: string;
    isPenaltyWaived?: boolean;
    csrfToken?: string;
}) => {
    const { ticketId, returnReason, isPenaltyWaived = false } = data;
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId },
        include: { technician: true, completedBy: true }
    });

    if (!ticket) throw new Error("Ticket not found");
    const allowedStatuses = ['DELIVERED', 'PAID_DELIVERED', 'RETURNED_FOR_REFIX'];
    if (!allowedStatuses.includes(ticket.status)) {
        throw new Error("Cannot return this ticket in its current status.");
    }

    // Calculate warranty and clawback details
    const originalTechId = ticket.completedById || ticket.technicianId;
    const originalCommission = Number(ticket.commissionAmount) || 0;

    const result = await prisma.$transaction(async (tx) => {
        const updatedTicket = await tx.ticket.update({
            where: { id: ticketId },
            data: {
                status: 'RETURNED_FOR_REFIX',
                returnCount: { increment: 1 },
                lastReturnedAt: new Date(),
                returnReason,
                originalTechId: originalTechId,
                isPenaltyWaived: isPenaltyWaived
            }
        });

        const lastEntry = await tx.journalEntry.findFirst({
            where: { reference: ticketId },
            orderBy: { createdAt: 'desc' }
        });

        if (lastEntry) {
            await AccountingEngine.reverseJournalEntry(
                lastEntry.id,
                `REVERSAL_${lastEntry.id}`,
                tx
            );
        }

        // 💰 [NEW] ALWAYS apply a FULL temporary reversal of the existing commission 
        // to the original technician, UNLESS the penalty was explicitly waived.
        if (originalCommission > 0 && originalTechId && !isPenaltyWaived) {
            const techProfile = await tx.technician.findUnique({
                where: { id: originalTechId },
                select: { userId: true }
            });

            if (techProfile?.userId) {
                // 🛡️ [IDEMPOTENCY]: Avoid duplicate reversals for the same ticket rework
                const existingReversal = await tx.employeeTransaction.findFirst({
                    where: { 
                        userId: techProfile.userId,
                        referenceId: ticket.id,
                        type: 'MAINTENANCE_COMMISSION_REVERSAL',
                        amount: { lt: 0 } 
                    }
                });

                if (!existingReversal) {
                    await tx.employeeTransaction.create({
                        data: {
                            userId: techProfile.userId,
                            type: 'MAINTENANCE_COMMISSION_REVERSAL',
                            amount: -originalCommission, // Negative amount for debit
                            description: `Reversal: Warranty Rework for Ticket #${ticket.barcode}`,
                            referenceId: ticket.id,
                            referenceType: 'TICKET_REWORK',
                            branchId: ticket.currentBranchId || undefined
                        }
                    });
                }
            }
        }


        if (originalCommission > 0 && originalTechId) {
            await tx.auditLog.create({
                data: {
                    entityType: 'COMMISSION_REVERSAL',
                    entityId: ticketId,
                    action: isPenaltyWaived ? 'WAIVED_REVERSAL' : 'FULL_REVERSAL',
                    previousData: JSON.stringify({
                        technicianId: originalTechId,
                        originalCommission,
                        returnReason
                    }),
                    reason: `Commission reversal of ${originalCommission.toFixed(2)} for warranty return`,
                    user: user?.name || 'System'
                }
            });
        }

        await tx.ticketNote.create({
            data: {
                ticketId,
                text: `🔄 Returned for re-repair. Reason: ${returnReason}. ${originalCommission > 0 ? `Commission reversed: $${originalCommission.toFixed(2)}` : ''}`,
                author: user.name || user.username || "System",
                isInternal: true
            }
        });

        return updatedTicket;
    });

    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    revalidatePath("/ar/maintenance/tickets");
    return { success: true, ticket: result };
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Get customers with balances
 */
export const getCustomersWithBalance = secureAction(async (filters?: {
    search?: string;
    hasBalance?: boolean;
}) => {
    const where: Prisma.CustomerWhereInput = {};

    if (filters?.search) {
        where.OR = [
            { name: { contains: filters.search } },
            { phone: { contains: filters.search } }
        ];
    }

    if (filters?.hasBalance) {
        where.NOT = { balance: 0 };
    }

    const customers = await prisma.customer.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 100
    });

    return {
        customers: customers.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            balance: new Decimal(c.balance?.toString() || 0).toNumber(),
        }))
    };
}, { permission: PERMISSIONS.TICKET_VIEW, requireCSRF: false });

/**
 * Apply customer credit to a ticket
 */
export const applyCustomerCredit = secureAction(async (data: {
    ticketId: string;
    customerId: string;
    amount: number;
    csrfToken?: string;
}) => {
    const { ticketId, customerId, amount } = data;
    const amountDec = new Decimal(amount);
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const result = await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new Error("Customer not found");

        const balance = new Decimal(customer.balance?.toString() || 0);
        if (balance.gte(0)) throw new Error("Customer has no credit balance.");
        if (amountDec.gt(balance.abs())) throw new Error("Amount exceeds available credit.");

        const ticket = await tx.ticket.findFirst({
            where: { OR: [{ id: ticketId }, { barcode: ticketId }] }
        });
        if (!ticket) throw new Error("Ticket not found");

        if (checkTicketLock(ticket, user)) {
            throw new Error("هذه التذكرة مغلقة ولا يمكن إضافة أي شيء إليها. (إلا في حالة المرتجع)");
        }

        const repairPrice = new Decimal(ticket.repairPrice?.toString() || 0);
        const amountPaid = new Decimal(ticket.amountPaid?.toString() || 0);
        if (amountDec.gt(repairPrice.minus(amountPaid))) throw new Error("Amount exceeds balance due.");

        // 1. Create Payment
        await tx.repairPayment.create({
            data: {
                ticketId: ticket.id,
                amount: amountDec,
                method: 'CREDIT_APPLIED',
                type: 'PAYMENT',
                recordedBy: user.name || user.username || "System",
                reference: "Credit applied from customer account"
            }
        });

        // 2. Create customer transaction
        await tx.customerTransaction.create({
            data: {
                customerId,
                type: 'DEBIT',
                amount: amountDec,
                description: `Ticket #${ticket.barcode} - Credit Applied`,
                reference: ticket.id,
                createdBy: user.id
            }
        });

        // 3. Update customer balance
        await tx.customer.update({
            where: { id: customerId },
            data: { balance: { increment: amountDec } }
        });

        // 4. Update ticket balance
        const newPaid = amountPaid.plus(amountDec);
        const newStatus = newPaid.gte(repairPrice) ? 'paid' : 'partial';

        return await tx.ticket.update({
            where: { id: ticket.id },
            data: {
                amountPaid: newPaid,
                paymentStatus: newStatus
            }
        });
    }, { timeout: 60000 });

    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath("/customers");
    return { success: true, ticket: result };
}, { permission: PERMISSIONS.TICKET_EDIT });
/**
 * Add a part to a ticket
 */
export const addTicketPart = secureAction(async (data: {
    ticketId: string,
    productId?: string,
    name?: string,
    quantity: number,
    warehouseId?: string,
    price?: number,
    transferPriceOverride?: number,
    csrfToken?: string
}) => {
    const { ticketId } = data;

    const user = await getCurrentUser();
    if (!user) throw new Error("Authentication required");

    const ticket = await prisma.ticket.findFirst({
        where: { OR: [{ id: ticketId }, { barcode: ticketId }] },
        include: { technician: true }
    });

    if (!ticket) throw new Error("Ticket not found");

    if (checkTicketLock(ticket, user)) {
        throw new Error("هذه التذكرة مغلقة ولا يمكن إضافة أي شيء إليها. (إلا في حالة المرتجع)");
    }

    let baseCostPrice = new Decimal(0);
    let transferPrice = new Decimal(0);
    let price = data.price ? new Decimal(data.price) : new Decimal(0);
    let productName = data.name || "Unknown Item";

    const tech = ticket.technicianId 
        ? await prisma.technician.findUnique({ where: { id: ticket.technicianId } }) 
        : null;
    const tier = tech?.defaultPriceTier || 'COST';

    if (data.productId) {
        const product = await prisma.product.findUnique({ where: { id: data.productId } });
        if (!product) throw new Error("Product not found");

        baseCostPrice = new Decimal(product.costPrice || 0);
        
        // Determine transfer price based on override or technician tier
        if (data.transferPriceOverride !== undefined) {
            transferPrice = new Decimal(data.transferPriceOverride);
        } else if (tier === 'SELL_1') {
            transferPrice = new Decimal(product.sellPrice || 0);
        } else if (tier === 'SELL_2') {
            transferPrice = new Decimal(product.sellPrice2 || 0);
        } else if (tier === 'SELL_3') {
            transferPrice = new Decimal(product.sellPrice3 || 0);
        } else {
            transferPrice = new Decimal(product.costPrice || 0); // Default to COST
        }

        if (price.isZero()) price = new Decimal(product.sellPrice || 0);
        productName = product.name;

        let sourceWarehouseId = data.warehouseId;
        if (!sourceWarehouseId) {
            // Priority 1: Technician's assigned warehouse (Custody)
            if (ticket.technician?.warehouseId) {
                sourceWarehouseId = ticket.technician.warehouseId;
            } 
            // Priority 2: Branch-Scoped Default Warehouse
            else {
                const branchDefaultWh = await prisma.warehouse.findFirst({
                    where: {
                        branchId: user.branchId!,
                        isDefault: true,
                        deletedAt: null
                    }
                });
                if (branchDefaultWh) {
                    sourceWarehouseId = branchDefaultWh.id;
                }
                // Priority 3: isMaintenanceDefault (Legacy/Fallback)
                else {
                    const maintenanceWh = await prisma.warehouse.findFirst({
                        where: {
                            isMaintenanceDefault: true,
                            deletedAt: null
                        }
                    });
                    if (maintenanceWh) sourceWarehouseId = maintenanceWh.id;
                }
            }
        }

        if (sourceWarehouseId) {
            const stock = await prisma.stock.findUnique({
                where: {
                    productId_warehouseId: {
                        productId: data.productId,
                        warehouseId: sourceWarehouseId
                    }
                }
            });

            // If not found in technician custody, and we haven't checked main yet
            let finalStock = stock;
            let finalWarehouseId = sourceWarehouseId;

            if (!finalStock || new Decimal(finalStock.quantity).lt(data.quantity)) {
                 // Try fallback to main warehouse if we started with tech custody
                 if (ticket.technician?.warehouseId && sourceWarehouseId === ticket.technician.warehouseId) {
                    const mainWh = await prisma.warehouse.findFirst({ 
                        where: { isMaintenanceDefault: true } 
                    });
                    if (mainWh && mainWh.id !== sourceWarehouseId) {
                        const mainStock = await prisma.stock.findUnique({
                            where: {
                                productId_warehouseId: {
                                    productId: data.productId,
                                    warehouseId: mainWh.id
                                }
                            }
                        });
                        if (mainStock && new Decimal(mainStock.quantity).gte(data.quantity)) {
                            finalStock = mainStock;
                            finalWarehouseId = mainWh.id;
                        }
                    }
                 }
            }

            const availableStock = finalStock?.quantity ?? new Decimal(0);
            if (new Decimal(availableStock).lt(data.quantity)) {
                throw new Error(`عفواً، الكمية المطلوبة غير متاحة. المتاح حالياً: ${availableStock}`);
            }

            await prisma.$transaction(async (tx) => {
                await tx.stock.update({
                    where: { id: finalStock!.id },
                    data: { quantity: { decrement: data.quantity } }
                });

                await tx.stockMovement.create({
                    data: {
                        type: 'USAGE',
                        productId: data.productId!,
                        fromWarehouseId: finalWarehouseId,
                        quantity: data.quantity,
                        reason: `Used in Ticket #${ticket.barcode}`,
                        branchId: user.branchId || null
                    } as any
                });

                await tx.product.update({
                    where: { id: data.productId! },
                    data: { stock: { decrement: data.quantity } }
                });

                await tx.ticketPart.create({
                    data: {
                        ticketId: ticket.id,
                        productId: data.productId || undefined,
                        name: productName,
                        quantity: data.quantity,
                        cost: transferPrice,
                        baseCostPrice: baseCostPrice,
                        transferPrice: transferPrice,
                        price: price,
                        warehouseId: finalWarehouseId,
                        status: 'ACTIVE'
                    }
                });
            }, { timeout: 60000 });
            sourceWarehouseId = finalWarehouseId; // Update local variable for subsequent logic
        }
    } else {
        // For non-product items (services), just create the part
        await prisma.ticketPart.create({
            data: {
                ticketId: ticket.id,
                name: productName,
                quantity: data.quantity,
                cost: transferPrice,
                baseCostPrice: baseCostPrice,
                transferPrice: transferPrice,
                price: price,
                status: 'ACTIVE'
            }
        });
    }

    const allParts = await prisma.ticketPart.findMany({ 
        where: { ticketId: ticket.id, status: 'ACTIVE' } 
    });
    const totalPartsCost = allParts.reduce((sum, p) => sum.plus(new Decimal(p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));
    const totalSellPrice = allParts.reduce((sum, p) => sum.plus(new Decimal(p.price?.toString() || 0).mul(p.quantity)), new Decimal(0));

    const isWarrantyFix = ticket.status === 'RETURNED_FOR_REFIX';
    const updateData: Prisma.TicketUpdateInput = {
        partsCost: totalPartsCost,
    };

    if (!isWarrantyFix) {
        updateData.repairPrice = totalSellPrice;
    }

    const finalPrice = isWarrantyFix ? new Decimal(ticket.repairPrice?.toString() || 0) : totalSellPrice;
    const netProfit = calculateNetProfit(finalPrice, totalPartsCost);
    updateData.netProfit = netProfit;

    if (ticket.technicianId) {
        const commission = calculateCommission(netProfit, Number(ticket.commissionRate || 0));
        updateData.commissionAmount = new Decimal(commission);
    }

    await prisma.ticket.update({
        where: { id: ticket.id },
        data: updateData
    });

    revalidatePath(`/ar/maintenance/tickets/${ticket.id}`);
    return { success: true };
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Refund a part and mark it as defective/wastage
 */
export const refundTicketPart = secureAction(async (data: {
    partId: string,
    csrfToken?: string
}) => {
    const { partId } = data;
    const part = await prisma.ticketPart.findUnique({
        where: { id: partId },
        include: { product: true, ticket: { include: { technician: true } } }
    });
    if (!part) throw new Error("Part not found");
    if (part.status === 'REFUNDED') throw new Error("Part already refunded");
    const user = await getCurrentUser();
    const ticketId = part.ticketId;
    const productId = part.productId;
    const quantity = part.quantity;

    await prisma.$transaction(async (tx) => {
        await tx.ticketPart.update({ 
            where: { id: partId },
            data: { status: 'REFUNDED', isDamaged: true, deletedAt: new Date() }
        });

        if (productId) {
            let targetWhId = part.ticket.technician?.warehouseId;
            
            await handleReturnedPartStock(tx, {
                productId,
                warehouseId: targetWhId || null,
                quantity: new Decimal(quantity).toNumber(),
                isDamaged: true,
                reason: `Refunded/Defective in Ticket #${part.ticket.barcode}`,
                performedById: user?.id || 'system',
                branchId: part.ticket.currentBranchId
            });

            // --- T-029: Automated Salary Deduction for Damaged Parts (With Percentage) ---
            if (part.ticket?.technicianId) {
                const partCost = new Decimal(part.baseCostPrice?.toString() || part.cost?.toString() || 0).mul(quantity);
                const lossRate = Number(part.ticket.technician?.lossRate || 100);
                const techDeduction = partCost.mul(lossRate / 100);
                
                // 1. Tech Share
                if (techDeduction.gt(0) && part.ticket.technician) {
                    await tx.employeeTransaction.create({
                        data: {
                            userId: part.ticket.technician.userId,
                            type: 'DEDUCTION',
                            amount: techDeduction,
                            description: `خصم نسبة تحمل تالف (${lossRate}%) - تذكرة #${part.ticket.barcode} - (${part.name || 'بدون اسم'})`,
                            referenceId: part.ticket.id,
                            referenceType: 'TICKET_PART_REFUND_DAMAGE',
                            branchId: part.ticket.currentBranchId
                        }
                    });
                }

                // 2. Financial Ledger: Record FULL Wastage Expense to credit 1200 Inventory for the destroyed physical asset
                if (partCost.gt(0)) {
                    await AccountingEngine.recordTransaction({
                        description: `إثبات هالك كلي للقطعة (تحمل المهندس ${lossRate}%) - تذكرة #${part.ticket.barcode} - (${part.name || 'بدون اسم'})`,
                        branchId: part.ticket.currentBranchId,
                        reference: part.ticket.id,
                        idempotencyKey: `WASTE_${part.ticket.id}_${partCost.toString()}`,
                        lines: [
                            { accountCode: GL.EXPENSES.SPOILAGE, debit: partCost, credit: 0, description: "Wastage Loss" },
                            { accountCode: GL.ASSETS.INVENTORY, debit: 0, credit: partCost, description: "Inventory Reduced" }
                        ]
                    }, tx);
                }
            }
        }

        const activeParts = await tx.ticketPart.findMany({ where: { ticketId, status: 'ACTIVE' } });
        const totalCost = activeParts.reduce((sum, p) => sum.plus(new Decimal(p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));
        const totalSell = activeParts.reduce((sum, p) => sum.plus(new Decimal(p.price?.toString() || 0).mul(p.quantity)), new Decimal(0));
        
        // Tiered Pricing Summary
        const techBillingPrice = activeParts.reduce((sum, p) => sum.add(new Decimal(p.transferPrice?.toString() || p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));
        const partCostPrice = activeParts.reduce((sum, p) => sum.add(new Decimal(p.baseCostPrice?.toString() || p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));

        const isFix = part.ticket?.status === 'RETURNED_FOR_REFIX';
        const netPro = calculateNetProfit(new Decimal(isFix ? Number(part.ticket?.repairPrice || 0) : totalSell), new Decimal(totalCost));

        await tx.ticket.update({
            where: { id: ticketId },
            data: {
                partsCost: totalCost,
                repairPrice: isFix ? undefined : totalSell,
                netProfit: netPro,
                commissionAmount: part.ticket?.technicianId ? new Decimal(calculateCommission(netPro, Number(part.ticket.commissionRate || 0))) : undefined
            }
        });
    }, { timeout: 60000 });

    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    return { success: true };
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Remove a part from a ticket
 */
export const removeTicketPart = secureAction(async (data: {
    partId: string,
    warehouseId?: string,
    isDamaged?: boolean,
    lossRateOverride?: number,
    csrfToken?: string
}) => {
    const { partId, warehouseId, isDamaged, lossRateOverride } = data;

    const part = await prisma.ticketPart.findUnique({
        where: { id: partId },
        include: { product: true, ticket: { include: { technician: true } } }
    });

    if (!part) throw new Error("Part not found");

    const user = await getCurrentUser();
    if (part.ticket && ['DELIVERED', 'PICKED_UP', 'PAID_DELIVERED'].includes(part.ticket.status)) {
        const canEditClosed = hasPermission(user?.permissions, PERMISSIONS.TICKET_OVERRIDE);
        if (!canEditClosed) {
            throw new Error("This ticket is closed and parts can only be removed by an Admin or Manager.");
        }
    }

    const ticketId = part.ticketId;
    const productId = part.productId;
    const quantity = part.quantity;

    await prisma.$transaction(async (tx) => {
        // 1. Delete the part record
        await tx.ticketPart.delete({ where: { id: partId } });

        // If the part was already REFUNDED, we ALREADY logged wastage.
        // Permanent deletion from DB should NOT trigger stock logic again.
        if (part.status === 'REFUNDED') return;

        if (productId) {
            // Determine target warehouse for return/wastage
            let targetWhId: string | null | undefined = warehouseId || part.warehouseId;
            
            // If still no warehouseId, fallback to technician's warehouse
            if (!targetWhId && part.ticket?.technicianId) {
                targetWhId = part.ticket.technician?.warehouseId;
            }

            await handleReturnedPartStock(tx, {
                productId,
                warehouseId: targetWhId || null,
                quantity: new Decimal(quantity).toNumber(),
                isDamaged: !!isDamaged,
                reason: `${isDamaged ? 'Replaced/Damaged' : 'Returned'} from Ticket #${part.ticket?.barcode || part.ticketId} (Part Removed)`,
                performedById: user?.id || 'system',
                branchId: part.ticket?.currentBranchId ?? undefined
            });

            // --- T-029: Automated Salary Deduction for Damaged Parts (With Percentage Override) ---
            if (isDamaged && part.ticket?.technicianId) {
                const partCost = new Decimal(part.baseCostPrice?.toString() || part.cost?.toString() || 0).mul(quantity);
                const effectiveLossRate = lossRateOverride ?? Number(part.ticket.technician?.lossRate || 100);
                const techDeduction = partCost.mul(effectiveLossRate / 100);
                
                // 1. Tech Share
                if (techDeduction.gt(0) && part.ticket.technician) {
                    await tx.employeeTransaction.create({
                        data: {
                            userId: part.ticket.technician.userId,
                            type: 'DEDUCTION',
                            amount: techDeduction,
                            description: `خصم نسبة تحمل تالف (${effectiveLossRate}%) - تذكرة #${part.ticket.barcode} - (${part.name || 'بدون اسم'})`,
                            referenceId: part.ticket.id,
                            referenceType: 'TICKET_PART_DAMAGE',
                            branchId: part.ticket.currentBranchId
                        }
                    });
                }

                // 2. Financial Ledger: Record FULL Wastage Expense to credit 1200 Inventory for the destroyed physical asset
                if (partCost.gt(0)) {
                    await AccountingEngine.recordTransaction({
                        description: `إثبات هالك كلي للقطعة (تحمل المهندس ${effectiveLossRate}%) - تذكرة #${part.ticket.barcode} - (${part.name || 'بدون اسم'})`,
                        branchId: part.ticket.currentBranchId,
                        reference: part.ticket.id,
                        idempotencyKey: `WASTE_${part.ticket.id}_${partCost.toString()}_${Date.now()}`, // adding Date.now() to prevent conflict since ticket part removal can happen multiple times
                        lines: [
                            { accountCode: GL.EXPENSES.SPOILAGE, debit: partCost, credit: 0, description: "Wastage Loss" },
                            { accountCode: GL.ASSETS.INVENTORY, debit: 0, credit: partCost, description: "Inventory Reduced" }
                        ]
                    }, tx);
                }
            }
        }

        const activeParts = await tx.ticketPart.findMany({ 
            where: { ticketId, status: 'ACTIVE' } 
        });
        const totalPartsCost = activeParts.reduce((sum, p) => sum.plus(new Decimal(p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));
        const totalSellPrice = activeParts.reduce((sum, p) => sum.plus(new Decimal(p.price?.toString() || 0).mul(p.quantity)), new Decimal(0));
        
        // Tiered Pricing Summary
        const techBillingPrice = activeParts.reduce((sum, p) => sum.add(new Decimal(p.transferPrice?.toString() || p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));
        const partCostPrice = activeParts.reduce((sum, p) => sum.add(new Decimal(p.baseCostPrice?.toString() || p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));

        const isWarrantyFix = part.ticket?.status === 'RETURNED_FOR_REFIX';
        const updateFields: Prisma.TicketUpdateInput = {
            partsCost: totalPartsCost,
            techBillingPrice,
            partCostPrice,
        };

        if (!isWarrantyFix) {
            updateFields.repairPrice = totalSellPrice;
        }

        const finalPrice = isWarrantyFix ? new Decimal(part.ticket?.repairPrice?.toString() || 0) : totalSellPrice;
        const netProfit = calculateNetProfit(finalPrice, totalPartsCost);
        updateFields.netProfit = netProfit;

        // T-030: Precise Commission & Loss Recalculation
        if (part.ticket?.technicianId) {
            const leadTech = await tx.technician.findUnique({
                where: { id: part.ticket.technicianId },
                include: { commissionRule: true }
            });

            if (leadTech) {
                const { commissionAmount, commissionRate, excessLossAmount } = resolveCommission(leadTech, netProfit);
                updateFields.commissionAmount = commissionAmount;
                updateFields.commissionRate = commissionRate;
                updateFields.excessLossAmount = excessLossAmount;
            }
        }

        await tx.ticket.update({
            where: { id: ticketId },
            data: updateFields
        });
    }, { timeout: 60000 });

    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    return { success: true };
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Get products for selection in parts manager
 */
export const getProductsForSelector = secureAction(async (data: { search?: string, warehouseId?: string }) => {
    const { search, warehouseId } = data || {};
    let targetWarehouseId = warehouseId;

    if (warehouseId === 'MAIN') {
        const mainWh = await prisma.warehouse.findFirst({ where: { isMaintenanceDefault: true } });
        targetWarehouseId = mainWh?.id || undefined;
    } else if (warehouseId) {
        // 🔍 Check if the warehouseId is actually a Technician ID
        const tech = await prisma.technician.findUnique({
            where: { id: warehouseId },
            select: { warehouseId: true }
        });
        if (tech && tech.warehouseId) {
            targetWarehouseId = tech.warehouseId;
        }
    }

    const where: Prisma.ProductWhereInput = {
        deletedAt: null,
    };

    if (search && search.trim().length > 0) {
        const searchTerms = search.trim().split(/\s+/);
        where.AND = searchTerms.map(term => ({
            OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { sku: { contains: term, mode: 'insensitive' } }
            ]
        }));
    }

    const products = await prisma.product.findMany({
        where,
        take: 50,
        orderBy: { name: 'asc' },
        include: {
            stocks: true
        }
    });

    const resultData = products.map(p => {
        let stockValue: Decimal = p.stock;
        if (targetWarehouseId) {
            const st = p.stocks.find(s => s.warehouseId === targetWarehouseId);
            stockValue = st ? st.quantity : new Decimal(0);
        }

        const trackStock = (p as any).trackStock !== false;

        return {
            id: p.id,
            name: p.name,
            sku: p.sku,
            stock: stockValue.toNumber(),
            costPrice: new Decimal(p.costPrice || 0).toNumber(),
            sellPrice: new Decimal(p.sellPrice || 0).toNumber(),
            sellPrice2: new Decimal(p.sellPrice2 || 0).toNumber(),
            sellPrice3: new Decimal(p.sellPrice3 || 0).toNumber(),
            trackStock
        };
    }).filter(p => !p.trackStock || p.stock > 0);

    return { success: true, data: resultData };
}, { permission: PERMISSIONS.TICKET_VIEW, requireCSRF: false });

/**
 * Process a payment for a ticket
 */
export const processTicketPayment = secureAction(async (data: {
    ticketId: string;
    amount: number;
    paymentMethod: 'CASH' | 'VISA' | 'WALLET' | 'INSTAPAY' | 'ACCOUNT';
    paymentType?: 'DEPOSIT' | 'PAYMENT' | 'REFUND';
    reference?: string;
    customerId?: string;
    csrfToken?: string;
    warranty?: {
        warrantyDays: number;
        warrantyExpiryDate: Date;
    };
}) => {
    const { ticketId, amount, paymentMethod, paymentType = 'PAYMENT', reference, customerId, warranty } = data;
    const amountDec = new Decimal(amount);

    const ticket = await prisma.ticket.findFirst({
        where: { OR: [{ id: ticketId }, { barcode: ticketId }] },
        include: { 
            customer: true,
            parentTicket: true
        }
    });

    if (!ticket) throw new Error('Ticket not found');

    const previousPaid = new Decimal(ticket.amountPaid || 0);
    const repairPrice = new Decimal(ticket.repairPrice || 0);

    // Relaxed validation: Allow 0 for warranty returns, reworks, or fully prepaid tickets ready for delivery
    const isActuallyRefund = paymentType === 'REFUND' || amountDec.lt(0);
    const isWarrantyEvenSwap = (ticket.isWarrantyReturn || ticket.status === 'RETURNED_FOR_REFIX') && amountDec.isZero();
    const isPrepaidDelivery = amountDec.isZero() && previousPaid.gte(repairPrice) && repairPrice.gt(0);

    if (!isActuallyRefund && !isWarrantyEvenSwap && !isPrepaidDelivery && amountDec.lte(0)) {
        throw new Error('Payment amount must be greater than zero');
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    if (checkTicketLock(ticket, currentUser)) {
        throw new Error("هذه التذكرة مغلقة ولا يمكن إضافة أي شيء إليها. (إلا في حالة المرتجع)");
    }

    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error('No active shift. Please open a shift first.');
    }
    const currentShift = shiftResult.shift;

    const inheritedCredit = (ticket.isWarrantyReturn && ticket.parentTicket) ? new Decimal(ticket.parentTicket.amountPaid || 0) : new Decimal(0);
    let effectiveAmount = amountDec;
    
    // Absorption Logic: If this is a warranty return and we haven't absorbed the credit yet (amountPaid === 0),
    // include the inheritedCredit in the new total paid calculation.
    let newTotalPaid = previousPaid.plus(effectiveAmount);
    if (ticket.isWarrantyReturn && previousPaid.isZero()) {
        newTotalPaid = newTotalPaid.plus(inheritedCredit);
    }

    let paymentStatus = 'partial';
    if (newTotalPaid.gte(repairPrice) && repairPrice.gt(0)) {
        paymentStatus = 'paid';
    } else if (newTotalPaid.isZero()) {
        paymentStatus = 'unpaid';
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
        let actualCustomerId = ticket.customerId;
        let isSalaryDeduction = false;

        if (paymentMethod === 'ACCOUNT') {
            let employeeId: string | null = null;

            if (ticket.customer?.linkedEmployeeId) {
                employeeId = ticket.customer.linkedEmployeeId;
            } else {
                const lookupPhone = ticket.customerPhone || (customerId && customerId.length > 5 ? customerId : '');
                if (lookupPhone) {
                    const employee = await tx.user.findFirst({
                        where: { phone: { equals: lookupPhone } },
                        select: { id: true }
                    });
                    if (employee) employeeId = employee.id;
                }
            }

            if (employeeId) {
                isSalaryDeduction = true;
                const txType = isActuallyRefund ? 'MAINTENANCE_DEDUCTION_REVERSAL' : 'MAINTENANCE_DEDUCTION';
                const txDesc = isActuallyRefund 
                    ? `عكس صيانة آجل - تذكرة #${ticket.barcode}`
                    : `صيانة آجل - تذكرة #${ticket.barcode}`;

                await tx.employeeTransaction.create({
                    data: {
                        userId: employeeId,
                        amount: effectiveAmount.abs(),
                        type: txType,
                        referenceId: ticket.id,
                        referenceType: isActuallyRefund ? 'TICKET_REFUND' : 'TICKET',
                        description: txDesc,
                        branchId: currentUser?.branchId || null
                    } as any
                });
            }

            if (!isSalaryDeduction) {
                if (!customerId) throw new Error('Customer is required for account payments');
                let customer = await tx.customer.findUnique({ where: { id: customerId } });
                if (!customer) throw new Error('Customer not found');

                actualCustomerId = customer.id;
                await tx.customer.update({
                    where: { id: customer.id },
                    // Charging to account (effectiveAmount > 0) INCREASES debt balance.
                    // Refunding to account (effectiveAmount < 0) DECREASES debt balance.
                    data: { balance: { increment: effectiveAmount } }
                });

                if (!ticket.customerId) {
                    await tx.ticket.update({
                        where: { id: ticketId },
                        data: { customerId: customer.id }
                    });
                }
            }
        }

        let paymentRecordId: string | null = null;
        const isCompletedOrReadyEarly = ['COMPLETED', 'READY_AT_BRANCH', 'DELIVERED'].includes(ticket.status);
        const isDepositPayment = !isCompletedOrReadyEarly || paymentType === 'DEPOSIT';
        if (!effectiveAmount.isZero()) {
            const paymentRecord = await tx.repairPayment.create({
                data: {
                    ticketId: ticket.id,
                    type: effectiveAmount.lt(0) ? 'REFUND' : (isDepositPayment ? 'DEPOSIT' : paymentType),
                    amount: effectiveAmount,
                    method: paymentMethod,
                    reference: reference || null,
                    recordedBy: currentUser.name || currentUser.username || 'System'
                }
            });
            paymentRecordId = paymentRecord.id;

            // 💰 [GAAP GL 2150] If taking an advance deposit, credit Customer Deposits liability (not revenue yet)
            if (!effectiveAmount.lt(0) && isDepositPayment) {
                const assetAccount = PAYMENT_METHOD_GL_MAP[paymentMethod] || GL.ASSETS.CASH;
                await AccountingEngine.recordTransaction({
                    description: `عربون صيانة تذكرة #${ticket.barcode}`,
                    reference: ticket.id,
                    branchId: currentUser?.branchId ?? undefined,
                    idempotencyKey: `TICKET_DEP_${ticket.id}_${paymentRecord.id}`,
                    lines: [
                        { accountCode: assetAccount, debit: effectiveAmount, credit: 0, description: `استلام عربون صيانة (${paymentMethod})` },
                        { accountCode: GL.LIABILITIES.CUSTOMER_DEPOSITS, debit: 0, credit: effectiveAmount, description: "أمانات وعرابين عملاء صيانة" }
                    ]
                }, tx);
            }
        }

        const effectiveCustomerId = actualCustomerId || (paymentMethod === 'ACCOUNT' ? customerId : null);
        if (effectiveCustomerId && !effectiveAmount.isZero() && !isSalaryDeduction) {
            const isDeferred = paymentMethod === 'ACCOUNT';
            let description = `فاتورة #${ticket.barcode}`;
            if (paymentType === 'DEPOSIT') description += ' - عربون';
            else if (isActuallyRefund) description += ' - مرتجع';
            else if (isDeferred) description += ' - آجل';
            else description += ` - دفع ${paymentMethod}`;

            await tx.customerTransaction.create({
                data: {
                    customerId: effectiveCustomerId,
                    // 💰 [STANDARD] CREDIT increases wallet/balance. DEBIT increases debt.
                    type: isDeferred ? 'DEBIT' : 'CREDIT',
                    amount: effectiveAmount.abs(),
                    description,
                    reference: ticket.id,
                    createdBy: currentUser.id,
                    branchId: currentUser.branchId || undefined
                }
            });
        }

        // --- Profit Distribution Calculation & Snapshotted Fields ---
        // Triggered only when transitioning to PAID_DELIVERED
        let distributionData: Partial<{
            finalCustomerPrice: Decimal;
            techBillingPrice: Decimal;
            partCostPrice: Decimal;
            laborPoolAmount: Decimal;
            techCommissionAmount: Decimal;
            centerLaborProfit: Decimal;
            centerPartProfit: Decimal;
            commissionAmount: Decimal;
            netProfit: Decimal;
        }> = {};
        // Only complete delivery and distribute profit if the ticket was already completed/ready
        const isCompletedOrReady = ['COMPLETED', 'READY_AT_BRANCH', 'DELIVERED'].includes(ticket.status);
        const isFinalDeliveryPayment = isCompletedOrReady && paymentStatus === 'paid' && paymentType === 'PAYMENT';

        if (isFinalDeliveryPayment) {
            const activeParts = await tx.ticketPart.findMany({
                where: { ticketId: ticket.id, status: 'ACTIVE' }
            });

            const techBillingPrice = activeParts.reduce((sum, p) => sum.add(new Decimal(p.transferPrice?.toString() || p.cost?.toString() || 0)), new Decimal(0));
            const partCostPrice = activeParts.reduce((sum, p) => sum.add(new Decimal(p.baseCostPrice?.toString() || p.cost?.toString() || 0)), new Decimal(0));
            const finalCustomerPrice = repairPrice.gt(0) ? repairPrice : newTotalPaid;
            const laborPoolAmount = finalCustomerPrice.minus(techBillingPrice);
            
            // Re-calculate commission based on the new labor pool
            let techCommissionAmount = new Decimal(0);
            let technician = null;
            if (ticket.technicianId) {
                technician = await tx.technician.findUnique({
                    where: { id: ticket.technicianId },
                    include: { commissionRule: true }
                });
                if (technician) {
                    const resolved = resolveCommission(technician, laborPoolAmount);
                    techCommissionAmount = resolved.commissionAmount;
                }
            }

            const centerLaborProfit = laborPoolAmount.minus(techCommissionAmount);
            const centerPartProfit = techBillingPrice.minus(partCostPrice);

            distributionData = {
                finalCustomerPrice,
                techBillingPrice,
                partCostPrice,
                laborPoolAmount,
                techCommissionAmount,
                centerLaborProfit,
                centerPartProfit,
                // Also update the legacy fields for backward compatibility/reporting
                commissionAmount: techCommissionAmount,
                netProfit: centerLaborProfit.plus(centerPartProfit)
            };

            // 💰 [GAAP GL 2150 Relief] Relieve advance customer deposits and recognize revenue
            const previousDepositPaid = previousPaid;
            const depositRelieved = Decimal.min(finalCustomerPrice, previousDepositPaid);
            const freshPaymentRelieved = finalCustomerPrice.minus(depositRelieved);

            const distributionLines = [
                // If deposit was previously paid, debit GL 2150 to clear the liability
                ...(depositRelieved.gt(0) ? [{
                    accountCode: GL.LIABILITIES.CUSTOMER_DEPOSITS,
                    debit: depositRelieved,
                    credit: new Decimal(0),
                    description: `إخلاء ذمة عربون تذكرة #${ticket.barcode}`
                }] : []),
                // If fresh payment made at delivery, debit the payment method asset
                ...(freshPaymentRelieved.gt(0) ? [{
                    accountCode: PAYMENT_METHOD_GL_MAP[paymentMethod] || GL.ASSETS.CASH,
                    debit: freshPaymentRelieved,
                    credit: new Decimal(0),
                    description: `سداد تسليم تذكرة #${ticket.barcode}`
                }] : []),
                // Credits: parts, tech commission, and center profit
                { accountCode: GL.REVENUE.SALES, debit: new Decimal(0), credit: techBillingPrice, description: "Parts Revenue Dist" },
                { accountCode: GL.LIABILITIES.ACCRUED_SALARIES, debit: new Decimal(0), credit: techCommissionAmount, description: "Technician Commission Accrued" },
                { accountCode: GL.REVENUE.SALES, debit: new Decimal(0), credit: centerLaborProfit, description: "Center Labor Profit realized" }
            ];

            // --- Record Balanced Journal Entry ---
            await AccountingEngine.recordTransaction({
                description: `Maintenance Distribution: Ticket #${ticket.barcode}`,
                reference: ticket.id,
                branchId: currentUser?.branchId ?? undefined,
                idempotencyKey: `TICKET_DIST_${ticket.id}`,
                lines: distributionLines
            }, tx);
        }

        const updatedTicket = await tx.ticket.update({
            where: { id: ticket.id },
            data: {
                amountPaid: newTotalPaid,
                paymentStatus,
                paymentMethod: paymentMethod,
                // Automatically close the ticket only if fully paid AND it was already completed/ready for delivery
                ...(isFinalDeliveryPayment ? { 
                    status: 'PAID_DELIVERED',
                    deliveredAt: new Date(),
                    warrantyExpiryDate: (function() {
                        const d = new Date();
                        const days = warranty?.warrantyDays || 30;
                        d.setDate(d.getDate() + days);
                        return d;
                    })(),
                    ...distributionData
                } : {})
            }
        });

        // --- Part 4: Engineer Commission Recording ---
        // Only trigger if status changes to PAID_DELIVERED, or paymentStatus reaches 'paid' while DELIVERED
        const wasPaidDelivered = ticket.status === 'PAID_DELIVERED';
        const isPaidDeliveredNow = updatedTicket.status === 'PAID_DELIVERED';

        if (isPaidDeliveredNow && !wasPaidDelivered && !isActuallyRefund) {
            if (!ticket.id) {
                throw new Error("Commission record requires a non-null referenceId (ticket.id).");
            }
            
            // 1. Delta-Based Commission/Loss Engine for Reworks & Normal Tickets
            if (ticket.technicianId) {
                const currentTechId = ticket.technicianId;
                const originalTechId = ticket.originalTechId || ticket.technicianId;
                const netProfit = distributionData.laborPoolAmount || new Decimal(0);

                // --- Normal Ticket (First Time) ---
                if (originalTechId === currentTechId && !ticket.originalTechId) {
                    const technician = await tx.technician.findUnique({
                        where: { id: currentTechId },
                        include: { commissionRule: true }
                    });

                    if (technician) {
                        const existingComm = await tx.employeeTransaction.findFirst({
                            where: {
                                referenceId: ticket.id,
                                type: 'MAINTENANCE_COMMISSION'
                            }
                        });

                        if (!existingComm) {
                            const resolved = resolveCommission(technician, netProfit);
                            if (resolved.commissionAmount.gt(0)) {
                                await tx.employeeTransaction.create({
                                    data: {
                                        userId: technician.userId,
                                        type: 'MAINTENANCE_COMMISSION',
                                        amount: resolved.commissionAmount.toNumber(),
                                        description: `عمولة صيانة: ${ticket.barcode} (سداد الفاتورة)`,
                                        referenceId: ticket.id,
                                        referenceType: 'TICKET'
                                    }
                                });
                            }
                        }
                    }
                } 
                // --- Rework Ticket Logic ---
                else {
                    const isPenaltyWaived = ticket.isPenaltyWaived;

                    // A. Handle Current Tech (New Profits)
                    // If there is profit left, grant it to the current technician.
                    // IMPORTANT: To prevent double-dipping, if the current technician is the same as the original technician,
                    // and their penalty was waived (meaning they kept their original commission), DO NOT grant them a second commission on the same profit pool.
                    const isSameTech = currentTechId === originalTechId;
                    const canGrantNewCommission = !isSameTech || (isSameTech && !isPenaltyWaived);

                    if (netProfit.gt(0) && canGrantNewCommission) {
                        const currentTech = await tx.technician.findUnique({
                            where: { id: currentTechId },
                            include: { commissionRule: true }
                        });
                        
                        if (currentTech && currentTech.userId) {
                            const existingComm = await tx.employeeTransaction.findFirst({
                                where: {
                                    referenceId: ticket.id,
                                    type: 'MAINTENANCE_COMMISSION',
                                    userId: currentTech.userId,
                                    createdAt: { gt: ticket.lastReturnedAt || ticket.createdAt }
                                }
                            });

                            if (!existingComm) {
                                const resolved = resolveCommission(currentTech, netProfit);
                                if (resolved.commissionAmount.gt(0)) {
                                    await tx.employeeTransaction.create({
                                        data: {
                                            userId: currentTech.userId,
                                            type: 'MAINTENANCE_COMMISSION',
                                            amount: resolved.commissionAmount.toNumber(),
                                            description: `عمولة إعادة صيانة: ${ticket.barcode}`,
                                            referenceId: ticket.id,
                                            referenceType: 'TICKET_REWORK'
                                        }
                                    });
                                }
                            }
                        }
                    }

                    // B. Handle Original Tech (Loss)
                    // If there is a net loss, and penalty is NOT waived, deduct from original tech.
                    if (netProfit.lt(0) && !isPenaltyWaived) {
                        const originalTech = await tx.technician.findUnique({
                            where: { id: originalTechId }
                        });
                        
                        if (originalTech && originalTech.userId) {
                            let lossShare = originalTech.lossSharePercentage || new Decimal(0);
                            if (lossShare.isNaN() || !lossShare.isFinite()) {
                                lossShare = new Decimal(0);
                            }
                            const expectedLoss = netProfit.abs().mul(lossShare.div(100));
                            
                            if (expectedLoss.gt(0)) {
                                const existingLoss = await tx.employeeTransaction.findFirst({
                                    where: {
                                        referenceId: ticket.id,
                                        type: 'LOSS_DEDUCTION',
                                        userId: originalTech.userId,
                                        createdAt: { gt: ticket.lastReturnedAt || ticket.createdAt }
                                    }
                                });

                                if (!existingLoss) {
                                    await tx.employeeTransaction.create({
                                        data: {
                                            userId: originalTech.userId,
                                            type: 'LOSS_DEDUCTION',
                                            amount: -expectedLoss.toNumber(), // Negative amount for debit
                                            description: `خصم خسارة إعادة صيانة (عيب فني): ${ticket.barcode}`,
                                            referenceId: ticket.id,
                                            referenceType: 'TICKET_REWORK'
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // 2. Record Collaborators Commissions
            const collaborators = await tx.ticketCollaborator.findMany({
                where: { ticketId: ticket.id },
                include: { technician: { select: { userId: true } } }
            });

            for (const collab of collaborators) {
                const repairPriceDec = new Decimal(ticket.repairPrice || 0);
                const partsCostDec = new Decimal(ticket.partsCost || 0);
                
                const laborPoolAmount = distributionData.laborPoolAmount || new Decimal(0);
                
                console.warn('[COMMISSION_BASE_MIGRATION]', { 
                    ticketId: ticket.id, 
                    oldBase: repairPriceDec.minus(partsCostDec).toNumber(), 
                    newBase: laborPoolAmount.toNumber() 
                });

                const collabRateDec = new Decimal(collab.commissionRate || 0);
                const collabCommissionDec = laborPoolAmount.mul(collabRateDec.div(100));

                if (collabCommissionDec.gt(0)) {
                    await tx.employeeTransaction.create({
                        data: {
                            userId: collab.technician.userId,
                            type: 'MAINTENANCE_COMMISSION',
                            amount: collabCommissionDec.toNumber(),
                            description: `عمولة تعاون (مساعد) تذكرة #${ticket.barcode}`,
                            referenceId: ticket.id,
                            referenceType: 'TICKET'
                        }
                    });
                }
            }
        }

        if (paymentMethod !== 'ACCOUNT' && !effectiveAmount.isZero()) {
            const shiftUpdate: import("@prisma/client").Prisma.ShiftUpdateInput = {};
            const absAmount = effectiveAmount.abs();

            switch (paymentMethod) {
                case 'CASH':
                    if (isActuallyRefund) {
                        shiftUpdate.totalRefunds = { increment: absAmount };
                        shiftUpdate.totalCashRefunds = { increment: absAmount };
                        shiftUpdate.totalTicketRevenueCash = { increment: absAmount.negated() };
                    } else {
                        shiftUpdate.totalCashSales = { increment: absAmount };
                        shiftUpdate.totalTicketRevenueCash = { increment: absAmount };
                    }
                    break;
                case 'VISA':
                    if (isActuallyRefund) {
                        shiftUpdate.totalRefunds = { increment: absAmount };
                        shiftUpdate.totalTicketRevenueCard = { increment: absAmount.negated() };
                    } else {
                        shiftUpdate.totalCardSales = { increment: absAmount };
                        shiftUpdate.totalTicketRevenueCard = { increment: absAmount };
                    }
                    break;
                case 'WALLET':
                    if (isActuallyRefund) {
                        shiftUpdate.totalRefunds = { increment: absAmount };
                        shiftUpdate.totalTicketRevenueWallet = { increment: absAmount.negated() };
                    } else {
                        shiftUpdate.totalWalletSales = { increment: absAmount };
                        shiftUpdate.totalTicketRevenueWallet = { increment: absAmount };
                    }
                    break;
                case 'INSTAPAY':
                    if (isActuallyRefund) {
                        shiftUpdate.totalRefunds = { increment: absAmount };
                        shiftUpdate.totalTicketRevenueInstapay = { increment: absAmount.negated() };
                    } else {
                        shiftUpdate.totalInstapay = { increment: absAmount };
                        shiftUpdate.totalTicketRevenueInstapay = { increment: absAmount };
                    }
                    break;
            }

            await tx.shift.update({
                where: { id: currentShift.id },
                data: shiftUpdate
            });

            const txType = isActuallyRefund ? 'REFUND' : 'TICKET';
            let defaultTreasuryId: string | null = null;
            if (currentUser.branchId) {
                const defaultTreasury = await tx.treasury.findFirst({
                    where: { branchId: currentUser.branchId, isDefault: true }
                });
                if (defaultTreasury) defaultTreasuryId = defaultTreasury.id;
            }

            if (currentUser.branchId && !defaultTreasuryId) {
                throw new Error("لا يوجد صندوق افتراضي لهذا الفرع. يرجى تكوين صندوق قبل استقبال المدفوعات.");
            }

            await tx.transaction.create({
                data: {
                    type: txType,
                    amount: effectiveAmount,
                    paymentMethod,
                    description: `Ticket #${ticket.barcode} (${isActuallyRefund ? 'Refund' : paymentType})`,
                    shiftId: currentShift.id,
                    treasuryId: defaultTreasuryId
                }
            });

            if (defaultTreasuryId) {
                // Use increment with signed value to correctly handle both payments and refunds
                await tx.treasury.update({
                    where: { id: defaultTreasuryId },
                    data: { balance: { increment: effectiveAmount } }
                });
            }

            // Unified Accounting Integration (Fix B17 & B18)
            let je: any = null;
            if (isActuallyRefund) {
                je = await AccountingEngine.recordRefund({
                    amount: effectiveAmount.abs().toNumber(),
                    method: paymentMethod,
                    description: `Ticket #${ticket.barcode} Refund`,
                    reference: ticket.id,
                    ticketId: ticket.id,
                    branchId: currentUser.branchId ?? undefined
                }, tx);
            } else {
                je = await AccountingEngine.recordMaintenancePayment({
                    amount: effectiveAmount,
                    method: paymentMethod,
                    description: `Ticket #${ticket.barcode} ${paymentType}`,
                    reference: ticket.id,
                    ticketId: ticket.id,
                    branchId: currentUser.branchId ?? undefined,
                    shiftId: currentShift.id,
                    isSync: false
                }, tx);
            }
            if (je && paymentRecordId) {
                await tx.repairPayment.update({
                    where: { id: paymentRecordId },
                    data: { journalEntryId: je.id }
                });
            }
        } else if (paymentMethod === 'ACCOUNT' && !effectiveAmount.isZero()) {
            // B18 Fix: Record deferred revenue in GL
            const je = await AccountingEngine.recordMaintenancePayment({
                amount: effectiveAmount,
                method: paymentMethod,
                description: `Ticket #${ticket.barcode} Account Deferred`,
                reference: ticket.id,
                ticketId: ticket.id,
                branchId: currentUser.branchId ?? undefined,
                shiftId: currentShift.id,
                isSync: false
            }, tx);
            if (je && paymentRecordId) {
                await tx.repairPayment.update({
                    where: { id: paymentRecordId },
                    data: { journalEntryId: je.id }
                });
            }
        }

        return updatedTicket;
    }, { timeout: 15000 });

    await updateShiftHeartbeat(currentShift.id).catch(console.error);

    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath('/tickets');
    revalidateTag('dashboard');

    return {
        success: true,
        ticket: transactionResult,
        message: `Payment of ${effectiveAmount} recorded`
    };
}, { permission: PERMISSIONS.TICKET_PAY });

/**
 * Refund excess advance deposit to customer (from cash drawer or customer account credit)
 */
export const refundTicketExcessToCustomer = secureAction(async (data: {
    ticketId: string;
    amount?: number;
    method?: 'CASH' | 'ACCOUNT';
    idempotencyKey?: string;
    csrfToken?: string;
}) => {
    const { ticketId, amount, method = 'CASH' } = data;
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error("لا توجد وردية مفتوحة. يرجى فتح وردية أولاً لصرف المبلغ من الدرج.");
    }
    const currentShift = shiftResult.shift;

    const ticket = await prisma.ticket.findFirst({
        where: { OR: [{ id: ticketId }, { barcode: ticketId }] },
        include: { customer: true }
    });
    if (!ticket) throw new Error("التذكرة غير موجودة.");

    const repairPrice = new Decimal(ticket.repairPrice?.toString() || '0');
    const amountPaid = new Decimal(ticket.amountPaid?.toString() || '0');
    const isCancelledOrRejected = ['REJECTED', 'CANCELLED', 'VOIDED'].includes(ticket.status);
    const excess = isCancelledOrRejected ? amountPaid : amountPaid.minus(repairPrice);

    if (amountPaid.lte(0)) {
        throw new Error("لا يوجد أي مبالغ مدفوعة أو عربون مسجل على هذه التذكرة لاسترداده.");
    }

    const refundAmount = amount ? new Decimal(amount) : (excess.gt(0) ? excess : amountPaid);
    if (refundAmount.lte(0)) {
        throw new Error("يجب تحديد مبلغ أكبر من صفر.");
    }
    if (refundAmount.gt(amountPaid)) {
        throw new Error(`مبلغ الصرف (${refundAmount}) أكبر من إجمالي المبلغ المدفوع على التذكرة (${amountPaid}).`);
    }

    // Deterministic Idempotency Key tied to the exact pre-settlement financial state
    const resolvedIdempotencyKey = data.idempotencyKey || (
        excess.gt(0) && (!amount || new Decimal(amount).eq(excess))
            ? `REFUND_EXCESS_${ticket.id}_${amountPaid.toFixed(2)}_${repairPrice.toFixed(2)}`
            : `REFUND_DEPOSIT_${ticket.id}_${amountPaid.toFixed(2)}_${refundAmount.toFixed(2)}`
    );

    const transactionResult = await prisma.$transaction(async (tx) => {
        // Check for existing idempotent journal entry
        const existingJe = await tx.journalEntry.findUnique({
            where: { idempotencyKey: resolvedIdempotencyKey }
        });
        if (existingJe) {
            console.warn(`[refundTicketExcessToCustomer] Idempotency collision rescued: ${resolvedIdempotencyKey}`);
            return ticket;
        }

        const newAmountPaid = amountPaid.minus(refundAmount);
        let paymentStatus = 'partial';
        if (newAmountPaid.gte(repairPrice) && repairPrice.gt(0)) {
            paymentStatus = 'paid';
        } else if (newAmountPaid.isZero()) {
            paymentStatus = 'unpaid';
        }

        // 1. Update ticket financials
        const updatedTicket = await tx.ticket.update({
            where: { id: ticket.id },
            data: {
                amountPaid: newAmountPaid,
                paymentStatus
            }
        });

        // 2. Create repair payment record for refund
        const paymentRecord = await tx.repairPayment.create({
            data: {
                ticketId: ticket.id,
                type: 'REFUND',
                amount: refundAmount.negated(),
                method,
                reference: resolvedIdempotencyKey,
                recordedBy: currentUser.name || currentUser.username || 'System'
            }
        });

        // 3. Cash Drawer / Treasury / Shift Tracking
        if (method === 'CASH') {
            let defaultTreasuryId: string | null = null;
            if (currentUser.branchId) {
                const defaultTreasury = await tx.treasury.findFirst({
                    where: { branchId: currentUser.branchId, isDefault: true }
                });
                if (defaultTreasury) defaultTreasuryId = defaultTreasury.id;
            }

            if (!defaultTreasuryId) {
                throw new Error("لا يوجد صندوق افتراضي لهذا الفرع.");
            }

            const treasury = await tx.treasury.findUnique({ where: { id: defaultTreasuryId } });
            if (treasury && new Decimal(treasury.balance?.toString() || '0').lt(refundAmount)) {
                throw new Error(`رصيد الدرج (${treasury.balance}) غير كافٍ لصرف المبلغ (${refundAmount}).`);
            }

            // Cross-Shift Reconciliation Check: Was the deposit taken in a prior closed shift?
            const priorPayments = await tx.repairPayment.findMany({
                where: { ticketId: ticket.id, type: { in: ['DEPOSIT', 'PAYMENT'] } },
                orderBy: { recordedAt: 'asc' }
            });
            const hasPriorShiftDeposit = priorPayments.some(p => new Date(p.recordedAt) < new Date(currentShift.openedAt));

            if (hasPriorShiftDeposit) {
                // Prior shift deposit: update crossShiftRefundsIssued so current shift sales don't become negative
                await tx.shift.update({
                    where: { id: currentShift.id },
                    data: {
                        crossShiftRefundsIssued: { increment: refundAmount },
                        totalRefunds: { increment: refundAmount }
                    }
                });
            } else {
                // Same shift: normal cash refund decrement
                await tx.shift.update({
                    where: { id: currentShift.id },
                    data: {
                        totalCashRefunds: { increment: refundAmount },
                        totalTicketRevenueCash: { increment: refundAmount.negated() },
                        totalRefunds: { increment: refundAmount }
                    }
                });
            }

            // Create Treasury Expense Transaction
            await tx.transaction.create({
                data: {
                    type: 'EXPENSE',
                    amount: refundAmount,
                    paymentMethod: 'CASH',
                    description: `صرف متبقي تذكرة #${ticket.barcode} للعميل`,
                    shiftId: currentShift.id,
                    treasuryId: defaultTreasuryId
                }
            });

            // Decrement treasury balance
            await tx.treasury.update({
                where: { id: defaultTreasuryId },
                data: { balance: { decrement: refundAmount } }
            });
        } else if (method === 'ACCOUNT' && ticket.customerId) {
            // Customer credit balance
            await tx.customer.update({
                where: { id: ticket.customerId },
                data: { balance: { decrement: refundAmount } }
            });

            await tx.customerTransaction.create({
                data: {
                    customerId: ticket.customerId,
                    type: 'CREDIT',
                    amount: refundAmount,
                    description: `إيداع متبقي تذكرة #${ticket.barcode} في الحساب`,
                    reference: ticket.id,
                    createdBy: currentUser.id,
                    branchId: currentUser.branchId || undefined
                }
            });
        }

        // 4. Double-Entry Journal Entry: Debit GL 2150 (Customer Liability) / Credit GL 1000 (Cash Drawer)
        const je = await AccountingEngine.recordTransaction({
            description: `رد متبقي عربون تذكرة #${ticket.barcode}`,
            reference: ticket.id,
            ticketId: ticket.id,
            branchId: currentUser.branchId ?? undefined,
            idempotencyKey: resolvedIdempotencyKey,
            lines: [
                {
                    accountCode: GL.LIABILITIES.CUSTOMER_DEPOSITS,
                    debit: refundAmount,
                    credit: new Decimal(0),
                    description: `إخلاء ذمة عربون العميل تذكرة #${ticket.barcode}`
                },
                {
                    accountCode: method === 'ACCOUNT' ? GL.ASSETS.RECEIVABLES : GL.ASSETS.CASH,
                    debit: new Decimal(0),
                    credit: refundAmount,
                    description: method === 'ACCOUNT' ? 'تخفيض حساب العميل' : 'صرف نقدي من الدرج'
                }
            ]
        }, tx);

        if (je) {
            await tx.repairPayment.update({
                where: { id: paymentRecord.id },
                data: { journalEntryId: je.id }
            });
        }

        return updatedTicket;
    });

    await updateShiftHeartbeat(currentShift.id).catch(console.error);

    revalidatePath(`/maintenance/tickets/${ticket.id}`);
    revalidatePath('/tickets');
    revalidateTag('dashboard');

    return {
        success: true,
        ticket: transactionResult,
        message: `تم صرف مبلغ ${refundAmount} ج.م للعميل بنجاح`
    };
}, { permission: PERMISSIONS.TICKET_PAY });

/**
 * Reopen an accidentally delivered ticket back to in-progress repair state,
 * completely reversing all side effects (GL distributions, commissions, warranty timers).
 */
export const reopenAccidentallyDeliveredTicket = secureAction(async (data: {
    ticketId: string;
    targetStatus?: string;
    reason?: string;
    csrfToken?: string;
}) => {
    const { ticketId, targetStatus = 'IN_PROGRESS', reason } = data;
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const ticket = await prisma.ticket.findFirst({
        where: { OR: [{ id: ticketId }, { barcode: ticketId }] }
    });
    if (!ticket) throw new Error("التذكرة غير موجودة.");

    if (ticket.status !== 'PAID_DELIVERED' && ticket.status !== 'DELIVERED') {
        throw new Error("هذه التذكرة ليست في حالة تسليم لإعادة فتحها.");
    }

    const updated = await prisma.$transaction(async (tx) => {
        // 1. Revert ticket status and clear delivery timestamps & profit snapshots
        const t = await tx.ticket.update({
            where: { id: ticket.id },
            data: {
                status: targetStatus,
                deliveredAt: null,
                warrantyExpiryDate: null,
                // Reset profit distribution snapshots to 0.00
                finalCustomerPrice: new Decimal(0),
                techBillingPrice: new Decimal(0),
                partCostPrice: new Decimal(0),
                laborPoolAmount: new Decimal(0),
                techCommissionAmount: new Decimal(0),
                centerLaborProfit: new Decimal(0),
                centerPartProfit: new Decimal(0),
                commissionAmount: new Decimal(0),
                netProfit: new Decimal(0)
            }
        });

        // 2. Reverse GL distribution journal entry if it was created
        const distJournalKey = `TICKET_DIST_${ticket.id}`;
        const existingJournal = await tx.journalEntry.findUnique({
            where: { idempotencyKey: distJournalKey },
            include: { lines: true }
        });

        if (existingJournal) {
            const reversalKey = `TICKET_DIST_REVERSAL_${ticket.id}_${Date.now()}`;
            await AccountingEngine.reverseJournalEntry(existingJournal.id, reversalKey, tx);
        }

        // 3. Compensate / Reverse technician commission in EmployeeTransaction
        const commTransactions = await tx.employeeTransaction.findMany({
            where: {
                referenceId: ticket.id,
                type: 'MAINTENANCE_COMMISSION'
            }
        });

        for (const comm of commTransactions) {
            await tx.employeeTransaction.create({
                data: {
                    userId: comm.userId,
                    type: 'COMMISSION_REVERSAL',
                    amount: new Decimal(comm.amount?.toString() || '0').negated(),
                    description: `عكس عمولة تذكرة #${ticket.barcode} (إلغاء التسليم المبكر)`,
                    referenceId: ticket.id,
                    referenceType: 'TICKET',
                    branchId: comm.branchId ?? undefined
                }
            });
        }

        // 4. Log Action
        await tx.actionLog.create({
            data: {
                action: 'REOPEN_DELIVERED_TICKET',
                details: `إعادة فتح تذكرة #${ticket.barcode} من حالة ${ticket.status} إلى ${targetStatus}. السبب: ${reason || 'إلغاء تسليم مبكر'}`,
                userId: currentUser.id,
                branchId: currentUser.branchId ?? undefined
            }
        }).catch(err => console.warn('[ActionLog] Non-critical fail:', err));

        return t;
    });

    revalidatePath(`/maintenance/tickets/${ticket.id}`);
    revalidatePath('/tickets');
    revalidateTag('dashboard');

    return {
        success: true,
        ticket: updated,
        message: "تم إلغاء التسليم المبكر وإعادة فتح مسار الصيانة وعكس القيود والعمولات بنجاح."
    };
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Get or create customer for ticket payment
 */
export const getOrCreateCustomer = secureAction(async (data: {
    phone: string;
    name?: string;
    email?: string;
    csrfToken?: string;
}) => {
    const { phone, name, email } = data;

    let customer = await prisma.customer.findUnique({
        where: { phone }
    });

    if (!customer && name) {
        customer = await prisma.customer.create({
            data: { phone, name, email }
        });
    }

    if (!customer) throw new Error('Customer not found');

    return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        balance: new Decimal(customer.balance?.toString() || 0).toNumber(),
        creditLimit: customer.creditLimit ? new Decimal(customer.creditLimit.toString()).toNumber() : null
    };
}, { permission: PERMISSIONS.TICKET_VIEW, requireCSRF: false });

/**
 * Add a collaborator (assistant engineer) to a ticket
 */
export const addCollaborator = secureAction(async (data: {
    ticketId: string,
    technicianId: string,
    commissionRate: number,
    csrfToken?: string;
}) => {
    const { ticketId, technicianId, commissionRate } = data;
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    // Branch Security: Ensure ticket exists and is in the user's branch
    const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { currentBranchId: true }
    });

    if (!ticket) throw new Error("Ticket not found");
    const isGlobalAdmin = currentUser.isGlobalAdmin || hasPermission(currentUser.permissions, '*');
    if (!isGlobalAdmin && currentUser.branchId && ticket.currentBranchId !== currentUser.branchId) {
        throw new Error("Unauthorized: Ticket belongs to another branch");
    }

    // Check if collaborator already exists
    const existing = await prisma.ticketCollaborator.findUnique({
        where: {
            ticketId_technicianId: { ticketId, technicianId }
        }
    });

    if (existing) throw new Error("Technician is already a collaborator");

    const collaborator = await prisma.ticketCollaborator.create({
        data: {
            ticketId,
            technicianId,
            commissionRate: new Decimal(commissionRate)
        },
        include: { technician: true }
    });

    revalidatePath(`/maintenance/tickets/${ticketId}`);
    return { success: true, collaborator };
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Remove a collaborator from a ticket
 */
export const removeCollaborator = secureAction(async (data: {
    ticketId: string,
    technicianId: string,
    csrfToken?: string;
}) => {
    const { ticketId, technicianId } = data;
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    // Branch Security
    const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { currentBranchId: true }
    });

    if (!ticket) throw new Error("Ticket not found");
    const isGlobalAdmin = currentUser.isGlobalAdmin || hasPermission(currentUser.permissions, '*');
    if (!isGlobalAdmin && currentUser.branchId && ticket.currentBranchId !== currentUser.branchId) {
        throw new Error("Unauthorized: Ticket belongs to another branch");
    }

    try {
        await prisma.ticketCollaborator.delete({
            where: {
                ticketId_technicianId: { ticketId, technicianId }
            }
        });
    } catch (error: unknown) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2025') {
            throw error;
        }
    }

    revalidatePath(`/maintenance/tickets/${ticketId}`);
    return { success: true };
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Update collaborator commission rate
 */
export const updateCollaboratorCommission = secureAction(async (data: {
    ticketId: string,
    technicianId: string,
    commissionRate: number,
    csrfToken?: string;
}) => {
    const { ticketId, technicianId, commissionRate } = data;
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    // Branch Security
    const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { currentBranchId: true }
    });

    if (!ticket) throw new Error("Ticket not found");
    const isGlobalAdmin = currentUser.isGlobalAdmin || hasPermission(currentUser.permissions, '*');
    if (!isGlobalAdmin && currentUser.branchId && ticket.currentBranchId !== currentUser.branchId) {
        throw new Error("Unauthorized: Ticket belongs to another branch");
    }

    await prisma.ticketCollaborator.update({
        where: {
            ticketId_technicianId: { ticketId, technicianId }
        },
        data: { commissionRate: new Decimal(commissionRate) }
    });

    revalidatePath(`/maintenance/tickets/${ticketId}`);
    return { success: true };
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Get all technicians
 */
export const getAllTechnicians = secureAction(async () => {
    try {
        const technicians = await prisma.technician.findMany({
            where: { 
                deletedAt: null,
                user: { isFrozen: false }
            },
            orderBy: { name: 'asc' }
        });
        return { success: true, technicians };
    } catch (error: unknown) {
        console.error("Error fetching all technicians:", error);
        return { success: false, message: "Failed to fetch technicians", technicians: [] };
    }
}, { permission: PERMISSIONS.TICKET_VIEW, requireCSRF: false });

/**
 * Fetch tickets that have been returned for re-repair
 */
export const getReturnedTickets = secureAction(async () => {
    try {
        const currentUser = await getCurrentUser();
        const branchFilter = getBranchFilter(currentUser);

        const where: Prisma.TicketWhereInput = {
            OR: [
                { returnCount: { gt: 0 } },
                { status: { in: ['RETURNED_FOR_REFIX', 'RETURNED', 'RETURNED_WARRANTY', 'VOIDED'] } }
            ]
        };

        if (branchFilter.currentBranchId) {
            where.currentBranchId = branchFilter.currentBranchId;
        }

        const tickets = await prisma.ticket.findMany({
            where,
            include: {
                technician: { select: { name: true } }
            },
            orderBy: { lastReturnedAt: 'desc' }
        });

        return serialize({
            success: true,
            tickets: tickets.map(t => ({
                id: t.id,
                barcode: t.barcode,
                customerName: t.customerName,
                customerPhone: t.customerPhone,
                deviceBrand: t.deviceBrand,
                deviceModel: t.deviceModel,
                warrantyExpiryDate: t.warrantyExpiryDate,
                returnCount: t.returnCount,
                lastReturnedAt: t.lastReturnedAt,
                returnReason: t.returnReason,
                issueDescription: t.issueDescription,
                status: t.status,
                technicianName: t.technician?.name || null,
                createdAt: t.createdAt
            })),
            count: tickets.length
        });

    } catch (error) {
        console.error('Error fetching returned tickets:', error);
        return { success: false, message: 'Failed to fetch returned tickets', tickets: [], count: 0 };
    }
}, { permission: PERMISSIONS.TICKET_VIEW, requireCSRF: false });

/**
 * Fetch tickets that are currently under warranty
 */
export const getWarrantyTickets = secureAction(async () => {
    try {
        const currentUser = await getCurrentUser();
        const branchFilter = getBranchFilter(currentUser);

        const where: Prisma.TicketWhereInput = {
            status: { in: ['DELIVERED', 'COMPLETED', 'PICKED_UP', 'PAID_DELIVERED'] }
        };

        if (branchFilter.currentBranchId) {
            where.currentBranchId = branchFilter.currentBranchId;
        }

        const tickets = await prisma.ticket.findMany({
            where,
            include: {
                technician: { select: { name: true } }
            },
            orderBy: { warrantyExpiryDate: 'asc' }
        });

        return serialize({
            success: true,
            tickets: tickets.map(t => ({
                id: t.id,
                barcode: t.barcode,
                customerName: t.customerName,
                customerPhone: t.customerPhone,
                deviceBrand: t.deviceBrand,
                deviceModel: t.deviceModel,
                warrantyExpiryDate: t.warrantyExpiryDate,
                deliveredAt: t.deliveredAt,
                issueDescription: t.issueDescription,
                status: t.status,
                returnCount: t.returnCount,
                technicianName: t.technician?.name || null
            })),
            count: tickets.length
        });
    } catch (error) {
        console.error('Error fetching warranty tickets:', error);
        return { success: false, message: 'Failed to fetch warranty tickets', tickets: [], count: 0 };
    }
}, { permission: PERMISSIONS.TICKET_VIEW, requireCSRF: false });

/**
 * Perform a full return for a ticket (Refund payment + Return parts to stock)
 */
export const fullTicketReturn = secureAction(async (data: {
    ticketId: string,
    reason: string,
    damagedPartIds?: string[],
    lossResponsibility?: 'TECH' | 'CENTER' | 'SPLIT',
    csrfToken?: string
}) => {
    const { ticketId, reason, damagedPartIds = [], lossResponsibility = 'CENTER' } = data;
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    // 1. Fetch ticket with parts and payments
    const ticket = await prisma.ticket.findFirst({
        where: { OR: [{ id: ticketId }, { barcode: ticketId }] },
        include: { 
            parts: true,
            payments: true,
            customer: true
        }
    });

    if (!ticket) throw new Error("Ticket not found");
    const allowedStatuses = ['DELIVERED', 'PAID_DELIVERED', 'RETURNED_FOR_REFIX'];
    if (!allowedStatuses.includes(ticket.status)) {
        throw new Error("Cannot return this ticket in its current status.");
    }

    // 2. Auth/Guard check
    const canReturnTicket = hasPermission(currentUser.permissions, PERMISSIONS.TICKET_OVERRIDE) || hasPermission(currentUser.permissions, PERMISSIONS.TICKET_EDIT);
    if (!canReturnTicket) {
        throw new Error("Only users with Ticket Override or Edit permission can perform a full ticket return.");
    }

    // 3. Prevent multiple returns
    if (ticket.status === TicketStatus.VOIDED) {
        throw new Error("This ticket has already been voided/returned.");
    }

    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error('No active shift. Please open a shift first.');
    }
    const currentShift = shiftResult.shift;

    const result = await prisma.$transaction(async (tx) => {
        // --- Part 1: Stock Reversal ---
        let totalDamagedPartsCost = new Decimal(0);
        let totalPartsCostReversal = new Decimal(0);
        for (const part of ticket.parts) {
            if (part.productId && new Decimal(part.quantity).gt(0)) {
                const isDamaged = damagedPartIds.includes(part.id);
                const partCost = new Decimal(part.cost?.toString() || 0).mul(part.quantity);
                
                if (isDamaged) {
                    totalDamagedPartsCost = totalDamagedPartsCost.plus(partCost);
                } else {
                    totalPartsCostReversal = totalPartsCostReversal.plus(partCost);
                }

                await handleReturnedPartStock(tx, {
                    productId: part.productId,
                    warehouseId: part.warehouseId,
                    quantity: new Decimal(part.quantity).toNumber(),
                    isDamaged: isDamaged,
                    reason: `${isDamaged ? '[DAMAGED]' : '[GOOD]'} Full Return of Ticket #${ticket.barcode}`,
                    performedById: currentUser.id
                });
            }
        }

        // --- Part 2: Financial Refund ---
        const amountToRefund = new Decimal(ticket.amountPaid?.toString() || 0);
        
        if (amountToRefund.gt(0)) {
            const lastPayment = ticket.payments.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
            const refundMethod = lastPayment?.method || ticket.paymentMethod || 'CASH';

            // 1. Create Refund record in RepairPayment
            const payment = await tx.repairPayment.create({
                data: {
                    ticketId: ticket.id,
                    type: 'REFUND',
                    amount: amountToRefund,
                    method: refundMethod,
                    reference: `Full Return: ${reason}`,
                    recordedBy: currentUser.name || currentUser.username || 'System'
                }
            });

            // 2. Handle Customer Balance Reversal if applicable
            if (ticket.customerId) {
                const isDeferred = refundMethod === 'ACCOUNT';
                
                await tx.customerTransaction.create({
                    data: {
                        customerId: ticket.customerId,
                        type: 'CREDIT', // Standardized to CREDIT for returns
                        amount: amountToRefund,
                        description: `Ticket #${ticket.barcode} - Full Return Refund`,
                        reference: ticket.id,
                        createdBy: currentUser.id
                    }
                });

                if (isDeferred) {
                    await tx.customer.update({
                        where: { id: ticket.customerId },
                        data: { balance: { decrement: amountToRefund } }
                    });
                }
            }

            // 2.5 Reverse the original distribution journal entry
            const lastEntry = await tx.journalEntry.findFirst({
                where: { reference: ticket.id },
                orderBy: { createdAt: 'desc' }
            });

            if (lastEntry) {
                await AccountingEngine.reverseJournalEntry(
                    lastEntry.id,
                    `REVERSAL_${lastEntry.id}`,
                    tx
                );
            }

            // 💰 [NEW] Profit-First Loss Absorption (Clawback)
            if (ticket.technicianId) {
                const tech = await tx.technician.findUnique({ where: { id: ticket.technicianId } });
                if (tech) {
                    // 💰 Refined "Profit-First" Absorption logic
                    // Step 1: Check if the commission was actually POSTED to the ledger (Physical Transaction)
                    const existingComm = await tx.employeeTransaction.findFirst({
                        where: { 
                            userId: tech.userId,
                            referenceId: ticket.id,
                            type: 'MAINTENANCE_COMMISSION'
                        }
                    });

                    const commissionAmount = new Decimal(ticket.commissionAmount?.toString() || 0);
                    
                    // Step 2: "Profit-First" Absorption
                    // We absorb the damaged part cost from the profit (commission) first.
                    const excessLoss = Decimal.max(0, totalDamagedPartsCost.minus(commissionAmount));
                    
                    let responsibilityMultiplier = 0;
                    if (lossResponsibility === 'TECH') responsibilityMultiplier = 1;
                    else if (lossResponsibility === 'SPLIT') responsibilityMultiplier = 0.5;
                    
                    const lossShare = excessLoss.mul(responsibilityMultiplier);

                    // Final Tech Deduction Logic:
                    // If commission was POSTED -> Reverse (Comm + Loss Share)
                    // If commission was NOT POSTED -> Only deduct (Loss Share). 
                    // The "Virtual Commission" will disappear automatically from the UI when status changes.
                    const totalTechDeduction = existingComm 
                        ? commissionAmount.plus(lossShare)
                        : lossShare;

                    if (totalTechDeduction.gt(0)) {
                        await tx.employeeTransaction.create({
                            data: {
                                userId: tech.userId,
                                type: 'MAINTENANCE_COMMISSION_REVERSAL',
                                amount: totalTechDeduction,
                                description: `Clawback: Full Return for Ticket #${ticket.barcode} ${totalDamagedPartsCost.gt(0) ? `(Includes Loss Absorption for ${totalDamagedPartsCost} EGP)` : ''} ${!existingComm ? "[Note: No original comm was posted, only hardware loss deducted]" : ""}`,
                                referenceId: ticket.id,
                                referenceType: 'TICKET_RETURN',
                                branchId: ticket.currentBranchId || undefined
                            }
                        });
                    }

                    // 🤝 Collaborator Reversal Logic (Always full reversal if paid)
                    if (existingComm) {
                        const collaborators = await tx.ticketCollaborator.findMany({
                            where: { ticketId: ticket.id },
                            include: { technician: { select: { userId: true } } }
                        });

                        for (const collab of collaborators) {
                            // Find the actual commission transaction for this collaborator
                            const postedCollabComm = await tx.employeeTransaction.findFirst({
                                where: {
                                    userId: collab.technician.userId,
                                    referenceId: ticket.id,
                                    type: 'MAINTENANCE_COMMISSION'
                                }
                            });

                            if (postedCollabComm) {
                                await tx.employeeTransaction.create({
                                    data: {
                                        userId: collab.technician.userId,
                                        type: 'MAINTENANCE_COMMISSION_REVERSAL',
                                        amount: postedCollabComm.amount,
                                        description: `عكس عمولة تعاون (مرتجع كلي) - تذكرة #${ticket.barcode}`,
                                        referenceId: ticket.id,
                                        referenceType: 'TICKET_RETURN',
                                        branchId: ticket.currentBranchId || undefined
                                    }
                                });
                            }
                        }
                    }
                }
            }

            // 3. Update Shift Balances (Standardized to use totalRefunds)
            const absAmount = amountToRefund;
            if (refundMethod === 'ACCOUNT' || refundMethod === 'DEFERRED') {
                await tx.shift.update({
                    where: { id: currentShift.id },
                    data: {
                        totalRefunds: { increment: absAmount },
                        totalAccountRefunds: { increment: absAmount }
                    }
                });
            } else {
                const shiftUpdate: any = {
                    totalRefunds: { increment: absAmount }
                };

                switch (refundMethod) {
                    case 'CASH':
                        shiftUpdate.totalCashRefunds = { increment: absAmount };
                        shiftUpdate.totalTicketRevenueCash = { increment: absAmount.negated() };
                        break;
                    case 'VISA':
                    case 'CARD':
                    case 'MASTERCARD':
                        shiftUpdate.totalTicketRevenueCard = { increment: absAmount.negated() };
                        break;
                    case 'WALLET':
                    case 'VODAFONE_CASH':
                        shiftUpdate.totalTicketRevenueWallet = { increment: absAmount.negated() };
                        break;
                    case 'INSTAPAY':
                        shiftUpdate.totalTicketRevenueInstapay = { increment: absAmount.negated() };
                        break;
                }

                await tx.shift.update({
                    where: { id: currentShift.id },
                    data: shiftUpdate
                });

                let treasuryId: string | null = null;
                if (currentUser.branchId) {
                    const defaultTreasury = await tx.treasury.findFirst({
                        where: { branchId: currentUser.branchId, isDefault: true }
                    });
                    treasuryId = defaultTreasury?.id || null;
                }

                if (refundMethod !== 'ACCOUNT' && refundMethod !== 'DEFERRED' && currentUser.branchId && !treasuryId) {
                    throw new Error("لا يوجد صندوق افتراضي لهذا الفرع. يرجى تكوين صندوق قبل إتمام الاسترجاع.");
                }

                await tx.transaction.create({
                    data: {
                        type: 'REFUND',
                        amount: new Decimal(-amountToRefund),
                        paymentMethod: refundMethod,
                        description: `Ticket #${ticket.barcode} - Full Return`,
                        shiftId: currentShift.id,
                        treasuryId
                    }
                });

                if (treasuryId) {
                    const treasury = await tx.treasury.findUnique({ where: { id: treasuryId } });
                    if (treasury && new Decimal(treasury.balance).lt(amountToRefund)) {
                        const canGoNegative = hasPermission(currentUser?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
                        if (!canGoNegative) {
                            throw new Error(`رصيد الخزنة غير كافٍ (${Number(treasury.balance)}). ولا تملك صلاحية السحب بالسالب لإتمام المرتجع.`);
                        }
                    }
                    await tx.treasury.update({
                        where: { id: treasuryId },
                        data: { balance: { decrement: new Decimal(amountToRefund) } }
                    });
                }
            }

            // 5. Unified Double-Entry Accounting
            const je = await AccountingEngine.recordRefund({
                amount: amountToRefund,
                method: refundMethod,
                description: `Full Return: Ticket #${ticket.barcode}`,
                reference: ticket.id,
                ticketId: ticket.id,
                cogsReversal: totalPartsCostReversal.toNumber(),
                spoilageAmount: totalDamagedPartsCost.toNumber(),
                branchId: currentUser.branchId ?? undefined
            }, tx);

            if (je) {
                await tx.repairPayment.update({
                    where: { id: payment.id },
                    data: { journalEntryId: je.id }
                });
            }
        }

        // --- Part 3: Ticket Status Update ---
        const originalCommission = new Decimal(ticket.commissionAmount?.toString() || 0);
        // Save loss fields BEFORE zeroing so salary-utils can dedup virtual clawback entries
        const savedExcessLoss = Decimal.max(0, totalDamagedPartsCost.minus(originalCommission));
        const savedLossResponsibility = lossResponsibility;

        await tx.ticket.update({
            where: { id: ticket.id },
            data: {
                status: TicketStatus.VOIDED,
                amountPaid: new Decimal(0),
                repairPrice: new Decimal(0),
                partsCost: new Decimal(0),
                techBillingPrice: new Decimal(0),
                partCostPrice: new Decimal(0),
                netProfit: new Decimal(0),
                commissionAmount: new Decimal(0),
                // 💰 Persist loss audit fields — required by salary-utils virtual-entry dedup
                commissionClawback: originalCommission,
                excessLossAmount: savedExcessLoss,
                lossResponsibility: savedLossResponsibility,
                returnReason: reason,
                lastReturnedAt: new Date(),
                returnCount: { increment: 1 }
            }
        });

        // 3.5 Void Sequels (Re-fixes/Warranty Returns)
        await tx.ticket.updateMany({
            where: {
                parentTicketId: ticket.id,
                status: { not: TicketStatus.VOIDED }
            },
            data: {
                status: TicketStatus.VOIDED,
                repairPrice: new Decimal(0),
                partsCost: new Decimal(0),
                techBillingPrice: new Decimal(0),
                partCostPrice: new Decimal(0),
                netProfit: new Decimal(0),
                commissionAmount: new Decimal(0),
                returnReason: `Parent Ticket #${ticket.barcode} - Full Refunded/Returned`
            }
        });

        for (const part of ticket.parts) {
            await tx.ticketPart.update({
                where: { id: part.id },
                data: {
                    status: 'REFUNDED',
                    refundedQty: part.quantity,
                    deletedAt: new Date(),
                    isDamaged: false
                }
            });
        }

        return { success: true };
    }, { timeout: 90000 });

    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    revalidatePath(`/maintenance/tickets/${ticketId}`);
    revalidatePath('/tickets');
    revalidatePath('/customers');
    
    return result;
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Initiate a Warranty Return ticket from a closed/delivered parent ticket.
 * Creates a new child ticket inheriting device + customer data.
 * Requires an active shift (warranty service ops are tracked in shifts).
 */
export const initiateWarrantyReturn = secureAction(async (parentTicketId: string) => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    let branchId = user.branchId;
    if (!branchId) {
        const isAdmin = user.role === 'ADMIN' || user.role === 'Admin' || user.role === 'مدير النظام' || user.role === 'المالك';
        if (isAdmin) {
            const { ensureMainBranch } = await import('@/lib/ensure-main-branch');
            branchId = await ensureMainBranch().catch(() => null);
        }
    }

    if (!branchId) throw new Error("User must be assigned to a branch.");

    // SHIFT GUARD: active shift required
    const shiftResult = await getCurrentShiftInternal({ userId: user.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error("لا توجد وردية مفتوحة. يرجى فتح وردية أولاً.");
    }
    const currentShift = shiftResult.shift;

    // Fetch parent with its existing return children for barcode numbering
    const parent = await prisma.ticket.findUnique({
        where: { id: parentTicketId },
        include: { returnTickets: { select: { id: true } } }
    });

    if (!parent) throw new Error("التذكرة الأصلية غير موجودة.");

    // 1. Status guard: must be delivered or paid
    const allowedStatuses = ['DELIVERED', 'PAID_DELIVERED', 'RETURNED_FOR_REFIX'];
    if (!allowedStatuses.includes(parent.status)) {
        throw new Error("يمكن إنشاء مرتجع الضمان فقط من تذكرة مسلَّمة أو مدفوعة.");
    }

    // 2. Warranty expiry guard — use warrantyExpiryDate (managed by WarrantyCard)
    if (!parent.warrantyExpiryDate) {
        throw new Error("هذه التذكرة لا تملك ضماناً مسجلاً.");
    }
    const now = new Date();
    if (parent.warrantyExpiryDate < now) {
        throw new Error("انتهت صلاحية الضمان. لا يمكن إنشاء مرتجع ضمان.");
    }

    // 3. Generate barcode: Find the Root Parent for flattened numbering (-R1, -R2, etc.)
    let root = parent;
    while (root.parentTicketId) {
        const nextParent = await prisma.ticket.findUnique({
            where: { id: root.parentTicketId },
            include: { returnTickets: { select: { id: true } } }
        });
        if (!nextParent) break;
        root = nextParent;
    }

    const rootBase = root.barcode.replace(/-R\d+.*$/, '');
    
    // Use a date-based and random entropy fragment to ensure uniqueness in offline/multi-terminal setups
    const dateCode = new Date().getTime().toString(36).slice(-4).toUpperCase();
    const entropy = Math.random().toString(36).substring(2, 4).toUpperCase();
    
    // Count all existing returns sharing this root to determine the next index
    const returnCount = await prisma.ticket.count({
        where: { barcode: { startsWith: `${rootBase}-R` } }
    });

    const returnIndex = returnCount + 1;
    // Format: BASE-RX-TIMESTAMP_HEX (e.g., ABC-R1-KZ9J)
    const newBarcode = `${rootBase}-R${returnIndex}-${dateCode}`;

    // Collision guard (3 retries with incremented index)
    let finalBarcode = newBarcode;
    for (let i = 0; i < 3; i++) {
        const exists = await prisma.ticket.findUnique({ where: { barcode: finalBarcode } });
        if (!exists) break;
        finalBarcode = `${rootBase}-R${returnIndex + i + 1}-${dateCode}${entropy}`;
        if (i === 2) throw new Error("تعذّر توليد رقم تذكرة فريد. حاول مرة أخرى.");
    }

    const result = await prisma.$transaction(async (tx) => {
        // Create child return ticket
        const childTicket = await tx.ticket.create({
            data: {
                barcode: finalBarcode,
                // Inherit customer data
                customerName: parent.customerName,
                customerPhone: parent.customerPhone,
                customerEmail: parent.customerEmail || null,
                customerId: parent.customerId || null,
                clientUserId: parent.clientUserId || null,
                clientSupplierId: parent.clientSupplierId || null,
                // Inherit device data
                deviceBrand: parent.deviceBrand,
                deviceModel: parent.deviceModel,
                deviceImei: parent.deviceImei || null,
                deviceColor: parent.deviceColor || null,
                // Inherit security
                securityCode: parent.securityCode || null,
                patternData: parent.patternData || null,
                // New issue — staff will fill in
                issueDescription: `مرتجع ضمان — مشكلة مترتبة على إصلاح التذكرة #${parent.barcode}`,
                conditionNotes: null,
                // Warranty return flags
                status: parent.technicianId ? 'AT_CENTER' : 'NEW',
                isWarrantyReturn: true,
                parentTicketId: parent.id,
                technicianId: parent.technicianId || null,
                startedAt: parent.technicianId ? new Date() : null,
                // Zero cost — warranty claim
                initialQuote: new Decimal(0),
                repairPrice: new Decimal(0),
                partsCost: new Decimal(0),
                deposit: new Decimal(0),
                amountPaid: new Decimal(0),
                // Operational
                currentBranchId: branchId,
                shiftId: currentShift.id,
            }
        });

        // Audit note on child
        await tx.ticketNote.create({
            data: {
                ticketId: childTicket.id,
                text: `📋 مرتجع ضمان — منشأ من التذكرة الأصلية #${parent.barcode}`,
                author: user.name || user.username || "System",
                isInternal: true,
            }
        });

        // Audit note on parent
        await tx.ticketNote.create({
            data: {
                ticketId: parent.id,
                text: `🔄 تم إنشاء تذكرة مرتجع ضمان: #${finalBarcode}`,
                author: user.name || user.username || "System",
                isInternal: true,
            }
        });

        // Track in shift
        await tx.shift.update({
            where: { id: currentShift.id },
            data: { totalTickets: { increment: 1 }, lastHeartbeat: new Date() }
        });

        return childTicket;
    });

    revalidatePath('/ar/maintenance/tickets');
    revalidatePath(`/ar/maintenance/tickets/${parentTicketId}`);
    revalidateTag('dashboard');

    return { success: true, newTicketId: result.id, newBarcode: result.barcode };
}, { permission: PERMISSIONS.TICKET_EDIT, requireCSRF: false });

/**
 * Handle partial refund for maintenance tickets
 */
export const partialRefundTicket = secureAction(async (data: {
    ticketId: string;
    items: Array<{ itemId: string; quantity: number; isDamaged: boolean }>;
    refundMethod: 'CASH' | 'STORE_CREDIT';
    csrfToken?: string;
}) => {
    const { ticketId, items, refundMethod } = data;
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Unauthorized");

    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error('No active shift.');
    }
    const currentShift = shiftResult.shift;

    const result = await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.findFirst({
            where: { OR: [{ id: ticketId }, { barcode: ticketId }] },
            include: { parts: true, customer: true }
        });

        if (!ticket) throw new Error("Ticket not found");

        let totalRefundAmount = new Decimal(0);
        let totalCogsReversal = new Decimal(0);
        let totalSpoilageAmount = new Decimal(0);

        for (const returnItem of items) {
            const part = ticket.parts.find(p => p.id === returnItem.itemId);
            if (!part) throw new Error(`Part ${returnItem.itemId} not found in ticket`);

            const available = new Decimal(part.quantity).minus(part.refundedQty || 0);
            if (new Decimal(returnItem.quantity).gt(available)) {
                throw new Error(`Cannot refund more than available for ${part.name || 'part'}`);
            }

            // 1. Update TicketPart counter
            await tx.ticketPart.update({
                where: { id: part.id },
                data: {
                    refundedQty: { increment: returnItem.quantity },
                    status: available.equals(returnItem.quantity) ? 'REFUNDED' : part.status
                }
            });

            // 2. Handle Stock Reversal
            if (part.productId) {
                await handleReturnedPartStock(tx, {
                    productId: part.productId,
                    warehouseId: part.warehouseId,
                    quantity: new Decimal(returnItem.quantity).toNumber(),
                    isDamaged: returnItem.isDamaged,
                    reason: `Partial Refund: Ticket #${ticket.barcode}`,
                    performedById: currentUser.id
                });
                
                const itemCost = new Decimal(part.cost).times(returnItem.quantity);
                if (returnItem.isDamaged) {
                    totalSpoilageAmount = totalSpoilageAmount.plus(itemCost);
                } else {
                    totalCogsReversal = totalCogsReversal.plus(itemCost);
                }
            }

            totalRefundAmount = totalRefundAmount.plus(new Decimal(part.price).times(returnItem.quantity));
        }

        // 3. Create Refund Payment Record
        let payment: any = null;
        if (totalRefundAmount.gt(0)) {
            payment = await tx.repairPayment.create({
                data: {
                    ticketId: ticket.id,
                    type: 'REFUND',
                    amount: totalRefundAmount,
                    method: refundMethod === 'STORE_CREDIT' ? 'ACCOUNT' : 'CASH',
                    reference: `Partial Refund of ${items.length} items`,
                    recordedBy: currentUser.name || "System"
                }
            });

            // 4. Recalculate Financial Snapshot — Profit-First Loss Absorption
            const newRepairPrice = new Decimal(ticket.repairPrice).minus(totalRefundAmount);
            // Note: partsCost decreases by totalCogsReversal (non-damaged returns)
            const newPartsCost = new Decimal(ticket.partsCost).minus(totalCogsReversal);
            const newNetProfit = newRepairPrice.minus(newPartsCost);

            let newCommissionAmount = new Decimal(0);
            let excessLossAmount = new Decimal(0);

            if (newNetProfit.gt(0)) {
                newCommissionAmount = newNetProfit.times(new Decimal(ticket.commissionRate || 0)).div(100);
            } else if (newNetProfit.lt(0)) {
                excessLossAmount = newNetProfit.abs();
            }

            // 5. Update Ticket Totals with Financial Integrity
            await tx.ticket.update({
                where: { id: ticket.id },
                data: {
                    repairPrice: newRepairPrice,
                    partsCost: newPartsCost,
                    netProfit: newNetProfit,
                    commissionAmount: newCommissionAmount,
                    excessLossAmount: excessLossAmount,
                    // If loss exists, default to CENTER responsibility if not previously set, 
                    // or allow manager to override later
                    lossResponsibility: excessLossAmount.gt(0) && !ticket.lossResponsibility ? 'CENTER' : ticket.lossResponsibility,
                    amountPaid: { decrement: totalRefundAmount },
                    paymentStatus: newRepairPrice.gt(0) ? 'partial' : 'unpaid',
                    lastReturnedAt: new Date(),
                    returnCount: { increment: 1 }
                }
            });


            // 5. Shift & Treasury (if Cash)
            if (refundMethod === 'CASH') {
                await tx.shift.update({
                    where: { id: currentShift.id },
                    data: {
                        totalRefunds: { increment: totalRefundAmount },
                        totalCashRefunds: { increment: totalRefundAmount }
                    }
                });

                let treasuryId: string | null = null;
                if (currentUser.branchId) {
                    const treasury = await tx.treasury.findFirst({
                        where: { branchId: currentUser.branchId, isDefault: true }
                    });
                    treasuryId = treasury?.id || null;
                }

                if (treasuryId) {
                    await tx.treasury.update({
                        where: { id: treasuryId },
                        data: { balance: { decrement: totalRefundAmount } }
                    });
                }

                await tx.transaction.create({
                    data: {
                        type: 'REFUND',
                        amount: totalRefundAmount.negated(),
                        paymentMethod: 'CASH',
                        description: `Partial Refund Ticket #${ticket.barcode}`,
                        shiftId: currentShift.id,
                        treasuryId
                    }
                });
            }

            // 6. Accounting
            const je = await AccountingEngine.recordRefund({
                amount: totalRefundAmount.toNumber(),
                method: refundMethod === 'STORE_CREDIT' ? 'ACCOUNT' : 'CASH',
                description: `Partial Refund: Ticket #${ticket.barcode}`,
                reference: ticket.id,
                ticketId: ticket.id,
                cogsReversal: totalCogsReversal.toNumber(),
                spoilageAmount: totalSpoilageAmount.toNumber(),
                branchId: currentUser.branchId ?? undefined
            }, tx);

            if (je && payment) {
                await tx.repairPayment.update({
                    where: { id: payment.id },
                    data: { journalEntryId: je.id }
                });
            }
        }

        return { success: true, refundedAmount: totalRefundAmount.toNumber() };
    }, { timeout: 90000 });

    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    return result;
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Handle full refund for maintenance tickets
 */
export const fullRefundTicket = secureAction(async (data: {
    ticketId: string;
    refundMethod: 'CASH' | 'STORE_CREDIT';
    isDamagedAll?: boolean;
    csrfToken?: string;
}) => {
    const { ticketId, refundMethod, isDamagedAll = false } = data;
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Unauthorized");

    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error('No active shift.');
    }
    const currentShift = shiftResult.shift;

    const result = await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.findFirst({
            where: { OR: [{ id: ticketId }, { barcode: ticketId }] },
            include: { parts: true, customer: true }
        });

        if (!ticket) throw new Error("Ticket not found");
        if (new Decimal(ticket.amountPaid).isZero()) throw new Error("التذكرة غير مدفوعة بالفعل.");

        const totalRefundAmount = new Decimal(ticket.amountPaid);
        let totalCogsReversal = new Decimal(0);
        let totalSpoilageAmount = new Decimal(0);

        // 1. Loop through ALL parts and return to stock
        for (const part of ticket.parts) {
            const qtyToRefund = new Decimal(part.quantity).minus(part.refundedQty || 0);
            if (qtyToRefund.lte(0)) continue;

            await tx.ticketPart.update({
                where: { id: part.id },
                data: {
                    refundedQty: { increment: qtyToRefund.toNumber() },
                    status: 'REFUNDED'
                }
            });

            if (part.productId) {
                await handleReturnedPartStock(tx, {
                    productId: part.productId,
                    warehouseId: part.warehouseId,
                    quantity: qtyToRefund.toNumber(),
                    isDamaged: isDamagedAll,
                    reason: `Full Refund: Ticket #${ticket.barcode}`,
                    performedById: currentUser.id
                });
                
                const itemCost = new Decimal(part.cost).times(qtyToRefund);
                if (isDamagedAll) {
                    totalSpoilageAmount = totalSpoilageAmount.plus(itemCost);
                } else {
                    totalCogsReversal = totalCogsReversal.plus(itemCost);
                }
            }
        }

        // 2. Create Refund Record
        const payment = await tx.repairPayment.create({
            data: {
                ticketId: ticket.id,
                type: 'REFUND',
                amount: totalRefundAmount,
                method: refundMethod === 'STORE_CREDIT' ? 'ACCOUNT' : 'CASH',
                reference: `Full Refund: Total Reversal`,
                recordedBy: currentUser.name || "System"
            }
        });

        // 3. Reset Financials & Zero Commission
        await tx.ticket.update({
            where: { id: ticket.id },
            data: {
                repairPrice: 0,
                partsCost: 0,
                netProfit: 0,
                commissionAmount: 0,
                amountPaid: 0,
                paymentStatus: 'unpaid',
                status: 'CANCELLED', // Final state after full refund
                lastReturnedAt: new Date(),
                returnCount: { increment: 1 }
            }
        });

        // 4. Treasury & Shift (if Cash)
        if (refundMethod === 'CASH') {
            await tx.shift.update({
                where: { id: currentShift.id },
                data: {
                    totalRefunds: { increment: totalRefundAmount },
                    totalCashRefunds: { increment: totalRefundAmount }
                }
            });

            const treasury = await tx.treasury.findFirst({
                where: { branchId: currentUser.branchId!, isDefault: true }
            });

            if (treasury) {
                await tx.treasury.update({
                    where: { id: treasury.id },
                    data: { balance: { decrement: totalRefundAmount } }
                });

                await tx.transaction.create({
                    data: {
                        type: 'REFUND',
                        amount: totalRefundAmount.negated(),
                        paymentMethod: 'CASH',
                        description: `Full Refund Ticket #${ticket.barcode}`,
                        shiftId: currentShift.id,
                        treasuryId: treasury.id
                    }
                });
            }
        }

        // 5. Accounting Log
        const je = await AccountingEngine.recordRefund({
            amount: totalRefundAmount.toNumber(),
            method: refundMethod === 'STORE_CREDIT' ? 'ACCOUNT' : 'CASH',
            description: `Full Refund: Ticket #${ticket.barcode}`,
            reference: ticket.id,
            ticketId: ticket.id,
            cogsReversal: totalCogsReversal.toNumber(),
            spoilageAmount: totalSpoilageAmount.toNumber(),
            branchId: currentUser.branchId ?? undefined
        }, tx);

        if (je) {
            await tx.repairPayment.update({
                where: { id: payment.id },
                data: { journalEntryId: je.id }
            });
        }

        return { success: true };
    }, { timeout: 90000 });

    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    return result;
}, { permission: PERMISSIONS.TICKET_EDIT });

export const overrideProfitDistribution = secureAction(async (data: {
    ticketId: string;
    newTechCommissionAmount: number;
    csrfToken?: string;
}) => {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['ADMIN', 'مدير النظام', 'المالك'].includes(currentUser.role)) {
        return { success: false, error: "Unauthorized. Admin/Manager required." };
    }

    const { ticketId, newTechCommissionAmount } = data;

    const result = await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.findUnique({
            where: { id: ticketId }
        });

        if (!ticket) throw new Error("Ticket not found");
        if (ticket.status !== 'PAID_DELIVERED') {
            throw new Error("Cannot override distribution. Ticket is not PAID_DELIVERED.");
        }

        const laborPoolAmount = new Decimal(ticket.laborPoolAmount?.toString() || 0);
        const centerPartProfit = new Decimal(ticket.centerPartProfit?.toString() || 0);
        const newCommission = new Decimal(newTechCommissionAmount);
        
        // Calculate new center labor profit
        const newCenterLaborProfit = laborPoolAmount.minus(newCommission);
        const newNetProfit = newCenterLaborProfit.plus(centerPartProfit);

        // Accounting Logic
        const originalIdempotencyKey = `TICKET_DIST_${ticketId}`;
        const existingOriginal = await tx.journalEntry.findFirst({
            where: { idempotencyKey: originalIdempotencyKey }
        });

        if (existingOriginal) {
            // Check if already reversed
            const alreadyReversed = await tx.journalEntry.findFirst({
                where: { reference: existingOriginal.id, description: { startsWith: 'REVERSAL:' } }
            });
            if (!alreadyReversed) {
                await AccountingEngine.reverseJournalEntry(existingOriginal.id, `REV_${originalIdempotencyKey}_${Date.now()}`, tx);
            }
        }

        // 🐛 FIX: Must also reverse any prior overrides to prevent compounding balances
        const priorOverrides = await tx.journalEntry.findMany({
            where: { 
                reference: ticketId,
                idempotencyKey: { startsWith: `TICKET_DIST_OVERRIDE_${ticketId}_` }
            }
        });

        for (const override of priorOverrides) {
            const alreadyReversed = await tx.journalEntry.findFirst({
                where: { reference: override.id, description: { startsWith: 'REVERSAL:' } }
            });
            if (!alreadyReversed) {
                await AccountingEngine.reverseJournalEntry(override.id, `REV_${override.idempotencyKey}_${Date.now()}`, tx);
            }
        }

        // Only repost if the original entry was reversed successfully or we didn't find one but still need to post?
        // Let's always repost to fix the ledger with the new values.
        const finalCustomerPrice = new Decimal(ticket.finalCustomerPrice?.toString() || 0);
        const techBillingPrice = new Decimal(ticket.techBillingPrice?.toString() || 0);

        await AccountingEngine.recordTransaction({
            description: `Maintenance Distribution Override: Ticket #${ticket.barcode}`,
            reference: ticket.id,
            branchId: ticket.currentBranchId ?? undefined,
            idempotencyKey: `TICKET_DIST_OVERRIDE_${ticket.id}_${Date.now()}`,
            lines: [
                { accountCode: GL.REVENUE.SERVICE, debit: finalCustomerPrice, credit: 0, description: "Service Revenue Reclassification" },
                { accountCode: GL.REVENUE.SALES, debit: 0, credit: techBillingPrice, description: "Parts Revenue Dist" },
                { accountCode: GL.LIABILITIES.ACCRUED_SALARIES, debit: 0, credit: newCommission, description: "Technician Commission Accrued (Override)" },
                { accountCode: GL.REVENUE.SALES, debit: 0, credit: newCenterLaborProfit, description: "Center Labor Profit realized (Override)" }
            ]
        }, tx);

        // Update Ticket
        const updatedTicket = await tx.ticket.update({
            where: { id: ticket.id },
            data: {
                techCommissionAmount: newCommission,
                centerLaborProfit: newCenterLaborProfit,
                commissionAmount: newCommission, // Legacy field
                netProfit: newNetProfit
            }
        });

        return updatedTicket;
    }, { timeout: 90000 });

    revalidatePath(`/maintenance/tickets/${ticketId}`);
    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    return { success: true, data: result };
}, { permission: PERMISSIONS.TICKET_EDIT });
