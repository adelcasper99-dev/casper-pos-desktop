"use server";

import { prisma } from "@/lib/prisma"
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { startOfMonth, endOfMonth, differenceInDays } from "date-fns";
import { Decimal } from "decimal.js";
import { calculatePayroll } from "@/lib/payroll-math";

const db = prisma as any;

/**
 * Shared logic for calculating net salary for an employee in a target month.
 */
async function calculateNetDue(u: any, startDate: Date, endDate: Date) {
    const totalDaysInMonth = differenceInDays(endDate, startDate) + 1;
    let daysHiredInMonth = totalDaysInMonth;
    
    // Prorate if hired in current month
    if (u.hireDate) {
        const hireDate = new Date(u.hireDate);
        if (hireDate > endDate) {
            daysHiredInMonth = 0;
        } else if (hireDate > startDate) {
            daysHiredInMonth = differenceInDays(endDate, hireDate) + 1;
        }
    }

    const monthlyOffDays = u.monthlyOffDays ?? 4;
    // Scalar proration of off-days if not hired for full month
    const effectiveOffDays = (daysHiredInMonth / totalDaysInMonth) * monthlyOffDays;
    const workingDays = Math.max(0, daysHiredInMonth - effectiveOffDays);

    const employeeInput = {
        id: u.id,
        name: u.name || u.username,
        role: u.role?.name || "Staff",
        salary: Number(u.salary || 0),
        absentDays: u.dailyLogs?.filter((l: any) => l.status === 'ABSENT').length || 0,
        lateMinutes: 0, // Not tracked in basic logs yet
        offDays: u.dailyLogs?.filter((l: any) => l.status === 'OFF').length || 0,
        extraOffDays: 0, // Derived
        leaveDays: u.dailyLogs?.filter((l: any) => l.status === 'LEAVE').length || 0,
        overtimeHours: 0,
        bonus: 0,
        deduct: 0,
        manualDeduction: u.dailyLogs?.reduce((sum: number, l: any) => sum + Number(l.deduction || 0), 0) || 0,
        manualBonus: u.dailyLogs?.reduce((sum: number, l: any) => sum + Number(l.bonus || 0), 0) || 0,
    };

    // 2. Call centralized payroll engine (Unification B23)
    // We pass empty rules for now as they aren't in DB, but the engine handles base math
    const payroll = calculatePayroll(
        employeeInput as any,
        employeeInput.salary,
        workingDays,
        8, // Default 8 hours
        [] // No dynamic rules yet
    );

    let totalPaid = new Decimal(0);
    let totalOtherAdditions = new Decimal(0);
    let totalOtherDeductions = new Decimal(0);

    // 3. Aggregate Transactions (Payments vs Adjustments)
    u.employeeTransactions?.forEach((tx: any) => {
        const amt = new Decimal(tx.amount.toString());
        if (tx.type === 'SALARY_PAYMENT') {
            totalPaid = totalPaid.plus(amt);
        } else if (tx.type === 'BONUS' || tx.type === 'ADDITION' || tx.type.endsWith('_REVERSAL')) {
            totalOtherAdditions = totalOtherAdditions.plus(amt);
        } else if (tx.type === 'DEDUCTION' || tx.type === 'PENALTY' || tx.type.endsWith('_DEDUCTION')) {
            totalOtherDeductions = totalOtherDeductions.plus(amt);
        }
    });

    const netSalaryCalculated = new Decimal(payroll.finalSalary);

    return {
        baseSalary: new Decimal(payroll.baseSalary),
        totalBonuses: new Decimal(payroll.totalAdditions).plus(totalOtherAdditions),
        totalDeductions: new Decimal(payroll.totalDeductions).plus(totalOtherDeductions),
        totalPaid,
        netDue: netSalaryCalculated.plus(totalOtherAdditions).minus(totalOtherDeductions).minus(totalPaid)
    };
}

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
                where: { date: { gte: startDate, lte: endDate } }
            },
            employeeTransactions: {
                where: { createdAt: { gte: startDate, lte: endDate } }
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

        const result = await (prisma as any).$transaction(async (tx: any) => {
            // 1. Create Employee Transaction (Ledger)
            const empTx = await tx.employeeTransaction.create({
                data: {
                    userId: data.userId,
                    type: 'SALARY_PAYMENT',
                    amount: data.amount,
                    description: data.notes || `سداد راتب عبر ${data.paymentMethod}`,
                    branchId: session.user.branchId ?? null
                } as any
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
                    { accountCode: '2200', debit: data.amount, credit: 0, description: `تخفيض مستحقات الرواتب للموظف ID: ${data.userId}` },
                    { accountCode: creditAccount, debit: 0, credit: data.amount, description: `وسيلة الدفع: ${data.paymentMethod}` }
                ]
            }, tx);

            // 3. Update Treasury if CASH
            if (data.paymentMethod === 'CASH' && data.treasuryId) {
                const treasury = await tx.treasury.findUnique({ where: { id: data.treasuryId } });
                if (!treasury) throw new Error("Treasury not found");
                if (Number(treasury.balance) < data.amount) throw new Error("Insufficient treasury balance");

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

/**
 * Accrual Step (B24): Recognize Salary Expense and build Liability.
 * Posts DR 5100 (Salaries) / CR 2200 (Accrued Salaries).
 */
export const accrueMonthSalary = secureAction(async (data: { month: number; year: number }) => {
    const session = await getSession();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const isAdmin = ["ADMIN", "مدير النظام", "المالك"].includes(session.user.role || "");
    if (!isAdmin) return { success: false, error: "Forbidden: Admin access required" };

    const startDate = startOfMonth(new Date(data.year, data.month));
    const endDate = endOfMonth(startDate);
    const monthKey = `${data.year}-${(data.month + 1).toString().padStart(2, '0')}`;

    try {
        const result = await (prisma as any).$transaction(async (tx: any) => {
            // Check if already accrued
            const existing = await tx.journalEntry.findFirst({
                where: { reference: `PAYROLL-ACCRUAL-${monthKey}` }
            });

            if (existing) {
                throw new Error(`تم إثبات استحقاق الرواتب لشهر ${monthKey} بالفعل.`);
            }

            // 1. Calculate totals for ALL active employees
            const activeUsers = await tx.user.findMany({
                where: { deletedAt: null, isFrozen: false },
                include: {
                    role: true,
                    dailyLogs: { where: { date: { gte: startDate, lte: endDate } } },
                    employeeTransactions: { where: { createdAt: { gte: startDate, lte: endDate } } }
                }
            });

            let totalExpense = new Decimal(0);

            for (const u of activeUsers) {
                // We use calculateNetDue but ignoring payments for "Expense Accrual"
                // Actually, the expense is Base + Additions - Manual Penalties (not payments)
                const { baseSalary, totalBonuses, totalDeductions, totalPaid } = await calculateNetDue(u, startDate, endDate);
                
                // Gross Expense = Base + Bonuses - Penalties (not counting payments)
                const netExpense = baseSalary.plus(totalBonuses).minus(totalDeductions.minus(totalPaid));
                totalExpense = totalExpense.plus(netExpense);
            }

            if (totalExpense.lte(0)) throw new Error("لا يوجد مصروفات رواتب مستحقة لهذا الشهر.");

            // 2. Post Journal Entry
            const { AccountingEngine } = await import("@/lib/accounting/transaction-factory");
            await AccountingEngine.recordTransaction({
                description: `استحقاق رواتب شهر ${monthKey}`,
                reference: `PAYROLL-ACCRUAL-${monthKey}`,
                branchId: session.user.branchId ?? undefined,
                lines: [
                    { accountCode: '5100', debit: totalExpense.toNumber(), credit: 0, description: `إجمالي مصروفات الرواتب والأجور - شهر ${monthKey}` },
                    { accountCode: '2200', debit: 0, credit: totalExpense.toNumber(), description: `مستحقات رواتب وأجور موظفين (خصوم متداولة)` }
                ]
            }, tx);

            // 3. Mark transactions in this period as "Accrued" if needed
            // For now, the reference check is enough.

            return { totalAccrued: totalExpense.toNumber() };
        });

        revalidatePath("/(routes)/hr");
        return { success: true, data: result };
    } catch (error: any) {
        console.error("Error accruing salary:", error);
        return { success: false, error: error.message || "Internal Server Error" };
    }
}, { permission: PERMISSIONS.MANAGE_USERS, requireCSRF: false });
