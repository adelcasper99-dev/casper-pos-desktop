"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentUser } from "../auth";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { serialize } from "@/lib/serialization";

/**
 * Helper to get next sequential ticket number (T-001, T-002...) with collision protection
 */
export async function getNextTicketNumber(branchId?: string): Promise<string> {
    let prefix = 'T-';
    if (branchId) {
        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { code: true }
        });
        if (branch?.code) {
            prefix = `${branch.code}-T`;
        }
    }

    let attempts = 0;
    while (attempts < 5) {
        const lastTickets = await prisma.ticket.findMany({
            where: { barcode: { startsWith: prefix } },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { barcode: true }
        });

        let maxSeq = 0;
        // Escape prefix for regex
        const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^${escapedPrefix}(\\d+)$`);
        
        for (const ticket of lastTickets) {
            const match = ticket.barcode.match(regex);
            if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num) && num > maxSeq) maxSeq = num;
            }
        }

        const nextNum = maxSeq + 1;
        const candidate = `${prefix}${nextNum.toString().padStart(3, '0')}`;

        const exists = await prisma.ticket.findUnique({ where: { barcode: candidate } });
        if (!exists) return candidate;

        attempts++;
        await new Promise(r => setTimeout(r, Math.random() * 50));
    }
    return `${prefix}F${Date.now().toString().slice(-6)}`;
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
