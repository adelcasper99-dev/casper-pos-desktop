"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Decimal } from "decimal.js";
import { z } from "zod";

const TransactionSchema = z.object({
    id: z.string().optional(),
    userId: z.string(),
    type: z.enum(["BONUS", "ADDITION", "DEDUCTION", "PENALTY"]),
    amount: z.number().positive(),
    description: z.string().min(1, "Description is required"),
    createdAt: z.date().optional(),
});

export async function upsertEmployeeTransaction(data: z.infer<typeof TransactionSchema>, reason?: string) {
    const session = await getSession();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const isAdmin = ["ADMIN", "مدير النظام", "المالك"].includes(session.user.role || "");
    // Assuming HR management permission exists or is covered by Admin
    if (!isAdmin) return { success: false, error: "Forbidden: Admin access required" };

    try {
        const validatedData = TransactionSchema.parse(data);
        
        const payload = {
            userId: validatedData.userId,
            type: validatedData.type,
            amount: new Decimal(validatedData.amount),
            description: validatedData.description,
            createdAt: validatedData.createdAt || new Date(),
        };

        let result;
        let action = "CREATE";

        if (validatedData.id) {
            action = "UPDATE";
            const existing = await prisma.employeeTransaction.findUnique({ where: { id: validatedData.id } });
            if (!existing) return { success: false, error: "Transaction not found" };
            
            result = await prisma.employeeTransaction.update({
                where: { id: validatedData.id },
                data: payload,
            });
        } else {
            result = await prisma.employeeTransaction.create({
                data: payload,
            });
        }

        // Audit Logging
        await (prisma as any).auditLog.create({
            data: {
                entityType: "EmployeeTransaction",
                entityId: result.id,
                action: action,
                newData: JSON.stringify(result),
                reason: reason || "Manual ledger update",
                user: session.user.name || session.user.id,
            }
        });

        revalidatePath(`/hr/employees/${validatedData.userId}`);
        return { success: true, data: result };
    } catch (error: any) {
        console.error("Error upserting employee transaction:", error);
        return { success: false, error: error.message || "Internal Server Error" };
    }
}

export async function deleteEmployeeTransaction(id: string, userId: string, reason: string) {
    const session = await getSession();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const isAdmin = ["ADMIN", "مدير النظام", "المالك"].includes(session.user.role || "");
    if (!isAdmin) return { success: false, error: "Forbidden" };

    try {
        const existing = await prisma.employeeTransaction.findUnique({ where: { id } });
        if (!existing) return { success: false, error: "Transaction not found" };

        await prisma.employeeTransaction.delete({ where: { id } });

        // Audit Logging
        await (prisma as any).auditLog.create({
            data: {
                entityType: "EmployeeTransaction",
                entityId: id,
                action: "DELETE",
                previousData: JSON.stringify(existing),
                reason: reason || "Manual ledger deletion",
                user: session.user.name || session.user.id,
            }
        });

        revalidatePath(`/hr/employees/${userId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Error deleting employee transaction:", error);
        return { success: false, error: "Internal Server Error" };
    }
}

export async function updateAttendanceEntry(data: { id: string, bonus?: number, deduction?: number, note?: string, bonusNote?: string, deductionNote?: string }, userId: string, reason: string) {
    const session = await getSession();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const isAdmin = ["ADMIN", "مدير النظام", "المالك"].includes(session.user.role || "");
    if (!isAdmin) return { success: false, error: "Forbidden" };

    try {
        const existing = await prisma.dailyWorkLog.findUnique({ where: { id: data.id } });
        if (!existing) return { success: false, error: "Attendance log not found" };

        const updated = await prisma.dailyWorkLog.update({
            where: { id: data.id },
            data: {
                bonus: data.bonus !== undefined ? new Decimal(data.bonus) : undefined,
                deduction: data.deduction !== undefined ? new Decimal(data.deduction) : undefined,
                bonusNote: data.bonusNote,
                deductionNote: data.deductionNote,
                note: data.note,
            }
        });

        // Audit Logging
        await (prisma as any).auditLog.create({
            data: {
                entityType: "DailyWorkLog",
                entityId: data.id,
                action: "UPDATE",
                newData: JSON.stringify(updated),
                previousData: JSON.stringify(existing),
                reason: reason || "Ledger attendance update",
                user: session.user.name || session.user.id,
            }
        });

        revalidatePath(`/hr/employees/${userId}`);
        return { success: true, data: updated };
    } catch (error: any) {
        console.error("Error updating attendance entry:", error);
        return { success: false, error: "Internal Server Error" };
    }
}

export async function deleteAttendanceEntry(id: string, type: string, userId: string, reason: string) {
    const session = await getSession();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const isAdmin = ["ADMIN", "مدير النظام", "المالك"].includes(session.user.role || "");
    if (!isAdmin) return { success: false, error: "Forbidden" };

    try {
        const existing = await prisma.dailyWorkLog.findUnique({ where: { id } });
        if (!existing) return { success: false, error: "Attendance log not found" };

        let dataUpdate: any = {
            bonus: new Decimal(0),
            deduction: new Decimal(0),
            bonusNote: null,
            deductionNote: null,
        };

        // If trying to delete an absence or late penalty from the ledger, 
        // we must change the status to 'PRESENT' to stop auto-deductions.
        if (type === 'ABSENT' || type === 'LATE' || type === 'OFF') {
            dataUpdate.status = 'PRESENT';
        }

        const updated = await prisma.dailyWorkLog.update({
            where: { id },
            data: dataUpdate
        });

        // Audit Logging
        await (prisma as any).auditLog.create({
            data: {
                entityType: "DailyWorkLog",
                entityId: id,
                action: "LEDGER_DELETE",
                newData: JSON.stringify(updated),
                previousData: JSON.stringify(existing),
                reason: reason || `Ledger attendance data reset`,
                user: session.user.name || session.user.id,
            }
        });

        revalidatePath(`/hr/employees/${userId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Error deleting attendance entry subset:", error);
        return { success: false, error: "Internal Server Error" };
    }
}
