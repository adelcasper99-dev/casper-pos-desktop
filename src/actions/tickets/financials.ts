"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentUser } from "../auth";
import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
import { getCurrentShiftInternal } from "../shift-management-actions";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";

export const processTicketPayment = secureAction(async (data: {
    ticketId: string,
    amount: number,
    paymentMethod: string,
    treasuryId?: string,
    csrfToken?: string
}) => {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Unauthorized");

    const result = await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.findUnique({
            where: { id: data.ticketId },
            include: { currentBranch: true }
        });

        if (!ticket) throw new Error("Ticket not found");

        const payment = await tx.repairPayment.create({
            data: {
                ticketId: data.ticketId,
                amount: new Decimal(data.amount),
                method: data.paymentMethod,
                recordedBy: currentUser.name || currentUser.username || "System",
            }
        });

        // 1. Update Ticket financials
        const amountDec = new Decimal(data.amount);
        const newPaid = new Decimal(ticket.amountPaid?.toString() || '0').add(amountDec);
        const repairPrice = new Decimal(ticket.repairPrice?.toString() || '0');

        await tx.ticket.update({
            where: { id: data.ticketId },
            data: {
                amountPaid: newPaid,
                paymentStatus: (newPaid.gte(repairPrice)) ? 'paid' : 'partial'
            }
        });

        // 2. Treasury & Audit Transaction
        const treasuryId = data.treasuryId; // In production, this should be validated against the branch
        const treasury = await tx.treasury.findUnique({
            where: { id: treasuryId || 'DEFAULT_CASH_TREASURY_ID_FALLBACK' } // Need real resolution logic
        }) || await tx.treasury.findFirst({
            where: { branchId: currentUser.branchId!, isDefault: true }
        });

        if (treasury) {
            await tx.transaction.create({
                data: {
                    type: 'INCOME',
                    amount: new Decimal(data.amount),
                    paymentMethod: data.paymentMethod,
                    description: `Maintenance Payment: Ticket #${ticket.barcode}`,
                    treasuryId: treasury.id
                }
            });

            await tx.treasury.update({
                where: { id: treasury.id },
                data: { balance: { increment: data.amount } }
            });
        }

        // 3. Accounting logic (Dynamic GL Mapping)
        await AccountingEngine.recordMaintenancePayment({
            amount: data.amount,
            method: data.paymentMethod,
            description: `Payment for Ticket #${ticket.barcode}`,
            reference: ticket.id,
            ticketId: ticket.id,
            branchId: currentUser.branchId ?? undefined
        }, tx);

        return payment;
    }, { timeout: 20000 });

    revalidatePath(`/tickets/${data.ticketId}`);
    return { success: true, payment: result };
}, { permission: PERMISSIONS.TICKET_PAY });

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
        const amountDec = new Decimal(amount);
        const currentPaid = new Decimal(ticket.amountPaid?.toString() || '0');
        const repairPrice = new Decimal(ticket.repairPrice?.toString() || '0');

        if (amountDec.lte(0)) throw new Error("Invalid refund amount.");
        if (amountDec.gt(currentPaid)) throw new Error("Refund amount exceeds paid amount.");

        const lastPayment = ticket.payments.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
        const refundMethod = lastPayment?.method || ticket.paymentMethod || 'CASH';

        // 1. Create refund record
        const payment = await tx.repairPayment.create({
            data: {
                ticketId,
                amount: amountDec,
                type: 'REFUND',
                method: refundMethod,
                reference: reason,
                recordedBy: user.name || user.username || "System"
            }
        });

        // 2. Update financials
        const newAmountPaid = currentPaid.minus(amountDec);
        let paymentStatus = 'partial';
        if (newAmountPaid.lte(0)) paymentStatus = 'unpaid';
        else if (repairPrice.gt(0) && newAmountPaid.gte(repairPrice)) paymentStatus = 'paid';
        
        await tx.ticket.update({
            where: { id: ticketId },
            data: {
                amountPaid: newAmountPaid,
                paymentStatus
            }
        });

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
                shiftUpdate.totalTicketRevenueCard = { increment: absAmount.negated() };
                break;
            case 'WALLET':
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

        await AccountingEngine.recordRefund({
            amount,
            method: refundMethod,
            description: `Refund: Ticket #${ticket.barcode}`,
            reference: ticketId,
            ticketId: ticketId,
            cogsReversal: 0,
            branchId: user.branchId ?? undefined
        }, tx);

        return payment;
    }, { timeout: 60000 });

    revalidatePath(`/tickets/${ticketId}`);
    return { success: true, refund: result };
}, { permission: PERMISSIONS.POS_REFUND });
