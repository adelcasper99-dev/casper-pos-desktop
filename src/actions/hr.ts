"use server";

import { prisma } from "@/lib/prisma"
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { startOfMonth, endOfMonth } from "date-fns";
import { financialRepo } from "@/lib/repositories/financial-repo";

const db = prisma as any;
import { Decimal } from '@prisma/client/runtime/library';
import { calculateNetDue, calculateProratedBase, getCategoryClassification } from "@/lib/salary-utils";

export const getStaffDirectory = secureAction(async (data?: { month?: number; year?: number }) => {
    const now = new Date();
    const month = data?.month ?? now.getMonth();
    const year = data?.year ?? now.getFullYear();
    const startDate = startOfMonth(new Date(year, month));
    const endDate = endOfMonth(new Date(year, month));

    noStore();

    const users = await db.user.findMany({
        where: { deletedAt: null },
        take: 500, // Safety limit for staff directory
        include: {
            role: true,
            branch: true,
            technician: {
                include: {
                    tickets: {
                        where: {
                            createdAt: { gte: startDate, lte: endDate }
                        }
                    }
                }
            },
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
        const { baseSalary, netDue, kpis } = await calculateNetDue(u, startDate, endDate);

        return {
            id: u.id,
            name: u.name || u.username,
            username: u.username,
            role: u.role?.name || "Staff",
            branch: u.branch?.name || "Main",
            salary: u.salary ? Number(u.salary) : 0,
            effectiveSalary: baseSalary.toNumber(),
            netDue: netDue.toNumber(),
            kpis: kpis,
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

    const hasAccess = hasPermission(session.user.permissions, PERMISSIONS.HR_VIEW_ATTENDANCE);
    if (!hasAccess) throw new Error("Forbidden");

    const users = await db.user.findMany({
        where: { deletedAt: null },
        include: { role: true },
        orderBy: { name: 'asc' },
        take: 500 // Safety limit
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

    const canManageUsers = hasPermission(session.user.permissions as string[], PERMISSIONS.MANAGE_USERS);

    if (!canManageUsers) {
        return { success: false, error: "Forbidden" };
    }

    if (!data.hireDate) {
        // Just log a warning or let it pass if it's not provided, but don't error out entirely
        // if we are just updating other fields. We will omit it from updateData.
    }

    try {
        const updateData: any = {
            name: data.name,
            roleId: (data.roleId && data.roleId !== "") ? data.roleId : null,
            branchId: (data.branchId && data.branchId !== "") ? data.branchId : null,
            salary: typeof data.salary === 'number' && !isNaN(data.salary) ? data.salary : undefined,
            monthlyOffDays: typeof data.monthlyOffDays === 'number' && !isNaN(data.monthlyOffDays) ? data.monthlyOffDays : undefined,
            hireDate: data.hireDate === null ? null : (data.hireDate && data.hireDate !== "") ? new Date(data.hireDate) : undefined,
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

    const canManageUsers = hasPermission(session.user.permissions, PERMISSIONS.MANAGE_USERS);

    if (!canManageUsers) {
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

    const { Decimal } = await import("decimal.js");

    // 🚀 PHASE 1: Optimized Bulk Aggregation (Scales to 10k+ users)
    
    // 1. Fetch all active users with minimal schema footprint
    const users = await db.user.findMany({
        where: { deletedAt: null, isFrozen: false },
        select: { 
            id: true, 
            salary: true, 
            hireDate: true, 
            technician: { 
                select: { id: true, commissionRate: true, lossRate: true } 
            } 
        }
    });

    // 2. Bulk fetch Attendance Sums
    const logAggs = await db.dailyWorkLog.groupBy({
        by: ['userId'],
        where: { date: { gte: start, lte: end } },
        _sum: { bonus: true, deduction: true }
    });

    // 2b. Bulk fetch Absent Counts (for daily rate deduction if deduction=0)
    const absentAggs = await db.dailyWorkLog.groupBy({
        by: ['userId'],
        where: { status: 'ABSENT', deduction: 0, date: { gte: start, lte: end } },
        _count: { userId: true }
    });
    const absentMap = new Map(absentAggs.map((a: { userId: string, _count: { userId: number } }) => [a.userId, a._count.userId]));

    // 3. Bulk fetch Ledger Transactions (Needed for categorization & deduplication)
    const allTransactions = await db.employeeTransaction.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { userId: true, type: true, amount: true, referenceId: true }
    });

    // 4. Bulk fetch Tickets (Needed for virtual commissions & KPIs)
    const allTickets = await db.ticket.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { 
            technicianId: true, 
            id: true, 
            status: true, 
            commissionAmount: true, 
            commissionClawback: true, 
            excessLossAmount: true, 
            lossResponsibility: true 
        }
    });

    interface DashboardTx { userId: string; type: string; amount: Decimal | number | string; referenceId: string | null; }
    interface DashboardTicket { technicianId: string | null; id: string; status: string; commissionAmount: Decimal | number | string; commissionClawback: Decimal | number | string; excessLossAmount: Decimal | number | string; lossResponsibility: any; }

    // 5. Build Aggregation Maps for O(1) Lookup
    const logMap = new Map(logAggs.map((l: { userId: string, _sum: { bonus: Decimal | number | null, deduction: Decimal | number | null } }) => [l.userId, l]));
    const txMap = new Map<string, DashboardTx[]>();
    allTransactions.forEach((tx: DashboardTx) => {
        if (!txMap.has(tx.userId)) txMap.set(tx.userId, []);
        txMap.get(tx.userId)!.push(tx);
    });
    const ticketMap = new Map<string, DashboardTicket[]>();
    allTickets.forEach((t: DashboardTicket) => {
        if (t.technicianId) {
            if (!ticketMap.has(t.technicianId)) ticketMap.set(t.technicianId, []);
            ticketMap.get(t.technicianId)!.push(t);
        }
    });

    let totalNetDue = new Decimal(0);
    const lastDay = end.getDate();

    // 6. Final Summation (Replaces N+1 loop)
    for (const u of users) {
        let userBonuses = new Decimal(0);
        let userDeductions = new Decimal(0);

        // A. Prorated Base
        const baseSalary = calculateProratedBase(u.salary || 0, u.hireDate, start, end, 'projected');
        const dailyRate = new Decimal(u.salary?.toString() || 0).dividedBy(lastDay);

        // B. Attendance (Logs)
        const logs = logMap.get(u.id) as { _sum: { bonus: Decimal | number | null, deduction: Decimal | number | null } } | undefined;
        if (logs) {
            userBonuses = userBonuses.plus(logs._sum.bonus?.toString() || 0);
            userDeductions = userDeductions.plus(logs._sum.deduction?.toString() || 0);
            
            // Note: If someone is ABSENT and deduction is 0, we'd normally deduct dailyRate.
            const absentCount = (absentMap.get(u.id) as number) || 0;
            if (absentCount > 0) {
                userDeductions = userDeductions.plus(dailyRate.times(absentCount));
            }
        }

        // C. Ledger Transactions
        const txs = (txMap.get(u.id) || []) as DashboardTx[];
        txs.forEach((tx: DashboardTx) => {
            const { isAddition, isDeduction, isReversal } = getCategoryClassification(tx.type);
            const amt = new Decimal(tx.amount?.toString() || 0);
            if (isAddition) userBonuses = userBonuses.plus(amt);
            else if (isDeduction) userDeductions = userDeductions.plus(amt.abs());
            else if (isReversal) {
                if (tx.type === 'MAINTENANCE_COMMISSION_REVERSAL' || tx.type === 'BONUS_REVERSAL') {
                    userDeductions = userDeductions.plus(amt.abs());
                } else {
                    userBonuses = userBonuses.plus(amt.abs());
                }
            }
        });

        // D. Technician Logic (Virtual Commissions)
        if (u.technician) {
            const tickets = ticketMap.get(u.technician.id) || [];
            
            // Unposted Commissions
            tickets.forEach((t: DashboardTicket) => {
                if (t.status !== 'PAID_DELIVERED') return;
                const isPosted = txs.some((tx: DashboardTx) => tx.type === 'MAINTENANCE_COMMISSION' && tx.referenceId === t.id);
                if (!isPosted) {
                    userBonuses = userBonuses.plus(t.commissionAmount?.toString() || 0);
                }
            });

            // Unposted Clawbacks/Losses
            tickets.forEach((t: DashboardTicket) => {
                const clawback = new Decimal(t.commissionClawback?.toString() || 0);
                const excessLoss = new Decimal(t.excessLossAmount?.toString() || 0);
                const hasClawbackInLedger = txs.some((tx: DashboardTx) => 
                    (tx.type === 'MAINTENANCE_COMMISSION_REVERSAL' && tx.referenceId === t.id) ||
                    (tx.type === 'MAINTENANCE_COMMISSION' && tx.referenceId === t.id && Number(tx.amount) < 0)
                );

                if (!hasClawbackInLedger && (clawback.gt(0) || excessLoss.gt(0))) {
                    let ded = clawback;
                    if (t.lossResponsibility === 'TECH') ded = ded.plus(excessLoss);
                    else if (t.lossResponsibility === 'SPLIT') {
                        const rate = new Decimal(u.technician!.lossRate?.toString() || 70).dividedBy(100);
                        ded = ded.plus(excessLoss.times(rate));
                    }
                    userDeductions = userDeductions.plus(ded);
                }
            });
        }

        totalNetDue = totalNetDue.plus(baseSalary).plus(userBonuses).minus(userDeductions);
    }

    // 2. Total Absences this month
    const totalAbsences = await db.dailyWorkLog.count({
        where: {
            status: 'ABSENT',
            date: { gte: start, lte: end }
        }
    });

    // 3. Net Employee Credit Sales this month (Re-using transactions already fetched in memory)
    let creditSales = new Decimal(0);
    (allTransactions as DashboardTx[]).forEach((t: DashboardTx) => {
        const amt = new Decimal(t.amount?.toString() || 0);
        if (['SALES_DEDUCTION', 'MAINTENANCE_DEDUCTION'].includes(t.type)) {
            creditSales = creditSales.plus(amt);
        } else if (['SALES_DEDUCTION_REVERSAL', 'MAINTENANCE_DEDUCTION_REVERSAL'].includes(t.type)) {
            creditSales = creditSales.minus(amt);
        }
    });

    return {
        data: {
            expectedSalaries: totalNetDue.toDecimalPlaces(2).toNumber(),
            totalAbsences,
            employeeCreditSales: creditSales.toDecimalPlaces(2).toNumber()
        }
    };
}, { permission: PERMISSIONS.HR_VIEW_ATTENDANCE, requireCSRF: false });

export const payEmployeeSalary = secureAction(async (data: {
    userId: string;
    amount: number;
    paymentMethod: string;
    notes?: string;
    treasuryId?: string;
    monthStr?: string;
}) => {
    const session = await getSession();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const canPaySalary = hasPermission(session.user.permissions, PERMISSIONS.HR_MANAGE_PAYROLL);
    if (!canPaySalary) return { success: false, error: "Forbidden: HR Payroll permission required" };

    try {
        // H-01: Strict Financial Validation
        const { Decimal } = await import("decimal.js");
        const now = new Date();
        const start = data.monthStr ? new Date(data.monthStr + '-01') : startOfMonth(now);
        const end = data.monthStr ? endOfMonth(new Date(data.monthStr + '-01')) : endOfMonth(now);

        const targetUser = await db.user.findUnique({
            where: { id: data.userId },
            include: {
                dailyLogs: { where: { date: { gte: start, lte: end } } },
                employeeTransactions: { where: { createdAt: { gte: start, lte: end } } },
                technician: {
                    include: {
                        tickets: { where: { createdAt: { gte: start, lte: end } } }
                    }
                }
            }
        });

        if (!targetUser) return { success: false, error: "Target employee not found" };

        const { netDue } = await calculateNetDue(targetUser, start, end);
        const amountDec = new Decimal(data.amount);
        
        // H-01: Applied strict block for overpayment (previously bypassed by isAdmin)
        if (amountDec.gt(netDue)) {
            return { 
                success: false, 
                error: `عفواً، المبلغ المدخل (${data.amount}) يتجاوز المستحق للموظف (${netDue.toNumber()}). يرجى مراجعة الإدارة.` 
            };
        }

        if (!data.treasuryId) {
            return { success: false, error: "الخزينة أو الحساب المصرفي مطلوب لجميع طرق الدفع" };
        }

        const { logger } = await import('@/lib/logger');
        logger.info(`[HR] Manual Salary Payment: User ${data.userId} paid ${data.amount} via ${data.paymentMethod} (NetDue: ${netDue.toNumber()})`);

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

            // 3. Update Treasury for all payment methods (not just CASH)
            // Fix B: treasury deduction should apply regardless of method
            if (data.treasuryId) {
                const treasury = await tx.treasury.findUnique({ where: { id: data.treasuryId } });
                if (!treasury) throw new Error("Treasury not found");
                
                const balanceDec = new Decimal(treasury.balance.toString());
                if (balanceDec.lt(amountDec)) {
                    const canGoNegative = hasPermission(session.user.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
                    if (!canGoNegative) {
                        throw new Error("Insufficient treasury balance");
                    }
                }

                await tx.treasury.update({
                    where: { id: data.treasuryId },
                    data: { balance: { decrement: data.amount } }
                });

                await (tx as any).transaction.create({
                    data: {
                        type: 'EXPENSE',
                        amount: data.amount,
                        description: `سداد راتب: ${data.userId}`,
                        paymentMethod: data.paymentMethod,
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
