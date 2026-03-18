"use server";

import { prisma } from "@/lib/prisma"
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { startOfMonth, endOfMonth } from "date-fns";
import { financialRepo } from "@/lib/repositories/financial-repo";

const db = prisma as any;
import { calculateNetDue } from "@/lib/salary-utils";

export const getStaffDirectory = secureAction(async (data?: { month?: number; year?: number }) => {
    const now = new Date();
    const month = data?.month ?? now.getMonth();
    const year = data?.year ?? now.getFullYear();
    const startDate = startOfMonth(new Date(year, month));
    const endDate = endOfMonth(new Date(year, month));

    noStore();

    const users = await db.user.findMany({
        where: { deletedAt: null },
        include: {
            role: true,
            branch: true,
            technician: true,
            sessions: {
                where: { expiresAt: { gt: new Date() } },
                take: 1
            },
            dailyLogs: {
                where: { 
                    date: { gte: startDate, lte: endDate }
                }
            },
            employeeTransactions: {
                where: { 
                    createdAt: { gte: startDate, lte: endDate }
                }
            }
        },
        orderBy: { name: 'asc' }
    });

    const { Decimal } = await import("decimal.js");

    const staffData = await Promise.all(users.map(async (u: any) => {
        const { baseSalary, netDue } = await calculateNetDue(u, startDate, endDate);

        return {
            id: u.id,
            name: u.name || u.username,
            username: u.username,
            role: u.role?.name || "Staff",
            branch: u.branch?.name || "Main",
            salary: u.salary ? Number(u.salary) : 0,
            effectiveSalary: baseSalary.toNumber(),
            netDue: netDue.toNumber(),
            status: u.sessions.length > 0 ? 'ONLINE' : 'OFFLINE',
            clockInTime: u.sessions.length > 0 ? u.sessions[0].createdAt : null,
            avatarSeed: u.username,
            hireDate: u.hireDate
        };
    }));

    return { data: staffData };
}, { permission: PERMISSIONS.HR_VIEW_ATTENDANCE, requireCSRF: false });

/**
 * Fetches users with all fields required by the attendance components:
 * monthlyOffDays, salary, roleStr — for DailyAttendance & EmployeeAttendanceDetail
 */
export async function getUsersForAttendancePage() {
    const session = await getSession();
    if (!session?.user) throw new Error("Unauthorized");

    const hasAccess = hasPermission(session.user.permissions, PERMISSIONS.HR_VIEW_ATTENDANCE) || session.user.role === "ADMIN";
    if (!hasAccess) throw new Error("Forbidden");

    const users = await db.user.findMany({
        where: { deletedAt: null },
        include: { role: true },
        orderBy: { name: 'asc' }
    });

    return users.map((u: any) => ({
        id: u.id,
        name: u.name || u.username,
        roleStr: u.role?.name || "Staff",
        salary: u.salary ? Number(u.salary) : 0,
        monthlyOffDays: u.monthlyOffDays ?? 4,
    }));
}

export async function getBranchesAndRoles() {
    const session = await getSession();
    if (!session?.user) throw new Error("Unauthorized");

    const branches = await db.branch.findMany({ where: { deletedAt: null } });
    const roles = await db.role.findMany();

    return {
        branches: branches.map((b: any) => ({ id: b.id, name: b.name })),
        roles: roles.map((r: any) => ({ id: r.id, name: r.name }))
    };
}

export async function updateEmployeeData(userId: string, data: {
    name?: string;
    roleId?: string;
    branchId?: string;
    salary?: number;
    monthlyOffDays?: number;
    hireDate?: string | Date | null;
}) {
    const session = await getSession();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const isAdmin = session.user.role === "ADMIN" || session.user.role === "مدير النظام" || session.user.role === "المالك";
    const canManageUsers = hasPermission(session.user.permissions, PERMISSIONS.MANAGE_USERS);

    if (!isAdmin && !canManageUsers) {
        return { success: false, error: "Forbidden" };
    }

    if (!data.hireDate) {
        return { success: false, error: "تاريخ التعيين مطلوب" };
    }

    try {
        const updateData: any = {
            name: data.name,
            roleId: (data.roleId && data.roleId !== "") ? data.roleId : null,
            branchId: (data.branchId && data.branchId !== "") ? data.branchId : null,
            salary: typeof data.salary === 'number' && !isNaN(data.salary) ? data.salary : undefined,
            monthlyOffDays: typeof data.monthlyOffDays === 'number' && !isNaN(data.monthlyOffDays) ? data.monthlyOffDays : undefined,
            hireDate: data.hireDate ? new Date(data.hireDate) : undefined,
        };

        // Remove undefined fields to avoid overriding with nothing if not provided
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

        const updated = await db.user.update({
            where: { id: userId },
            data: updateData
        });

        // Audit Log
        await db.actionLog.create({
            data: {
                action: "UPDATE_EMPLOYEE_DATA",
                details: `Updated personal data for ${updated.username}. Changes: ${JSON.stringify(data)}`,
                userId: session.user.id
            }
        });

        return { success: true, message: "Employee data updated successfully" };
    } catch (error) {
        console.error("Error updating employee data:", error);
        return { success: false, error: "Internal Server Error" };
    }
}

export async function toggleUserFreeze(userId: string) {
    const session = await getSession();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const isAdmin = session.user.role === "ADMIN" || session.user.role === "مدير النظام" || session.user.role === "المالك";
    const canManageUsers = hasPermission(session.user.permissions, PERMISSIONS.MANAGE_USERS);

    if (!isAdmin && !canManageUsers) {
        return { success: false, error: "Forbidden" };
    }

    try {
        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user) return { success: false, error: "User not found" };

        const updatedUser = await db.user.update({
            where: { id: userId },
            data: { isFrozen: !user.isFrozen }
        });

        // If freezing, also terminate active sessions
        if (updatedUser.isFrozen) {
            await db.session.deleteMany({ where: { userId } });
        }

        return { 
            success: true, 
            isFrozen: updatedUser.isFrozen,
            message: updatedUser.isFrozen ? "Account frozen successfully" : "Account unfrozen successfully"
        };
    } catch (error) {
        console.error("Error toggling user freeze:", error);
        return { success: false, error: "Internal Server Error" };
    }
}

export const getHRDashboardSummary = secureAction(async (params?: { month?: number; year?: number }) => {
    noStore();
    
    const now = new Date();
    const targetMonth = params?.month ?? now.getMonth(); 
    const targetYear = params?.year ?? now.getFullYear();

    const start = new Date(targetYear, targetMonth, 1);
    const end = endOfMonth(start);

    // 1. Calculate Net Expected Salaries for ALL active users
    const activeUsers = await db.user.findMany({
        where: {
            deletedAt: null,
            isFrozen: false
        },
        include: {
            dailyLogs: {
                where: { date: { gte: start, lte: end } }
            },
            employeeTransactions: {
                where: { createdAt: { gte: start, lte: end } }
            }
        }
    });

    const { Decimal } = await import("decimal.js");
    let totalNetDue = new Decimal(0);

    for (const u of activeUsers) {
        const { netDue } = await calculateNetDue(u, start, end);
        totalNetDue = totalNetDue.plus(netDue);
    }

    // 2. Total Absences this month
    const totalAbsences = await db.dailyWorkLog.count({
        where: {
            status: 'ABSENT',
            date: {
                gte: start,
                lte: end
            }
        }
    });

    // 3. Net Employee Credit Sales this month
    const transactions = await db.employeeTransaction.findMany({
        where: {
            createdAt: {
                gte: start,
                lte: end
            },
            type: {
                in: ['SALES_DEDUCTION', 'MAINTENANCE_DEDUCTION', 'SALES_DEDUCTION_REVERSAL', 'MAINTENANCE_DEDUCTION_REVERSAL']
            }
        },
        select: { amount: true, type: true }
    });

    let creditSales = 0;
    for (const t of transactions) {
        const amt = t.amount ? Number(t.amount) : 0;
        const safeAmt = isNaN(amt) ? 0 : amt;
        
        if (t.type === 'SALES_DEDUCTION' || t.type === 'MAINTENANCE_DEDUCTION') {
            creditSales += safeAmt;
        } else if (t.type === 'SALES_DEDUCTION_REVERSAL' || t.type === 'MAINTENANCE_DEDUCTION_REVERSAL') {
            creditSales -= safeAmt;
        }
    }

    return {
        data: {
            expectedSalaries: totalNetDue.toNumber(),
            totalAbsences,
            employeeCreditSales: creditSales
        }
    };
}, { permission: PERMISSIONS.HR_VIEW_ATTENDANCE, requireCSRF: false });

export const payEmployeeSalary = secureAction(async (data: {
    userId: string;
    amount: number;
    paymentMethod: string;
    notes?: string;
    treasuryId?: string;
}) => {
    const session = await getSession();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const isAdmin = ["ADMIN", "مدير النظام", "المالك"].includes(session.user.role || "");
    if (!isAdmin) return { success: false, error: "Forbidden: Admin access required" };

    try {
        // Validation handled by caller, but we check treasury if CASH
        if (data.paymentMethod === 'CASH' && !data.treasuryId) {
            return { success: false, error: "Treasury is required for cash payments" };
        }

        // Soft Guard (E-03): In a full payroll run, data.amount should be validated against
        // calculatePayroll(employee, ...). Since this is a manual override payment endpoint,
        // we allow arbitrary amounts but flag it for audit visibility.
        const { logger } = await import('@/lib/logger');
        logger.info(`[HR] Manual Salary Payment: User ${data.userId} paid ${data.amount} via ${data.paymentMethod}`);

        const result = await (prisma as any).$transaction(async (tx: any) => {
            // 1. Create Employee Transaction (Ledger) - with auto journal
            const empTx = await financialRepo.createEmployeeTransaction(tx, {
                userId: data.userId,
                type: 'SALARY_PAYMENT',
                amount: data.amount,
                description: data.notes || `سداد راتب عبر ${data.paymentMethod}`,
                branchId: session?.user?.branchId || null,
                skipJournal: true // Skip auto-journal since we have manual accounting below
            });

            // 2. Accounting Entry
            // Debit: Salaries Expense (5100)
            // Credit: Cash/Bank (Depends on method)
            const accountMap: Record<string, string> = {
                CASH: '1000',
                BANK: '1010',
                VISA: '1010',
                CARD: '1010',
                INSTAPAY: '1020',
                WALLET: '1020'
            };

            const creditAccount = accountMap[data.paymentMethod] || '1000';

            const { AccountingEngine } = await import("@/lib/accounting/transaction-factory");
            await AccountingEngine.recordTransaction({
                description: `سداد راتب: ${data.userId}`,
                reference: empTx.id,
                branchId: session.user.branchId ?? undefined,
                lines: [
                    { accountCode: '5100', debit: data.amount, credit: 0, description: `إثبات مصروف الرواتب للموظف ID: ${data.userId}` },
                    { accountCode: creditAccount, debit: 0, credit: data.amount, description: `وسيلة الدفع: ${data.paymentMethod}` }
                ]
            }, tx);

            // 3. Update Treasury if CASH
            if (data.paymentMethod === 'CASH' && data.treasuryId) {
                const treasury = await tx.treasury.findUnique({ where: { id: data.treasuryId } });
                if (!treasury) throw new Error("Treasury not found");
                if (Number(treasury.balance) < data.amount) {
                    const canGoNegative = hasPermission(session.user.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
                    if (!canGoNegative) {
                        throw new Error("Insufficient treasury balance");
                    }
                }

                await tx.treasury.update({
                    where: { id: data.treasuryId },
                    data: { balance: { decrement: data.amount } }
                });

                await tx.transaction.create({
                    data: {
                        type: 'EXPENSE',
                        amount: data.amount,
                        description: `سداد راتب: ${data.userId}`,
                        paymentMethod: 'CASH',
                        treasuryId: data.treasuryId,
                        referenceId: empTx.id,
                        referenceType: 'SALARY_PAYMENT',
                    }
                });
            }

            return empTx;
        });

        revalidatePath(`/hr/employees/${data.userId}`);
        
        return { success: true, data: result };
    } catch (error: any) {
        console.error("Error paying salary:", error);
        return { success: false, error: error.message || "Internal Server Error" };
    }
}, { permission: PERMISSIONS.MANAGE_USERS, requireCSRF: false });

export const getAllTreasuries = secureAction(async () => {
    try {
        const treasuries = await db.treasury.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, balance: true }
        });
        return { success: true, data: treasuries };
    } catch (error) {
        return { success: false, error: "Failed to fetch treasuries" };
    }
}, { permission: PERMISSIONS.HR_VIEW_ATTENDANCE, requireCSRF: false });
