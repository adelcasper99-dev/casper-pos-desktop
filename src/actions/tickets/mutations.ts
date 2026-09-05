"use server";
import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentUser } from "../auth";
import { getCurrentShiftInternal } from "../shift-management-actions";
import { revalidatePath, revalidateTag } from "next/cache";
import { logger } from "@/lib/logger";
import { Decimal } from "@prisma/client/runtime/library";
import { ticketSchema } from "@/lib/validation/tickets";
import { getNextTicketNumber } from "./workflow";
import { TicketUpdateData } from "./types";
import { z } from "zod";

export const createTicket = secureAction(async (rawData: z.infer<typeof ticketSchema> & { csrfToken?: string, idempotencyKey?: string }) => {
    const { idempotencyKey, ...schemaRaw } = rawData;
    const data = ticketSchema.parse(schemaRaw);
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Unauthorized");

    // SHIFT GUARD: Try current user's shift first, then any open branch shift
    let currentShift: any = null;
    const shiftResult = await getCurrentShiftInternal({ userId: currentUser.id });
    if (shiftResult.shift?.status === 'OPEN') {
        currentShift = shiftResult.shift;
    } else if (currentUser.branchId) {
        // Fallback: find any open shift in the same branch (for managers/supervisors)
        const { prisma: prismaClient } = await import('@/lib/prisma');
        const branchShift = await prismaClient.shift.findFirst({
            where: { status: 'OPEN', user: { branchId: currentUser.branchId } },
            orderBy: { openedAt: 'desc' }
        });
        if (branchShift) currentShift = branchShift;
    }

    const { PERMISSIONS: PERMS, hasPermission: hasPerm } = await import('@/lib/permissions');
    const canBypassShift = hasPerm(currentUser.permissions, PERMS.TICKET_OVERRIDE);
    if (!currentShift && !canBypassShift) {
        throw new Error("لا توجد وردية مفتوحة. يرجى فتح وردية أولاً أو التواصل مع مدير الفرع.");    
    }

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
        barcode = await getNextTicketNumber(branchId || undefined);
        const existing = await prisma.ticket.findUnique({ where: { barcode } });
        if (!existing) break;
        await new Promise(res => setTimeout(res, Math.random() * 200));
        retries++;
    }
    if (retries >= MAX_RETRIES) throw new Error("System is busy (ID Collision), please try again.");

    let customerId = (data as any).customerId;
    let clientUserId: string | undefined = undefined;
    let clientSupplierId: string | undefined = undefined;

    const result = await (prisma as any).$transaction(async (tx: any) => {
        // TK-02: Secure Customer Linking (Atomic Upsert)
        if (data.customerPhone && data.customerPhone.trim().length > 0) {
            const normalizedPhone = data.customerPhone.trim();

            const { checkGlobalPhoneUniqueness } = await import('@/lib/phone-validation');
            const phoneCheck = await checkGlobalPhoneUniqueness(normalizedPhone, undefined, undefined, tx);

            if (!phoneCheck.unique) {
                if (phoneCheck.usedBy === 'USER') clientUserId = phoneCheck.entityId;
                else if (phoneCheck.usedBy === 'SUPPLIER') clientSupplierId = phoneCheck.entityId;
                else if (phoneCheck.usedBy === 'CUSTOMER') customerId = phoneCheck.entityId;
            } else if (!customerId) {
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
                shiftId: currentShift?.id || null,
                expectedDuration: data.expectedDuration || null,
                idempotencyKey: idempotencyKey || null,
            }
        });

        await tx.ticketNote.create({
            data: {
                ticketId: ticket.id,
                text: "Ticket created",
                author: currentUser.name || currentUser.username || "System",
                isInternal: true
            }
        });

        if (currentShift) {
            await tx.shift.update({
                where: { id: currentShift.id },
                data: { totalTickets: { increment: 1 }, lastHeartbeat: new Date() }
            });
        }

        return ticket;
    }, { timeout: 60000 });

    revalidatePath("/ar/maintenance/tickets");
    revalidateTag("dashboard");

    return { success: true, ticketId: result.id, barcode: result.barcode };
}, { permission: PERMISSIONS.TICKET_CREATE });

export const updateTicketDetails = secureAction(async (data: TicketUpdateData) => {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Unauthorized");
    
    const { notes, ...otherUpdates } = data.updates;

    const updated = await prisma.ticket.update({
        where: { id: data.ticketId },
        data: otherUpdates as any
    });

    if (notes) {
        await prisma.ticketNote.create({
            data: {
                ticketId: data.ticketId,
                text: notes,
                author: currentUser.name || currentUser.username || "System",
                isInternal: true
            }
        });
    }

    await prisma.ticketNote.create({
        data: {
            ticketId: data.ticketId,
            text: `Details updated by ${currentUser.name || currentUser.username}`,
            author: currentUser.name || currentUser.username || "System",
            isInternal: true
        }
    });

    revalidatePath(`/tickets/${data.ticketId}`);
    return { success: true, ticket: updated };
}, { permission: PERMISSIONS.TICKET_EDIT });

export const softDeleteTicket = secureAction(async (data: { ticketId: string, reason?: string, csrfToken?: string }) => {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Unauthorized");

    await prisma.ticket.update({
        where: { id: data.ticketId },
        data: { 
            deletedAt: new Date(),
            notes: {
                create: {
                    text: `Deleted: ${data.reason || 'No reason provided'}`,
                    author: currentUser.name || currentUser.username || "System",
                    isInternal: true
                }
            }
        }
    });

    revalidatePath("/tickets");
    return { success: true };
}, { permission: PERMISSIONS.TICKET_DELETE });
