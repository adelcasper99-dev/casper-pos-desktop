// @ts-nocheck
"use server";

import { prisma } from "@/lib/prisma";
import { AutoJournalService } from "@/lib/accounting/auto-journal-service";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "./auth";
import { getCurrentShiftInternal, updateShiftHeartbeat } from "./shift-management-actions";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { ticketSchema } from "@/lib/validation/tickets";
import { logger } from "@/lib/logger";
import { calculateNetProfit, calculateCommission } from "@/lib/commission-validation";
import { getBranchFilter } from "@/lib/data-filters";
import { TicketStatus } from "@/lib/constants";
import { handleReturnedPartStock } from "@/lib/stock-helpers";

// Helper to get next sequential ticket number (T-001, T-002...) with collision protection
async function getNextTicketNumber() {
    let attempts = 0;
    while (attempts < 5) {
        const lastTickets = await prisma.ticket.findMany({
            where: { barcode: { startsWith: 'T-' } },
            orderBy: { createdAt: 'desc' },
            take: 20, // Increased sample size
            select: { barcode: true }
        });

        let maxSeq = 0;
        for (const ticket of lastTickets) {
            const match = ticket.barcode.match(/^T-(\d+)$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num) && num > maxSeq) maxSeq = num;
            }
        }

        const nextNum = maxSeq + 1;
        const candidate = `T-${nextNum.toString().padStart(3, '0')}`;

        // Double check existence (safety first)
        const exists = await prisma.ticket.findUnique({ where: { barcode: candidate } });
        if (!exists) return candidate;

        attempts++;
        // If exists, loop will naturally increment maxSeq based on the newly found ticket in next iteration
        // or just wait a bit (jitter) for race conditions
        await new Promise(r => setTimeout(r, Math.random() * 50));
    }

    // Fallback to timestamp-based if we fail 5 times (highly unlikely)
    return `T-F${Date.now().toString().slice(-6)}`;
}

/**
 * Helper to check if a ticket is locked (Delivered, Picked Up, etc.)
 * Returns true if the ticket is LOCKED.
 * Admins can always bypass the lock.
 */
function checkTicketLock(ticket: { status: string }, user: { role: string }) {
    if (!ticket || !user) return false;
    const isAdmin = ['ADMIN', 'مدير النظام', 'المالك'].includes(user.role);
    if (isAdmin) return false;

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

    // Calculate stats for the summary header
    const deliveredCount = tickets.filter(t => ['DELIVERED', 'PAID_DELIVERED', 'PICKED_UP'].includes(t.status)).length;
    const returnCount = tickets.filter(t => (t as any).returnCount > 0 || t.status === 'RETURNED_FOR_REFIX').length;
    const ratio = (deliveredCount + returnCount) > 0 ? (deliveredCount / (deliveredCount + returnCount)) * 100 : 0;

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

        // Calculate Risk Level (Simplified server-side version)
        let riskLevel = 'low';
        let isOverdue = false;
        if (t.expectedDuration && !['COMPLETED', 'READY_AT_BRANCH', 'DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'REJECTED'].includes(t.status)) {
            const created = new Date(t.createdAt).getTime();
            const dueTime = created + (t.expectedDuration * 60000);
            isOverdue = now > dueTime;
        }

        const gapMinutes = Math.floor(diffMs / 60000);

        if (isOverdue || (t as any).returnCount > 1) {
            riskLevel = 'high';
        } else if (gapMinutes > 3 * 24 * 60) { // 3 days
            riskLevel = 'medium';
        }

        return {
            ...t,
            initialQuote: Number(t.initialQuote),
            repairPrice: Number(t.repairPrice),
            amountPaid: Number(t.amountPaid),
            deposit: Number(t.deposit),
            gap, // Rename to gap for UI consistency
            riskLevel,
            isOverdue
        };
    });

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
            totalPaid: Number(totalSummary._sum.amountPaid || 0)
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
            logs: { orderBy: { sentAt: 'desc' } },
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

    return {
        ticket: {
            ...ticket,
            initialQuote: Number(ticket.initialQuote),
            repairPrice: Number(ticket.repairPrice),
            partsCost: Number(ticket.partsCost),
            deposit: Number(ticket.deposit),
            commissionAmount: Number(ticket.commissionAmount),
            netProfit: Number(ticket.netProfit),
            amountPaid: Number(ticket.amountPaid),
            parts: ticket.parts.map(p => ({
                ...p,
                cost: Number(p.cost),
                price: Number(p.price),
            })),
            payments: ticket.payments.map(p => ({
                ...p,
                amount: Number(p.amount),
            })),
            parentTicket: ticket.parentTicket ? {
                ...ticket.parentTicket,
                amountPaid: Number(ticket.parentTicket.amountPaid),
                repairPrice: Number(ticket.parentTicket.repairPrice)
            } : null
        }
    };
}, { permission: PERMISSIONS.TICKET_VIEW, requireCSRF: false });

/**
 * Create a new repair ticket
 */
export const createTicket = secureAction(async (rawData: z.infer<typeof ticketSchema> & { csrfToken?: string }) => {
    const data = ticketSchema.parse(rawData);
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Unauthorized");

    // SHIFT GUARD: Ensure active shift exists
    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error("No active shift. Please open a shift first.");
    }
    const currentShift = shiftResult.shift;

    if (!currentUser.branchId) {
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

    if (data.customerPhone && data.customerPhone.trim().length > 0) {
        const normalizedPhone = data.customerPhone.trim();

        // 🔍 GLOBAL LOOKUP: Is this phone used by a Staff member or Supplier?
        const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
        const phoneCheck = await checkGlobalPhoneUniqueness(normalizedPhone);

        if (!phoneCheck.unique) {
            if (phoneCheck.usedBy === 'USER') clientUserId = phoneCheck.entityId;
            else if (phoneCheck.usedBy === 'SUPPLIER') clientSupplierId = phoneCheck.entityId;
            else if (phoneCheck.usedBy === 'CUSTOMER') customerId = phoneCheck.entityId;
        } else if (!customerId) {
            // Create new customer if unique and not provided
            try {
                const customer = await prisma.customer.create({
                    data: { name: data.customerName, phone: normalizedPhone, balance: 0 }
                });
                customerId = customer.id;
            } catch (e: any) {
                if (e.code === 'P2002') {
                    const existing = await prisma.customer.findUnique({ where: { phone: normalizedPhone } });
                    if (existing) customerId = existing.id;
                }
            }
        }
    }

    const result = await prisma.$transaction(async (tx) => {
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
                currentBranchId: currentUser.branchId!,
                initialQuote: new Decimal(data.repairPrice || 0),
                repairPrice: new Decimal(data.repairPrice || 0),
                shiftId: currentShift.id,
                expectedDuration: data.expectedDuration || null,
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
        select: { id: true, customerName: true, customerPhone: true }
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

    // 🛡️ STRICT WARRANTY GUARD: Block reassignment for warranty returns unless ADMIN
    if (existing.isWarrantyReturn) {
        const isAdmin = ['ADMIN', 'مدير النظام', 'المالك'].includes(user.role);
        if (!isAdmin) {
            throw new Error("لا يمكن إعادة تعيين الفني لتذكرة ضمان إلا من قبل مدير النظام.");
        }
    }

    const newTech = await prisma.user.findUnique({ where: { id: technicianId } });
    const oldTechName = existing.technician?.name || existing.technician?.username || "غير مسند";
    const newTechName = newTech?.name || newTech?.username || "غير مسند";

    const ticket = await prisma.ticket.update({
        where: { id: ticketId },
        data: {
            technicianId,
            status: "IN_PROGRESS",
            startedAt: new Date()
        }
    });

    await prisma.ticketNote.create({
        data: {
            ticketId,
            text: existing.isWarrantyReturn 
                ? `⚠️ إعادة تعيين استثنائية لتذكرة ضمان: تم النقل من [${oldTechName}] إلى [${newTechName}]`
                : `Technician assigned: ${newTechName}`,
            author: user.name || user.username || "System",
            isInternal: true
        }
    });

    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    return { success: true, ticket };
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
    csrfToken?: string;
}) => {
    const data: Prisma.TicketUpdateInput = {};
    if (updates.repairPrice !== undefined) data.repairPrice = new Decimal(updates.repairPrice);
    if (updates.issueDescription !== undefined) data.issueDescription = updates.issueDescription;
    if (updates.securityCode !== undefined) data.securityCode = updates.securityCode;
    if (updates.technicianId !== undefined) data.technicianId = updates.technicianId || null;
    if (updates.expectedDuration !== undefined) data.expectedDuration = updates.expectedDuration;

    const existing = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (existing && checkTicketLock(existing, await getCurrentUser())) {
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
            updateData.completedById = technicianId || existingTicket.technicianId;
            if (repairPrice !== undefined) updateData.repairPrice = new Decimal(repairPrice);
            if (partsCost !== undefined) updateData.partsCost = new Decimal(partsCost);

            // Auto-set 30-day warranty on completion if not explicitly set
            if (!existingTicket.warrantyExpiryDate) {
                const expiry = new Date();
                expiry.setDate(expiry.getDate() + 30);
                updateData.warrantyExpiryDate = expiry;
            }
        }

        if (status === 'DELIVERED') {
            updateData.deliveredAt = new Date();

            // Auto-set 30-day warranty on delivery if not explicitly set
            if (!existingTicket.warrantyExpiryDate) {
                const expiry = new Date();
                expiry.setDate(expiry.getDate() + 30);
                updateData.warrantyExpiryDate = expiry;
            }
        }

        const ticket = await tx.ticket.update({
            where: { id: ticketId },
            data: updateData
        });

        // B19 Fix: Record Maintenance COGS (Parts Cost) in GL when COMPLETED
        if (status === 'COMPLETED' && existingTicket.status !== 'COMPLETED') {
            const finalPartsCost = partsCost ?? Number(existingTicket.partsCost) ?? 0;
            if (finalPartsCost > 0) {
                await AccountingEngine.recordMaintenanceCOGS({
                    ticketId: ticket.id,
                    barcode: ticket.barcode,
                    partsCost: finalPartsCost,
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

    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    revalidatePath("/ar/maintenance/tickets");
    revalidateTag("dashboard");

    return { success: true, ticket: result };
}, { permission: PERMISSIONS.TICKET_WORKFLOW });

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
        const allowedStatuses = ['DELIVERED', 'PAID_DELIVERED'];
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

        await AccountingEngine.recordRefund({
            amount,
            method: refundMethod,
            description: `Refund: Ticket #${ticket.barcode}`,
            reference: ticketId,
            ticketId: ticketId,
            branchId: user.branchId ?? undefined
        }, tx);

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
    let currentShift = null;
    if (amountToRefund > 0) {
        const shiftResult = await getCurrentShiftInternal({ userId: user.id });
        if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
            throw new Error("يجب فتح وردية أولاً للتراجع عن المبالغ المدفوعة في التذكرة.");
        }
        currentShift = shiftResult.shift;
    }

    const result = await prisma.$transaction(async (tx) => {
        // --- Part 1: Stock Reversal ---
        let totalPartsCostReversal = 0;
        for (const part of ticket.parts) {
            if (part.productId) {
                totalPartsCostReversal += (Number(part.cost) || 0) * part.quantity;
                await handleReturnedPartStock(tx, {
                    productId: part.productId,
                    warehouseId: ticket.technician?.warehouseId || part.warehouseId || null,
                    quantity: part.quantity,
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
            await tx.repairPayment.create({
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
                    data: { balance: { increment: amountToRefund } }
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
            await AccountingEngine.recordRefund({
                amount: amountToRefund,
                method: refundMethod,
                description: `Delete Ticket: #${ticket.barcode}`,
                reference: ticket.id,
                ticketId: ticket.id,
                cogsReversal: totalPartsCostReversal,
                branchId: user.branchId ?? undefined
            }, tx);
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
        await FinancialReversalService.reverseAccountingEntries(tx, ticketId, `مسح التذكرة: ${reason}`);

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
            await AutoJournalService.reverseJournalEntry(tx, {
                originalEntryId: lastEntry.id,
                reason: `Ticket Voided (${reason})`,
                branchId: ticket.currentBranchId || undefined
            });
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
    clawbackOption?: string;
    csrfToken?: string;
}) => {
    const { ticketId, returnReason, clawbackOption = 'NONE' } = data;
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId },
        include: { technician: true, completedBy: true }
    });

    if (!ticket) throw new Error("Ticket not found");
    const allowedStatuses = ['DELIVERED', 'PAID_DELIVERED'];
    if (!allowedStatuses.includes(ticket.status)) {
        throw new Error("Cannot return this ticket in its current status.");
    }

    // Calculate warranty and clawback details
    const originalTechId = ticket.completedById || ticket.technicianId;
    const originalCommission = Number(ticket.commissionAmount) || 0;

    let clawbackAmount = 0;
    if (clawbackOption === 'FULL' && originalCommission > 0) {
        clawbackAmount = originalCommission;
    } else if (clawbackOption === 'PARTIAL' && originalCommission > 0) {
        clawbackAmount = originalCommission * 0.5; // Default 50%
    }

    const result = await prisma.$transaction(async (tx) => {
        const updatedTicket = await tx.ticket.update({
            where: { id: ticketId },
            data: {
                status: 'RETURNED_FOR_REFIX',
                returnCount: { increment: 1 },
                lastReturnedAt: new Date(),
                returnReason,
                originalTechId: originalTechId,
                commissionClawback: { increment: clawbackAmount }
            }
        });

        const lastEntry = await tx.journalEntry.findFirst({
            where: { reference: ticketId },
            orderBy: { createdAt: 'desc' }
        });

        if (lastEntry) {
            await AutoJournalService.reverseJournalEntry(tx, {
                originalEntryId: lastEntry.id,
                reason: `Warranty Rework (${returnReason})`,
                branchId: ticket.currentBranchId || undefined
            });
        }

        // 💰 [NEW] Record Actual Employee Transaction for the Clawback (Debit)
        if (clawbackAmount > 0 && originalTechId) {
            await tx.employeeTransaction.create({
                data: {
                    userId: originalTechId,
                    type: 'MAINTENANCE_COMMISSION',
                    amount: -clawbackAmount, // Negative amount for debit
                    description: `Clawback: Warranty Rework for Ticket #${ticket.barcode}`,
                    referenceId: ticketId,
                    referenceType: 'TICKET_REWORK',
                    branchId: ticket.currentBranchId || undefined
                }
            });
        }

        if (clawbackAmount > 0 && originalTechId) {
            await tx.auditLog.create({
                data: {
                    entityType: 'COMMISSION_CLAWBACK',
                    entityId: ticketId,
                    action: clawbackOption === 'FULL' ? 'FULL_CLAWBACK' : 'PARTIAL_CLAWBACK',
                    previousData: JSON.stringify({
                        technicianId: originalTechId,
                        originalCommission,
                        clawbackAmount,
                        returnReason
                    }),
                    reason: `Commission clawback of ${clawbackAmount.toFixed(2)} for warranty return`,
                    user: user?.name || 'System'
                }
            });
        }

        await tx.ticketNote.create({
            data: {
                ticketId,
                text: `🔄 Returned for re-repair. Reason: ${returnReason}. ${clawbackAmount > 0 ? `Commission clawback: $${clawbackAmount.toFixed(2)}` : ''}`,
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
            balance: Number(c.balance),
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
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    const result = await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new Error("Customer not found");

        const balance = Number(customer.balance);
        if (balance >= 0) throw new Error("Customer has no credit balance.");
        if (amount > Math.abs(balance)) throw new Error("Amount exceeds available credit.");

        const ticket = await tx.ticket.findFirst({
            where: { OR: [{ id: ticketId }, { barcode: ticketId }] }
        });
        if (!ticket) throw new Error("Ticket not found");

        if (checkTicketLock(ticket, user)) {
            throw new Error("هذه التذكرة مغلقة ولا يمكن إضافة أي شيء إليها. (إلا في حالة المرتجع)");
        }

        const repairPrice = Number(ticket.repairPrice);
        const amountPaid = Number(ticket.amountPaid);
        if (amount > (repairPrice - amountPaid)) throw new Error("Amount exceeds balance due.");

        // 1. Create Payment
        await tx.repairPayment.create({
            data: {
                ticketId: ticket.id,
                amount: new Decimal(amount),
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
                amount: new Decimal(amount),
                description: `Ticket #${ticket.barcode} - Credit Applied`,
                reference: ticket.id,
                createdBy: user.id
            }
        });

        // 3. Update customer balance
        await tx.customer.update({
            where: { id: customerId },
            data: { balance: { increment: amount } }
        });

        // 4. Update ticket balance
        const newPaid = amountPaid + amount;
        const newStatus = newPaid >= repairPrice ? 'paid' : 'partial';

        return await tx.ticket.update({
            where: { id: ticket.id },
            data: {
                amountPaid: new Decimal(newPaid),
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

    let baseCostPrice = 0;
    let transferPrice = 0;
    let price = data.price || 0;
    let productName = data.name || "Unknown Item";

    const tech = ticket.technicianId 
        ? await prisma.technician.findUnique({ where: { id: ticket.technicianId } }) 
        : null;
    const tier = tech?.defaultPriceTier || 'COST';

    if (data.productId) {
        const product = await prisma.product.findUnique({ where: { id: data.productId } });
        if (!product) throw new Error("Product not found");

        baseCostPrice = Number(product.costPrice);
        
        // Determine transfer price based on technician tier
        if (tier === 'SELL_1') transferPrice = Number(product.sellPrice);
        else if (tier === 'SELL_2') transferPrice = Number(product.sellPrice2);
        else if (tier === 'SELL_3') transferPrice = Number(product.sellPrice3);
        else transferPrice = Number(product.costPrice); // Default to COST

        if (!price) price = Number(product.sellPrice);
        productName = product.name;

        let sourceWarehouseId = data.warehouseId;
        if (!sourceWarehouseId) {
            // Priority 1: Technician's assigned warehouse (Custody)
            if (ticket.technician?.warehouseId) {
                sourceWarehouseId = ticket.technician.warehouseId;
            } 
                // Priority 2: isMaintenanceDefault (Dedicated Maintenance Warehouse)
                else {
                    const maintenanceWh = await prisma.warehouse.findFirst({
                        where: {
                            isMaintenanceDefault: true,
                            deletedAt: null
                        }
                    });
                    if (maintenanceWh) {
                        sourceWarehouseId = maintenanceWh.id;
                    } 
                    // STRICT SEPARATION: No fallback to isDefault (POS) here.
                    // If no maintenance warehouse is found, operations will fail 
                    // later with stock-related errors rather than pulling from POS.
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

            if (!finalStock || finalStock.quantity < data.quantity) {
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
                        if (mainStock && mainStock.quantity >= data.quantity) {
                            finalStock = mainStock;
                            finalWarehouseId = mainWh.id;
                        }
                    }
                 }
            }

            const availableStock = finalStock?.quantity ?? 0;
            if (availableStock < data.quantity) {
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
                        cost: new Decimal(transferPrice), // Legacy field uses transferPrice
                        baseCostPrice: new Decimal(baseCostPrice),
                        transferPrice: new Decimal(transferPrice),
                        price: new Decimal(price),
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
                cost: new Decimal(transferPrice),
                baseCostPrice: new Decimal(baseCostPrice),
                transferPrice: new Decimal(transferPrice),
                price: new Decimal(price),
                status: 'ACTIVE'
            }
        });
    }

    const allParts = await prisma.ticketPart.findMany({ 
        where: { ticketId: ticket.id, status: 'ACTIVE' } 
    });
    const totalPartsCost = allParts.reduce((sum, p) => sum + (Number(p.cost) * p.quantity), 0);
    const totalSellPrice = allParts.reduce((sum, p) => sum + (Number(p.price) * p.quantity), 0);

    const isWarrantyFix = ticket.status === 'RETURNED_FOR_REFIX';
    const updateData: Prisma.TicketUpdateInput = {
        partsCost: new Decimal(totalPartsCost),
    };

    if (!isWarrantyFix) {
        updateData.repairPrice = new Decimal(totalSellPrice);
    }

    const finalPrice = isWarrantyFix ? Number(ticket.repairPrice || 0) : totalSellPrice;
    const netProfit = calculateNetProfit(new Decimal(finalPrice), new Decimal(totalPartsCost));
    updateData.netProfit = new Decimal(netProfit);

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
                quantity,
                isDamaged: true,
                reason: `Refunded/Defective in Ticket #${part.ticket.barcode}`,
                performedById: user?.id || 'system',
                branchId: part.ticket.currentBranchId
            });

            // --- T-029: Automated Salary Deduction for Damaged Parts (With Percentage) ---
            if (part.ticket?.technicianId) {
                const partCost = new Decimal(part.baseCostPrice?.toString() || part.cost?.toString() || 0).mul(quantity);
                const lossRate = Number(part.ticket.technician.lossRate || 100);
                const techDeduction = partCost.mul(lossRate / 100);
                const centerLoss = partCost.sub(techDeduction);
                
                // 1. Tech Share
                if (techDeduction.gt(0)) {
                    await (tx as any).employeeTransaction.create({
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
                    await AutoJournalService.recordWastageLoss(tx, {
                        amount: partCost,
                        description: `إثبات هالك كلي للقطعة (تحمل المهندس ${lossRate}%) - تذكرة #${part.ticket.barcode} - (${part.name || 'بدون اسم'})`,
                        branchId: part.ticket.currentBranchId,
                        reference: part.ticket.id
                    });
                }
            }
        }

        const activeParts = await tx.ticketPart.findMany({ where: { ticketId, status: 'ACTIVE' } });
        const totalCost = activeParts.reduce((sum, p) => sum + (Number(p.cost) * p.quantity), 0);
        const totalSell = activeParts.reduce((sum, p) => sum + (Number(p.price) * p.quantity), 0);
        
        // Tiered Pricing Summary
        const techBillingPrice = activeParts.reduce((sum, p) => sum.add(new Decimal(p.transferPrice?.toString() || p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));
        const partCostPrice = activeParts.reduce((sum, p) => sum.add(new Decimal(p.baseCostPrice?.toString() || p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));

        const isFix = part.ticket?.status === 'RETURNED_FOR_REFIX';
        const netPro = calculateNetProfit(new Decimal(isFix ? Number(part.ticket?.repairPrice || 0) : totalSell), new Decimal(totalCost));

        await tx.ticket.update({
            where: { id: ticketId },
            data: {
                partsCost: new Decimal(totalCost),
                repairPrice: isFix ? undefined : new Decimal(totalSell),
                netProfit: new Decimal(netPro),
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
        const canEditClosed = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'مدير النظام' || user?.role === 'المالك';
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
            let targetWhId = warehouseId || part.warehouseId;
            
            // If still no warehouseId, fallback to technician's warehouse
            if (!targetWhId && part.ticket?.technicianId) {
                targetWhId = part.ticket.technician?.warehouseId;
            }

            await handleReturnedPartStock(tx, {
                productId,
                warehouseId: targetWhId || null,
                quantity,
                isDamaged: !!isDamaged,
                reason: `${isDamaged ? 'Replaced/Damaged' : 'Returned'} from Ticket #${part.ticket?.barcode || part.ticketId} (Part Removed)`,
                performedById: user?.id || 'system',
                branchId: part.ticket?.currentBranchId || undefined
            });

            // --- T-029: Automated Salary Deduction for Damaged Parts (With Percentage Override) ---
            if (isDamaged && part.ticket?.technicianId) {
                const partCost = new Decimal(part.baseCostPrice?.toString() || part.cost?.toString() || 0).mul(quantity);
                const effectiveLossRate = lossRateOverride ?? Number(part.ticket.technician.lossRate || 100);
                const techDeduction = partCost.mul(effectiveLossRate / 100);
                const centerLoss = partCost.sub(techDeduction);
                
                // 1. Tech Share
                if (techDeduction.gt(0)) {
                    await (tx as any).employeeTransaction.create({
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
                    await AutoJournalService.recordWastageLoss(tx, {
                        amount: partCost,
                        description: `إثبات هالك كلي للقطعة (تحمل المهندس ${effectiveLossRate}%) - تذكرة #${part.ticket.barcode} - (${part.name || 'بدون اسم'})`,
                        branchId: part.ticket.currentBranchId,
                        reference: part.ticket.id
                    });
                }
            }
        }

        const activeParts = await tx.ticketPart.findMany({ 
            where: { ticketId, status: 'ACTIVE' } 
        });
        const totalPartsCost = activeParts.reduce((sum, p) => sum + (Number(p.cost) * p.quantity), 0);
        const totalSellPrice = activeParts.reduce((sum, p) => sum + (Number(p.price) * p.quantity), 0);
        
        // Tiered Pricing Summary
        const techBillingPrice = activeParts.reduce((sum, p) => sum.add(new Decimal(p.transferPrice?.toString() || p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));
        const partCostPrice = activeParts.reduce((sum, p) => sum.add(new Decimal(p.baseCostPrice?.toString() || p.cost?.toString() || 0).mul(p.quantity)), new Decimal(0));

        const isWarrantyFix = part.ticket?.status === 'RETURNED_FOR_REFIX';
        const updateFields: Prisma.TicketUpdateInput = {
            partsCost: new Decimal(totalPartsCost),
            techBillingPrice,
            partCostPrice,
        };

        if (!isWarrantyFix) {
            updateFields.repairPrice = new Decimal(totalSellPrice);
        }

        const finalPrice = isWarrantyFix ? Number(part.ticket?.repairPrice || 0) : totalSellPrice;
        const netProfit = calculateNetProfit(new Decimal(finalPrice), new Decimal(totalPartsCost));
        updateFields.netProfit = new Decimal(netProfit);

        if (part.ticket?.technicianId) {
            const commission = calculateCommission(netProfit, Number(part.ticket.commissionRate || 0));
            updateFields.commissionAmount = new Decimal(commission);
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
export const getProductsForSelector = secureAction(async (warehouseId?: string) => {
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

    const products = await prisma.product.findMany({
        orderBy: { name: 'asc' },
        include: {
            stocks: true
        }
    });

    const data = products.map(p => {
        let stockValue = p.stock;
        if (targetWarehouseId) {
            const st = p.stocks.find(s => s.warehouseId === targetWarehouseId);
            stockValue = st ? st.quantity : 0;
        }

        const trackStock = (p as any).trackStock !== false;

        return {
            id: p.id,
            name: p.name,
            sku: p.sku,
            stock: Number(stockValue),
            costPrice: Number(p.costPrice),
            sellPrice: Number(p.sellPrice),
            sellPrice2: Number(p.sellPrice2),
            sellPrice3: Number(p.sellPrice3),
            trackStock
        };
    }).filter(p => !p.trackStock || p.stock > 0);

    return { success: true, data };
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

    const ticket = await prisma.ticket.findFirst({
        where: { OR: [{ id: ticketId }, { barcode: ticketId }] },
        include: { 
            customer: true,
            parentTicket: true
        }
    });

    if (!ticket) throw new Error('Ticket not found');

    // Relaxed validation: Allow 0 for warranty returns or reworks (even swap)
    const isActuallyRefund = paymentType === 'REFUND' || amount < 0;
    const isWarrantyEvenSwap = (ticket.isWarrantyReturn || ticket.status === 'RETURNED_FOR_REFIX') && amount === 0;

    if (!isActuallyRefund && !isWarrantyEvenSwap && amount <= 0) {
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

    const inheritedCredit = (ticket.isWarrantyReturn && ticket.parentTicket) ? Number(ticket.parentTicket.amountPaid) : 0;
    const previousPaid = Number(ticket.amountPaid) || 0;
    const repairPrice = Number(ticket.repairPrice) || 0;

    let effectiveAmount = amount;
    
    // Absorption Logic: If this is a warranty return and we haven't absorbed the credit yet (amountPaid === 0),
    // include the inheritedCredit in the new total paid calculation.
    let newTotalPaid = previousPaid + effectiveAmount;
    if (ticket.isWarrantyReturn && previousPaid === 0) {
        newTotalPaid += inheritedCredit;
    }

    let paymentStatus = 'partial';
    if (newTotalPaid >= repairPrice && repairPrice > 0) {
        paymentStatus = 'paid';
    } else if (newTotalPaid === 0) {
        paymentStatus = 'unpaid';
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
        let actualCustomerId = ticket.customerId;
        let isSalaryDeduction = false;

        if (paymentMethod === 'ACCOUNT') {
            let employeeId = null;

            if ((ticket.customer as any)?.linkedEmployeeId) {
                employeeId = (ticket.customer as any).linkedEmployeeId;
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

                await (tx as any).employeeTransaction.create({
                    data: {
                        userId: employeeId,
                        amount: new Prisma.Decimal(Math.abs(effectiveAmount)),
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
                    // Collecting money (effectiveAmount > 0) DECREASES balance.
                    // Refunding money (effectiveAmount < 0) INCREASES balance.
                    data: { balance: { decrement: new Prisma.Decimal(effectiveAmount) } }
                });

                if (!ticket.customerId) {
                    await tx.ticket.update({
                        where: { id: ticketId },
                        data: { customerId: customer.id }
                    });
                }
            }
        }

        if (effectiveAmount !== 0) {
            await tx.repairPayment.create({
                data: {
                    ticketId: ticket.id,
                    type: effectiveAmount < 0 ? 'REFUND' : paymentType,
                    amount: new Prisma.Decimal(effectiveAmount),
                    method: paymentMethod,
                    reference: reference || null,
                    recordedBy: currentUser.name || currentUser.username || 'System'
                }
            });
        }

        const effectiveCustomerId = actualCustomerId || (paymentMethod === 'ACCOUNT' ? customerId : null);
        if (effectiveCustomerId && effectiveAmount !== 0 && !isSalaryDeduction) {
            const isDeferred = paymentMethod === 'ACCOUNT';
            let description = `Ticket #${ticket.barcode}`;
            if (paymentType === 'DEPOSIT') description += ' - Deposit';
            else if (isActuallyRefund) description += ' - Refund';
            else if (isDeferred) description += ' - Deferred';
            else description += ` - ${paymentMethod} Payment`;

            await tx.customerTransaction.create({
                data: {
                    customerId: effectiveCustomerId,
                    // 💰 [STANDARD] CREDIT increases wallet/balance. DEBIT increases debt.
                    type: isDeferred ? 'DEBIT' : (isActuallyRefund ? 'CREDIT' : 'CREDIT'), 
                    // Wait, if it's a regular payment (isActuallyRefund: false), it should be CREDIT (reduces balance).
                    // If it's a refund (isActuallyRefund: true), it should also be CREDIT (increases wallet/reduces debt).
                    // Actually, the current logic is complex. Let's simplify:
                    // Payment Received -> CREDIT (Decreases AR)
                    // Refund Issued -> CREDIT (Decreases AR / Increases Wallet)
                    // Deferred Purchase -> DEBIT (Increases AR)
                    type: isDeferred ? 'DEBIT' : 'CREDIT',
                    amount: new Prisma.Decimal(Math.abs(effectiveAmount)),
                    description,
                    reference: ticket.id,
                    createdBy: currentUser.id,
                    branchId: currentUser.branchId || undefined
                }
            });
        }

        // --- Profit Distribution Calculation & Snapshotted Fields ---
        // Triggered only when transitioning to PAID_DELIVERED
        let distributionData = {};
        if (paymentStatus === 'paid' && paymentType === 'PAYMENT') {
            const activeParts = await tx.ticketPart.findMany({
                where: { ticketId: ticket.id, status: 'ACTIVE' }
            });

            const techBillingPrice = activeParts.reduce((sum, p) => sum.add(p.transferPrice || p.cost || 0), new Prisma.Decimal(0));
            const partCostPrice = activeParts.reduce((sum, p) => sum.add(p.baseCostPrice || p.cost || 0), new Prisma.Decimal(0));
            const finalCustomerPrice = new Prisma.Decimal(newTotalPaid); // Assume total paid is final price
            const laborPoolAmount = finalCustomerPrice.minus(techBillingPrice);
            
            // Re-calculate commission based on the new labor pool
            const commissionRateDec = new Prisma.Decimal(ticket.commissionRate || 0);
            const techCommissionAmount = laborPoolAmount.mul(commissionRateDec.div(100));
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

            // --- New: Record Balanced Journal Entry ---
            await AutoJournalService.recordTicketDistribution(tx, {
                ticketId: ticket.id,
                barcode: ticket.barcode,
                amount: finalCustomerPrice,
                method: paymentMethod,
                techBillingPrice,
                techCommissionAmount,
                centerLaborProfit,
                branchId: currentUser?.branchId || null
            });
        }

        const updatedTicket = await tx.ticket.update({
            where: { id: ticket.id },
            data: {
                amountPaid: new Prisma.Decimal(newTotalPaid),
                paymentStatus,
                paymentMethod: paymentMethod,
                // Automatically close the ticket if fully paid
                ...(paymentStatus === 'paid' && paymentType === 'PAYMENT' ? { 
                    status: 'PAID_DELIVERED',
                    deliveredAt: new Date(),
                    warrantyExpiryDate: warranty?.warrantyExpiryDate ?? (function() {
                        const d = new Date();
                        d.setDate(d.getDate() + 30);
                        return d;
                    })(),
                    ...distributionData
                } : {})
            }
        });

        // --- Part 4: Engineer Commission Recording ---
        // Only trigger if status changes to PAID_DELIVERED in this transaction
        const wasPaidDelivered = ticket.status === 'PAID_DELIVERED';
        const isPaidDeliveredNow = updatedTicket.status === 'PAID_DELIVERED';

        if (isPaidDeliveredNow && !wasPaidDelivered && !isActuallyRefund) {
            // 1. Record Main Technician Commission (Note: Handled via recordTicketDistribution GL entries)
            /* 
            if (ticket.technicianId && Number(ticket.commissionAmount) > 0) {
                // ... (legacy logic)
            }
            */

            // 2. Record Collaborators Commissions
            const collaborators = await tx.ticketCollaborator.findMany({
                where: { ticketId: ticket.id },
                include: { technician: { select: { userId: true } } }
            });

            for (const collab of collaborators) {
                const repairPriceDec = new Prisma.Decimal(ticket.repairPrice || 0);
                const partsCostDec = new Prisma.Decimal(ticket.partsCost || 0);
                const netProfitDec = repairPriceDec.minus(partsCostDec);
                const collabRateDec = new Prisma.Decimal(collab.commissionRate || 0);
                const collabCommissionDec = netProfitDec.mul(collabRateDec.div(100));

                if (collabCommissionDec.gt(0)) {
                    await (tx as any).employeeTransaction.create({
                        data: {
                            userId: collab.technician.userId,
                            type: 'MAINTENANCE_COMMISSION',
                            amount: collabCommissionDec,
                            description: `عمولة تعاون (مساعد) تذكرة #${ticket.barcode}`,
                            referenceId: ticket.id,
                            referenceType: 'TICKET'
                        }
                    });
                }
            }
        }

        if (paymentMethod !== 'ACCOUNT' && effectiveAmount !== 0) {
            const shiftUpdate: any = {};
            const absAmount = new Prisma.Decimal(Math.abs(effectiveAmount));

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

            await tx.transaction.create({
                data: {
                    type: txType,
                    amount: new Prisma.Decimal(effectiveAmount),
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
                    data: { balance: { increment: new Prisma.Decimal(effectiveAmount) } }
                });
            }

            // Unified Accounting Integration (Fix B17 & B18)
            if (isActuallyRefund) {
                await AccountingEngine.recordRefund({
                    amount: Math.abs(effectiveAmount),
                    method: paymentMethod,
                    description: `Ticket #${ticket.barcode} Refund`,
                    reference: ticket.id,
                    ticketId: ticket.id,
                    branchId: currentUser.branchId ?? undefined
                }, tx);
            } else {
                await AccountingEngine.recordMaintenancePayment({
                    amount: effectiveAmount,
                    method: paymentMethod,
                    description: `Ticket #${ticket.barcode} ${paymentType}`,
                    reference: ticket.id,
                    ticketId: ticket.id,
                    branchId: currentUser.branchId ?? undefined
                }, tx);
            }
        } else if (paymentMethod === 'ACCOUNT' && effectiveAmount !== 0) {
            // B18 Fix: Record deferred revenue in GL
            await AccountingEngine.recordMaintenancePayment({
                amount: effectiveAmount,
                method: paymentMethod,
                description: `Ticket #${ticket.barcode} Account Deferred`,
                reference: ticket.id,
                ticketId: ticket.id,
                branchId: currentUser.branchId ?? undefined
            }, tx);
        }

        return updatedTicket;
    }, { timeout: 60000 });

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
        balance: Number(customer.balance),
        creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null
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
            commissionRate
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

    try {
        await prisma.ticketCollaborator.delete({
            where: {
                ticketId_technicianId: { ticketId, technicianId }
            }
        });
    } catch (error: any) {
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

    await prisma.ticketCollaborator.update({
        where: {
            ticketId_technicianId: { ticketId, technicianId }
        },
        data: { commissionRate }
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
    } catch (error: any) {
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
                { status: { in: ['RETURNED_FOR_REFIX', 'RETURNED', 'RETURNED_WARRANTY'] } }
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
                technicianName: t.technician?.name || null
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
            warrantyExpiryDate: { gt: new Date() },
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
    csrfToken?: string
}) => {
    const { ticketId, reason } = data;
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
    const allowedStatuses = ['DELIVERED', 'PAID_DELIVERED'];
    if (!allowedStatuses.includes(ticket.status)) {
        throw new Error("Cannot return this ticket in its current status.");
    }

    // 2. Auth/Guard check
    const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER' || currentUser.role === 'مدير النظام' || currentUser.role === 'المالك';
    if (!isAdmin) {
        throw new Error("Only an Admin or Manager can perform a full ticket return.");
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
        let totalPartsCostReversal = 0;
        for (const part of ticket.parts) {
            if (part.productId && part.quantity > 0) {
                totalPartsCostReversal += (Number(part.cost) || 0) * part.quantity;

                await handleReturnedPartStock(tx, {
                    productId: part.productId,
                    warehouseId: part.warehouseId,
                    quantity: part.quantity,
                    isDamaged: false, // Full return implies parts are good unless specified
                    reason: `Full Return of Ticket #${ticket.barcode}`,
                    performedById: currentUser.id
                });
            }
        }

        // --- Part 2: Financial Refund ---
        const amountToRefund = Number(ticket.amountPaid) || 0;
        if (amountToRefund > 0) {
            const lastPayment = ticket.payments.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
            const refundMethod = lastPayment?.method || ticket.paymentMethod || 'CASH';

            // 1. Create Refund record in RepairPayment
            await tx.repairPayment.create({
                data: {
                    ticketId: ticket.id,
                    type: 'REFUND',
                    amount: new Decimal(amountToRefund),
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
                        amount: new Decimal(amountToRefund),
                        description: `Ticket #${ticket.barcode} - Full Return Refund`,
                        reference: ticket.id,
                        createdBy: currentUser.id
                    }
                });

                if (isDeferred) {
                    await tx.customer.update({
                        where: { id: ticket.customerId },
                        data: { balance: { decrement: new Decimal(amountToRefund) } }
                    });
                }
            }

            // 2.5 Reverse the original distribution journal entry
            const lastEntry = await tx.journalEntry.findFirst({
                where: { reference: ticket.id },
                orderBy: { createdAt: 'desc' }
            });

            if (lastEntry) {
                await AutoJournalService.reverseJournalEntry(tx, {
                    originalEntryId: lastEntry.id,
                    reason: `Full Return Refund (${reason})`,
                    branchId: ticket.currentBranchId || undefined
                });
            }

            // 💰 [NEW] Record Actual Employee Transaction for the Commission Reversal (Clawback)
            if (Number(ticket.commissionAmount) > 0 && ticket.technicianId) {
                const tech = await tx.technician.findUnique({ where: { id: ticket.technicianId } });
                if (tech) {
                    await tx.employeeTransaction.create({
                        data: {
                            userId: tech.userId,
                            type: 'MAINTENANCE_COMMISSION',
                            amount: -Number(ticket.commissionAmount), // Debit the full commission
                            description: `Clawback: Full Return for Ticket #${ticket.barcode}`,
                            referenceId: ticket.id,
                            referenceType: 'TICKET_RETURN',
                            branchId: ticket.currentBranchId || undefined
                        }
                    });
                }
            }

            // 3. Update Shift Balances (Standardized to use totalRefunds)
            const absAmount = new Decimal(amountToRefund);
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
                    if (treasury && Number(treasury.balance) < amountToRefund) {
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
            await AccountingEngine.recordRefund({
                amount: amountToRefund,
                method: refundMethod,
                description: `Full Return: Ticket #${ticket.barcode}`,
                reference: ticket.id,
                ticketId: ticket.id,
                cogsReversal: totalPartsCostReversal,
                branchId: currentUser.branchId ?? undefined
            }, tx);
        }

        // --- Part 3: Ticket Status Update ---
        const originalCommission = Number(ticket.commissionAmount) || 0;
        
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
                commissionClawback: new Decimal(originalCommission), // Record clawback
                returnReason: reason,
                lastReturnedAt: new Date(),
                returnCount: { increment: 1 }
            }
        });

        // 3.5 Void Sequels (Re-fixes/Warranty Returns)
        // If this is a parent, void all its children. 
        // If this is a child, the user likely wants to void the whole chain or just this branch?
        // Usually, Full Return means the whole operation is cancelled.
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

        // --- Part 4: Commission Reversal ---
        if (ticket.status === 'PAID_DELIVERED' && originalCommission > 0) {
            // Reversal for Main Technician
            if (ticket.technicianId) {
                const tech = await tx.technician.findUnique({
                    where: { id: ticket.technicianId },
                    select: { userId: true }
                });

                if (tech) {
                    await (tx as any).employeeTransaction.create({
                        data: {
                            userId: tech.userId,
                            type: 'MAINTENANCE_COMMISSION_REVERSAL',
                            amount: new Decimal(originalCommission),
                            description: `عكس عمولة صيانة (حذف تذكرة) - تذكرة #${ticket.barcode}`,
                            referenceId: ticket.id,
                            referenceType: 'TICKET_VOID'
                        }
                    });
                }
            }

            // Reversal for Collaborators
            const collaborators = await tx.ticketCollaborator.findMany({
                where: { ticketId: ticket.id },
                include: { technician: { select: { userId: true } } }
            });

            for (const collab of collaborators) {
                const repairPriceNum = Number(ticket.repairPrice) || 0;
                const partsCostNum = Number(ticket.partsCost) || 0;
                const netProfit = repairPriceNum - partsCostNum;
                const collabCommission = (netProfit * Number(collab.commissionRate)) / 100;

                if (collabCommission > 0) {
                    await (tx as any).employeeTransaction.create({
                        data: {
                            userId: collab.technician.userId,
                            type: 'MAINTENANCE_COMMISSION_REVERSAL',
                            amount: new Decimal(collabCommission),
                            description: `عكس عمولة تعاون (حذف تذكرة) - تذكرة #${ticket.barcode}`,
                            referenceId: ticket.id,
                            referenceType: 'TICKET_VOID'
                        }
                    });
                }
            }
        }

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
    }, { timeout: 60000 });

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

    if (!user.branchId) throw new Error("User must be assigned to a branch.");

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
    const allowedStatuses = ['DELIVERED', 'PAID_DELIVERED'];
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
            select: { id: true, parentTicketId: true, barcode: true }
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
                currentBranchId: user.branchId!,
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

            const available = part.quantity - (part.refundedQty || 0);
            if (returnItem.quantity > available) {
                throw new Error(`Cannot refund more than available for ${part.name || 'part'}`);
            }

            // 1. Update TicketPart counter
            await tx.ticketPart.update({
                where: { id: part.id },
                data: {
                    refundedQty: { increment: returnItem.quantity },
                    status: available === returnItem.quantity ? 'REFUNDED' : part.status
                }
            });

            // 2. Handle Stock Reversal
            if (part.productId) {
                await handleReturnedPartStock(tx, {
                    productId: part.productId,
                    warehouseId: part.warehouseId,
                    quantity: returnItem.quantity,
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
        if (totalRefundAmount.gt(0)) {
            await tx.repairPayment.create({
                data: {
                    ticketId: ticket.id,
                    type: 'REFUND',
                    amount: totalRefundAmount,
                    method: refundMethod === 'STORE_CREDIT' ? 'ACCOUNT' : 'CASH',
                    reference: `Partial Refund of ${items.length} items`,
                    recordedBy: currentUser.name || "System"
                }
            });

            // 4. Update Ticket Totals
            await tx.ticket.update({
                where: { id: ticket.id },
                data: {
                    amountPaid: { decrement: totalRefundAmount },
                    paymentStatus: 'partial',
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
            await AccountingEngine.recordRefund({
                amount: totalRefundAmount.toNumber(),
                method: refundMethod === 'STORE_CREDIT' ? 'ACCOUNT' : 'CASH',
                description: `Partial Refund: Ticket #${ticket.barcode}`,
                reference: ticket.id,
                ticketId: ticket.id,
                cogsReversal: totalCogsReversal.toNumber(),
                spoilageAmount: totalSpoilageAmount.toNumber(),
                branchId: currentUser.branchId ?? undefined
            }, tx);
        }

        return { success: true, refundedAmount: totalRefundAmount.toNumber() };
    }, { timeout: 60000 });

    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    return result;
}, { permission: PERMISSIONS.TICKET_EDIT });
