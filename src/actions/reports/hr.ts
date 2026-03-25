'use server';

import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface HRReportFilters {
    startDate?: string;
    endDate?: string;
    branchId?: string;
}

export async function getHRReport(filters: HRReportFilters): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const now = new Date();
        const defaultStart = startOfMonth(subMonths(now, 1));
        const defaultEnd = endOfMonth(now);

        const startDate = filters?.startDate ? new Date(filters.startDate) : defaultStart;
        const endDate = filters?.endDate ? new Date(filters.endDate) : defaultEnd;

        const branchFilter = filters?.branchId ? { branchId: filters.branchId } : {};

        // Get all employees
        const employees = await prisma.user.findMany({
            where: {
                ...branchFilter,
                deletedAt: null,
                roleStr: { not: 'Admin' }
            },
            include: {
                branch: true,
                role: true,
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
            }
        });

        // Calculate KPIs per employee
        const employeeStats = employees.map((emp: any) => {
            const logs = emp.dailyLogs || [];

            // Calculate attendance
            const presentDays = logs.filter((l: any) => l.status === 'PRESENT').length;
            const absentDays = logs.filter((l: any) => l.status === 'ABSENT').length;
            const lateDays = logs.filter((l: any) => l.status === 'LATE').length;

            // Calculate work hours
            const totalHours = logs.reduce((sum: number, l: any) => sum + Number(l.totalHours || 0), 0);

            // Calculate financial transactions (bonuses/deductions)
            const transactions = emp.employeeTransactions || [];
            const totalBonus = transactions
                .filter((t: any) => t.type === 'BONUS' || t.type === 'SALARY_ADJUSTMENT')
                .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
            const totalDeduction = transactions
                .filter((t: any) => t.type === 'DEDUCTION')
                .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

            return {
                id: emp.id,
                name: emp.name || emp.username,
                username: emp.username,
                branch: emp.branch?.name || 'غير محدد',
                role: emp.role?.name || emp.roleStr,
                phone: emp.phone,
                salary: Number(emp.salary || 0),
                presentDays,
                absentDays,
                lateDays,
                totalHours,
                totalBonus,
                totalDeduction,
                netSalary: Number(emp.salary || 0) + totalBonus - totalDeduction
            };
        });

        // Calculate branch summary
        const branchSummary: any = {};
        employeeStats.forEach((emp: any) => {
            if (!branchSummary[emp.branch]) {
                branchSummary[emp.branch] = {
                    branchName: emp.branch,
                    employeeCount: 0,
                    totalPresent: 0,
                    totalAbsent: 0,
                    totalSalary: 0
                };
            }
            branchSummary[emp.branch].employeeCount++;
            branchSummary[emp.branch].totalPresent += emp.presentDays;
            branchSummary[emp.branch].totalAbsent += emp.absentDays;
            branchSummary[emp.branch].totalSalary += emp.netSalary;
        });

        // Overall KPIs
        const totalEmployees = employees.length;
        const totalPresent = employeeStats.reduce((sum: number, e: any) => sum + e.presentDays, 0);
        const totalAbsent = employeeStats.reduce((sum: number, e: any) => sum + e.absentDays, 0);
        const totalSalaries = employeeStats.reduce((sum: number, e: any) => sum + e.netSalary, 0);
        const totalBonuses = employeeStats.reduce((sum: number, e: any) => sum + e.totalBonus, 0);
        const totalDeductions = employeeStats.reduce((sum: number, e: any) => sum + e.totalDeduction, 0);

        return {
            success: true,
            data: {
                period: {
                    start: startDate.toISOString(),
                    end: endDate.toISOString()
                },
                summary: {
                    totalEmployees,
                    totalPresent,
                    totalAbsent,
                    totalSalaries,
                    totalBonuses,
                    totalDeductions,
                    attendanceRate: totalEmployees > 0 ? ((totalPresent / (totalPresent + totalAbsent)) * 100).toFixed(1) : 0
                },
                employees: employeeStats,
                branchSummary: Object.values(branchSummary)
            }
        };
    } catch (error: any) {
        console.error('[getHRReport] Error:', error);
        return { success: false, error: error.message };
    }
}

export async function getBranchesForHR(): Promise<{ success: boolean; branches: any[] }> {
    try {
        const branches = await prisma.branch.findMany({
            orderBy: { name: 'asc' }
        });
        return { success: true, branches };
    } catch (error: any) {
        console.error('[getBranchesForHR] Error:', error);
        return { success: false, branches: [] };
    }
}
