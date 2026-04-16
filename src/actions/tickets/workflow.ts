"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentUser } from "../auth";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { serialize } from "@/lib/serialization";

import { getFormattedTicketNumber } from "@/lib/id-generator";

/**
 * Helper to get next sequential ticket number (T-001, T-002...) with collision protection
 */
export async function getNextTicketNumber(branchId?: string): Promise<string> {
    let branchCode = '';
    if (branchId) {
        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { code: true }
        });
        branchCode = branch?.code || '';
    }

    return await getFormattedTicketNumber(branchCode);
}

/**
 * Helper to check if a ticket is locked
 */
export function checkTicketLock(ticket: { status: string }, user: { role: string }) {
    if (!ticket || !user) return false;
    const isAdmin = ['ADMIN', 'مدير النظام', 'المالك'].includes(user.role);
    if (isAdmin) return false;

    if (ticket.status === 'RETURNED_FOR_REFIX') return false;

    const lockedStatuses = ['DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'CANCELLED', 'REJECTED'];
    return lockedStatuses.includes(ticket.status);
}

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

    const result = await prisma.$transaction(async (tx) => {
        const technicianProfile = await tx.technician.findUnique({
            where: { id: technicianId },
            select: { commissionRate: true, name: true }
        });

        if (!technicianProfile) throw new Error("Technician profile not found");

        const oldTechName = existing.technician?.name || "غير مسند";
        const newTechName = technicianProfile.name || "فني غير معروف";

        const ticket = await tx.ticket.update({
            where: { id: ticketId },
            data: {
                technicianId,
                status: "IN_PROGRESS",
                startedAt: new Date(),
                commissionRate: technicianProfile.commissionRate
            }
        });

        await tx.ticketNote.create({
            data: {
                ticketId,
                text: existing.isWarrantyReturn 
                    ? `⚠️ إعادة تعيين استثنائية لتذكرة ضمان: تم النقل من [${oldTechName}] إلى [${newTechName}]`
                    : `Technician assigned: ${newTechName} (Comm: ${technicianProfile.commissionRate}%)`,
                author: user.name || user.username || "System",
                isInternal: true
            }
        });

        return ticket;
    });

    revalidatePath(`/tickets/${ticketId}`);
    return { success: true, ticket: result };
}, { permission: PERMISSIONS.TICKET_ASSIGN });

// ... other workflow actions ...
