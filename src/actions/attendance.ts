'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions/registry";
import { logAction } from '@/lib/audit'
import { getSession } from "@/lib/auth";

const db = prisma as any;

export const upsertDailyLog = secureAction(async (data: { userId: string, dateStr: string, data: any, csrfToken?: string }) => {
    // Note: data.data is the nested daily log data.
    const { userId, dateStr, data: logData } = data;
    const date = new Date(dateStr); 

    const existing = await db.dailyWorkLog.findUnique({
        where: {
            userId_date: {
                userId,
                date
            }
        }
    });

    if (existing) {
        await db.dailyWorkLog.update({
            where: { id: existing.id },
            data: {
                status: logData.status,
                deduction: logData.deduction ? Number(logData.deduction) : undefined,
                bonus: logData.bonus ? Number(logData.bonus) : undefined,
                note: logData.note,
                checkIn: logData.checkIn ? new Date(`${dateStr}T${logData.checkIn}:00`) : undefined,
                checkOut: logData.checkOut ? new Date(`${dateStr}T${logData.checkOut}:00`) : undefined,
            }
        });
        
        // Audit only if meaningful change (Status or Financials)
        if (existing.status !== logData.status || logData.deduction || logData.bonus) {
                await logAction("ATTENDANCE", existing.id, "UPDATE", { 
                oldStatus: existing.status, 
                newStatus: logData.status, 
                deduction: logData.deduction,
                bonus: logData.bonus
            });
        }

    } else {
        const newLog = await db.dailyWorkLog.create({
            data: {
                userId,
                date,
                status: logData.status || "PRESENT",
                deduction: logData.deduction ? Number(logData.deduction) : 0,
                bonus: logData.bonus ? Number(logData.bonus) : 0,
                note: logData.note,
                checkIn: logData.checkIn ? new Date(`${dateStr}T${logData.checkIn}:00`) : undefined,
                checkOut: logData.checkOut ? new Date(`${dateStr}T${logData.checkOut}:00`) : undefined,
            }
        });
        
        await logAction("ATTENDANCE", newLog.id, "CREATE", { status: logData.status });
    }

    revalidatePath('/hr/attendance');
    return { success: true };
}, { permission: PERMISSIONS.HR_MANAGE_ATTENDANCE });

export const getMonthlyLogs = secureAction(async (monthStr: string) => { // "2024-05"
    const startOfMonth = new Date(`${monthStr}-01`);
    const endOfMonth = new Date(new Date(startOfMonth).setMonth(startOfMonth.getMonth() + 1));

    const logs = await db.dailyWorkLog.findMany({
        where: {
            date: {
                gte: startOfMonth,
                lt: endOfMonth
            }
        }
    });

    // Serialize Decimals
    const safeLogs = logs.map((log: any) => ({
        ...log,
        deduction: Number(log.deduction),
        bonus: Number(log.bonus),
        checkIn: log.checkIn ? log.checkIn.toISOString() : null,
        checkOut: log.checkOut ? log.checkOut.toISOString() : null,
    }));

    return { data: safeLogs };
}, { permission: PERMISSIONS.HR_VIEW_ATTENDANCE, requireCSRF: false });

/**
 * Server-side data fetching for Server Components
 * Throws an error if unauthorized instead of returning error response
 */
export async function getMonthlyLogsForPage(monthStr: string) {
    const session = await getSession();
    if (!session?.user) {
        throw new Error("Unauthorized: Please log in.");
    }
    
    const user = session.user;
    const hasAccess = user.permissions?.includes(PERMISSIONS.HR_VIEW_ATTENDANCE) || user.role === "ADMIN";
    
    if (!hasAccess) {
        throw new Error("Forbidden: Insufficient permissions.");
    }

    const startOfMonth = new Date(`${monthStr}-01`);
    const endOfMonth = new Date(new Date(startOfMonth).setMonth(startOfMonth.getMonth() + 1));

    const logs = await db.dailyWorkLog.findMany({
        where: {
            date: {
                gte: startOfMonth,
                lt: endOfMonth
            }
        }
    });

    // Serialize Decimals
    return logs.map((log: any) => ({
        ...log,
        deduction: Number(log.deduction),
        bonus: Number(log.bonus),
        checkIn: log.checkIn ? log.checkIn.toISOString() : null,
        checkOut: log.checkOut ? log.checkOut.toISOString() : null,
    }));
}
