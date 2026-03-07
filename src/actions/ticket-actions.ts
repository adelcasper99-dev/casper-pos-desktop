// @ts-nocheck
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentUser } from "./auth";
import { getCurrentShiftInternal, updateShiftHeartbeat } from "./shift-management-actions";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { ticketSchema } from "@/lib/validation/tickets";
import { logger } from "@/lib/logger";
import { calculateNetProfit, calculateCommission } from "@/lib/commission-validation";
import { getBranchFilter } from "@/lib/data-filters";

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

    if (filters?.status && filters.status !== 'ALL') {
        where.status = filters.status;
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
        const gapMinutes = Math.floor((now - lastUpdate) / 60000);

        // Calculate Risk Level (Simplified server-side version)
        let riskLevel = 'low';
        let isOverdue = false;
        if (t.expectedDuration && !['COMPLETED', 'READY_AT_BRANCH', 'DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'REJECTED'].includes(t.status)) {
            const created = new Date(t.createdAt).getTime();
            const dueTime = created + (t.expectedDuration * 60000);
            isOverdue = now > dueTime;
        }

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
            gapMinutes,
            riskLevel,
            isOverdue
        };
    });

    return {
        tickets: processedTickets,
        stats: {
            delivered: deliveredCount,
            returns: returnCount,
            ratio: ratio.toFixed(1)
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
            }))
        }
    };
}, { permission: PERMISSIONS.TICKET_VIEW });

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
    });

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
            text: `Technician assigned: ${technicianId}`,
            author: user.name || user.username || "System",
            isInternal: true
        }
    });

    revalidatePath(`/tickets/${ticketId}`);
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

    const result = await prisma.$transaction(async (tx) => {
        const updateData: Prisma.TicketUpdateInput = { status };

        if (status === 'COMPLETED') {
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
    });

    revalidatePath(`/ar/maintenance/tickets/${ticketId}`);
    revalidatePath("/ar/maintenance/tickets");
    revalidateTag("dashboard");

    return { success: true, ticket: result };
}, { permission: PERMISSIONS.TICKET_COMPLETE });

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
            where: { OR: [{ id: ticketId }, { barcode: ticketId }] }
        });
        if (!ticket) throw new Error("Ticket not found");

        // 1. Create refund record
        const payment = await tx.repairPayment.create({
            data: {
                ticketId,
                amount: new Decimal(amount),
                type: 'REFUND',
                method: 'CASH',
                reference: reason,
                recordedBy: user.name || user.username || "System"
            }
        });

        // 2. Update financials
        await tx.ticket.update({
            where: { id: ticketId },
            data: {
                amountPaid: { decrement: amount },
                paymentStatus: 'partial' // Simple logic, could be refined
            }
        });

        // 3. Update Shift
        await tx.shift.update({
            where: { id: currentShift.id },
            data: {
                totalRefunds: { increment: amount },
                lastHeartbeat: new Date()
            }
        });

        // 4. Update Treasury
        const treasury = await tx.treasury.findFirst({
            where: { branchId: user.branchId!, isDefault: true }
        });

        if (treasury) {
            await tx.transaction.create({
                data: {
                    type: 'REFUND',
                    amount: new Decimal(amount).negated(),
                    paymentMethod: 'CASH',
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

        // 5. Accounting
        await AccountingEngine.recordTransaction({
            description: `Refund: Ticket #${ticket.barcode}`,
            reference: ticketId,
            lines: [
                { accountCode: '4000', debit: amount, credit: 0, description: 'Service Revenue Reversed' },
                { accountCode: '1000', debit: 0, credit: amount, description: 'Cash Refunded' }
            ]
        }, tx);

        return payment;
    });

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

    await prisma.ticket.update({
        where: { id: ticketId },
        data: {
            deletedAt: new Date()
        }
    });

    await prisma.auditLog.create({
        data: {
            entityType: 'TICKET',
            entityId: ticketId,
            action: 'SOFT_DELETE',
            reason,
            user: user.name || user.username || "Unknown"
        }
    });

    revalidatePath('/ar/maintenance/tickets');
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
}, { permission: PERMISSIONS.TICKET_VIEW });

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
    });

    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath("/customers");
    return { success: true, ticket: result };
}, { permission: PERMISSIONS.TICKET_EDIT });
/**
 * Add a part to a ticket
 */
export const addTicketPart = secureAction(async (ticketId: string, data: {
    productId?: string,
    name?: string,
    quantity: number,
    warehouseId?: string,
    price?: number
}) => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Authentication required");

    const ticket = await prisma.ticket.findFirst({
        where: { OR: [{ id: ticketId }, { barcode: ticketId }] },
        include: { technician: true }
    });

    if (!ticket) throw new Error("Ticket not found");

    if (['DELIVERED', 'PICKED_UP', 'PAID_DELIVERED'].includes(ticket.status)) {
        const canEditClosed = user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'مدير النظام' || user.role === 'المالك';
        if (!canEditClosed) {
            throw new Error("This ticket is closed and can only be edited by an Admin or Manager.");
        }
    }

    let cost = 0;
    let price = data.price || 0;
    let productName = data.name || "Unknown Item";

    if (data.productId) {
        const product = await prisma.product.findUnique({ where: { id: data.productId } });
        if (!product) throw new Error("Product not found");

        cost = Number(product.costPrice);
        if (!price) price = Number(product.sellPrice);
        productName = product.name;

        let sourceWarehouseId = data.warehouseId;
        if (!sourceWarehouseId) {
            if (ticket.technician?.warehouseId) {
                sourceWarehouseId = ticket.technician.warehouseId;
            } else {
                const defaultWh = await prisma.warehouse.findFirst({ where: { isDefault: true } });
                sourceWarehouseId = defaultWh?.id;
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

            const availableStock = stock?.quantity ?? 0;
            if (availableStock < data.quantity) {
                throw new Error(`Insufficient stock. Available: ${availableStock}, Requested: ${data.quantity}`);
            }

            await prisma.$transaction(async (tx) => {
                await tx.stock.update({
                    where: { id: stock!.id },
                    data: { quantity: { decrement: data.quantity } }
                });

                await tx.stockMovement.create({
                    data: {
                        type: 'USAGE',
                        productId: data.productId!,
                        fromWarehouseId: sourceWarehouseId!,
                        quantity: data.quantity,
                        reason: `Used in Ticket #${ticket.barcode}`
                    }
                });

                await tx.product.update({
                    where: { id: data.productId! },
                    data: { stock: { decrement: data.quantity } }
                });
            });
        }
    }

    await prisma.ticketPart.create({
        data: {
            ticketId: ticket.id,
            productId: data.productId || undefined,
            name: productName,
            quantity: data.quantity,
            cost: new Decimal(cost),
            price: new Decimal(price),
            warehouseId: data.productId ? (data.warehouseId || undefined) : undefined
        }
    });

    const allParts = await prisma.ticketPart.findMany({ where: { ticketId: ticket.id } });
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
 * Remove a part from a ticket
 */
export const removeTicketPart = secureAction(async (partId: string, warehouseId?: string) => {
    const part = await prisma.ticketPart.findUnique({
        where: { id: partId },
        include: { product: true, ticket: true }
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
        await tx.ticketPart.delete({ where: { id: partId } });

        if (productId) {
            await tx.product.update({
                where: { id: productId },
                data: { stock: { increment: quantity } }
            });

            if (warehouseId) {
                const existingStock = await tx.stock.findUnique({
                    where: {
                        productId_warehouseId: {
                            productId: productId,
                            warehouseId: warehouseId
                        }
                    }
                });

                if (existingStock) {
                    await tx.stock.update({
                        where: { id: existingStock.id },
                        data: { quantity: { increment: quantity } }
                    });
                } else {
                    await tx.stock.create({
                        data: {
                            productId: productId,
                            warehouseId: warehouseId,
                            quantity: quantity
                        }
                    });
                }

                await tx.stockMovement.create({
                    data: {
                        type: 'RETURN',
                        productId: productId,
                        toWarehouseId: warehouseId,
                        quantity: quantity,
                        reason: `Returned from Ticket #${part.ticket?.barcode || part.ticketId} (Part Removed)`
                    }
                });
            }
        }

        const allParts = await tx.ticketPart.findMany({ where: { ticketId } });
        const totalPartsCost = allParts.reduce((sum, p) => sum + (Number(p.cost) * p.quantity), 0);
        const totalSellPrice = allParts.reduce((sum, p) => sum + (Number(p.price) * p.quantity), 0);

        const isWarrantyFix = part.ticket?.status === 'RETURNED_FOR_REFIX';
        const updateFields: Prisma.TicketUpdateInput = {
            partsCost: new Decimal(totalPartsCost),
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
    });

    revalidatePath(`/tickets/${ticketId}`);
    return { success: true };
}, { permission: PERMISSIONS.TICKET_EDIT });

/**
 * Get products for selection in parts manager
 */
export const getProductsForSelector = secureAction(async (warehouseId?: string) => {
    const products = await prisma.product.findMany({
        orderBy: { name: 'asc' },
        include: {
            stocks: true
        }
    });

    const data = products.map(p => {
        let stock = p.stock;
        if (warehouseId) {
            const st = p.stocks.find(s => s.warehouseId === warehouseId);
            stock = st ? st.quantity : 0;
        }

        return {
            id: p.id,
            name: p.name,
            sku: p.sku,
            stock: Number(stock),
            costPrice: Number(p.costPrice),
            sellPrice: Number(p.sellPrice),
            sellPrice2: Number(p.sellPrice2),
            sellPrice3: Number(p.sellPrice3),
        };
    });
    return { success: true, data };
}, { permission: PERMISSIONS.TICKET_VIEW });

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
}) => {
    const { ticketId, amount, paymentMethod, paymentType = 'PAYMENT', reference, customerId } = data;

    if (amount <= 0) throw new Error('Payment amount must be greater than zero');

    const ticket = await prisma.ticket.findFirst({
        where: { OR: [{ id: ticketId }, { barcode: ticketId }] },
        include: { customer: true }
    });

    if (!ticket) throw new Error('Ticket not found');

    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        throw new Error('No active shift. Please open a shift first.');
    }
    const currentShift = shiftResult.shift;

    const previousPaid = Number(ticket.amountPaid) || 0;
    const repairPrice = Number(ticket.repairPrice) || 0;

    let effectiveAmount = amount;
    const balanceDue = Math.max(0, repairPrice - previousPaid);

    if (repairPrice > 0 && amount > balanceDue) {
        effectiveAmount = balanceDue;
    }

    const newTotalPaid = previousPaid + effectiveAmount;
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
            const lookupPhone = ticket.customerPhone || (customerId && customerId.length > 5 ? customerId : '');
            if (lookupPhone) {
                const employee = await tx.user.findFirst({
                    where: { phone: { equals: lookupPhone } }
                });

                if (employee) {
                    isSalaryDeduction = true;
                    await tx.employeeTransaction.create({
                        data: {
                            userId: employee.id,
                            amount: new Prisma.Decimal(effectiveAmount).negated(),
                            type: 'MAINTENANCE_DEDUCTION',
                            referenceId: ticket.id,
                            referenceType: 'TICKET',
                            description: `Ticket #${ticket.barcode} - Repair Service`
                        }
                    });
                }
            }

            if (!isSalaryDeduction) {
                if (!customerId) throw new Error('Customer is required for account payments');
                let customer = await tx.customer.findUnique({ where: { id: customerId } });
                if (!customer) throw new Error('Customer not found');

                actualCustomerId = customer.id;
                await tx.customer.update({
                    where: { id: customer.id },
                    data: { balance: { increment: new Prisma.Decimal(effectiveAmount) } }
                });

                if (!ticket.customerId) {
                    await tx.ticket.update({
                        where: { id: ticketId },
                        data: { customerId: customer.id }
                    });
                }
            }
        }

        if (effectiveAmount > 0) {
            await tx.repairPayment.create({
                data: {
                    ticketId: ticket.id,
                    type: paymentType,
                    amount: new Prisma.Decimal(effectiveAmount),
                    method: paymentMethod,
                    reference: reference || null,
                    recordedBy: currentUser.name || currentUser.username || 'System'
                }
            });
        }

        const effectiveCustomerId = actualCustomerId || (paymentMethod === 'ACCOUNT' ? customerId : null);
        if (effectiveCustomerId && effectiveAmount > 0 && !isSalaryDeduction) {
            const isRefund = paymentType === 'REFUND';
            const isDeferred = paymentMethod === 'ACCOUNT';
            let description = `Ticket #${ticket.barcode}`;
            if (paymentType === 'DEPOSIT') description += ' - Deposit';
            else if (paymentType === 'REFUND') description += ' - Refund';
            else if (isDeferred) description += ' - Deferred';
            else description += ` - ${paymentMethod} Payment`;

            await tx.customerTransaction.create({
                data: {
                    customerId: effectiveCustomerId,
                    type: isDeferred ? 'DEBIT' : (isRefund ? 'DEBIT' : 'CREDIT'),
                    amount: new Prisma.Decimal(isRefund ? -effectiveAmount : effectiveAmount),
                    description,
                    reference: ticket.id,
                    createdBy: currentUser.id
                }
            });
        }

        const updatedTicket = await tx.ticket.update({
            where: { id: ticket.id },
            data: {
                amountPaid: new Prisma.Decimal(newTotalPaid),
                paymentStatus,
                paymentMethod: paymentMethod,
            }
        });

        if (paymentMethod !== 'ACCOUNT' && effectiveAmount > 0) {
            const shiftUpdate: Prisma.ShiftUpdateInput = {};
            switch (paymentMethod) {
                case 'CASH':
                    shiftUpdate.totalCashSales = { increment: new Prisma.Decimal(effectiveAmount) };
                    shiftUpdate.totalTicketRevenueCash = { increment: new Prisma.Decimal(effectiveAmount) };
                    break;
                case 'VISA':
                    shiftUpdate.totalCardSales = { increment: new Prisma.Decimal(effectiveAmount) };
                    shiftUpdate.totalTicketRevenueCard = { increment: new Prisma.Decimal(effectiveAmount) };
                    break;
                case 'WALLET':
                    shiftUpdate.totalWalletSales = { increment: new Prisma.Decimal(effectiveAmount) };
                    shiftUpdate.totalTicketRevenueWallet = { increment: new Prisma.Decimal(effectiveAmount) };
                    break;
                case 'INSTAPAY':
                    shiftUpdate.totalInstapay = { increment: new Prisma.Decimal(effectiveAmount) };
                    shiftUpdate.totalTicketRevenueInstapay = { increment: new Prisma.Decimal(effectiveAmount) };
                    break;
            }

            await tx.shift.update({
                where: { id: currentShift.id },
                data: shiftUpdate
            });

            const isRefund = paymentType === 'REFUND';
            const txType = isRefund ? 'REFUND' : 'TICKET';
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
                    description: `Ticket #${ticket.barcode} (${paymentType})`,
                    shiftId: currentShift.id,
                    treasuryId: defaultTreasuryId
                }
            });

            if (defaultTreasuryId) {
                if (isRefund) {
                    await tx.treasury.update({
                        where: { id: defaultTreasuryId },
                        data: { balance: { decrement: new Prisma.Decimal(effectiveAmount) } }
                    });
                } else {
                    await tx.treasury.update({
                        where: { id: defaultTreasuryId },
                        data: { balance: { increment: new Prisma.Decimal(effectiveAmount) } }
                    });
                }
            }

            // Accounting Integration
            const accountCode = paymentMethod === 'CASH' ? '1000' : (paymentMethod === 'VISA' ? '1010' : '1020');
            await AccountingEngine.recordTransaction({
                description: `Ticket #${ticket.barcode} Payment`,
                reference: ticket.id,
                lines: [
                    { accountCode, debit: effectiveAmount, credit: 0, description: 'Payment Received' },
                    { accountCode: '4100', debit: 0, credit: effectiveAmount, description: 'Service Revenue' }
                ]
            }, tx);
        }

        return updatedTicket;
    });

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
}, { permission: PERMISSIONS.TICKET_VIEW });

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

    await prisma.ticketCollaborator.delete({
        where: {
            ticketId_technicianId: { ticketId, technicianId }
        }
    });

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
            where: { deletedAt: null },
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
        const branchFilter = await getBranchFilter();

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
        const branchFilter = await getBranchFilter();

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
