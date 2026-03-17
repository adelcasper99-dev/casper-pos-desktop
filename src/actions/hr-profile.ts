'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { PERMISSIONS, hasPermission } from '@/lib/permissions'
import { Decimal } from 'decimal.js'
import { Ticket } from '@prisma/client'
import { unstable_noStore as noStore } from 'next/cache';
import { calculateNetDue } from '@/lib/salary-utils';

export async function getEmployeeProfileData(userId: string, monthStr: string) {
    const session = await getSession()
    if (!session || (!hasPermission(session.user.permissions, PERMISSIONS.HR_VIEW_PAYROLL) && session.user.id !== userId)) {
        return { success: false, error: 'Unauthorized' }
    }

    try {
        const [year, month] = monthStr.split('-').map(Number)
        const startDate = new Date(year, month - 1, 1)
        const endDate = new Date(year, month, 0, 23, 59, 59)

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                technician: true,
                branch: true,
                role: true,
            }
        })

        if (!user) return { success: false, error: 'User not found' }

        // Fetch Attendance Logs
        const attendanceLogs = await prisma.dailyWorkLog.findMany({
            where: {
                userId,
                date: { 
                    gte: user.hireDate && new Date(user.hireDate) > startDate 
                         ? new Date(user.hireDate) 
                         : startDate, 
                    lte: endDate 
                }
            },
            orderBy: { date: 'asc' }
        })

        // Fetch Tickets (if technician)
        let tickets: Ticket[] = []
        let maintenanceCommissions = new Decimal(0)
        let totalCompleted = 0
        let totalReturns = 0
        let totalDelayed = 0

        if (user.technician) {
            tickets = await prisma.ticket.findMany({
                where: {
                    technicianId: user.technician.id,
                    createdAt: { 
                        gte: user.hireDate && new Date(user.hireDate) > startDate 
                             ? new Date(user.hireDate) 
                             : startDate, 
                        lte: endDate 
                    }
                },
                orderBy: { createdAt: 'desc' }
            })

            // Calculate Metrics from tickets
            tickets.forEach(t => {
                // Technically already filtered by query, but double check
                if (user.hireDate && t.createdAt < new Date(user.hireDate)) return;

                if (t.status === 'COMPLETED' || t.status === 'PAID_DELIVERED') {
                    totalCompleted++
                    maintenanceCommissions = maintenanceCommissions.plus(t.commissionAmount?.toString() || '0')
                }
                if (t.isWarrantyReturn || t.returnCount > 0) totalReturns++
                
                // Workflow Gaps: Tickets taking longer than expected duration
                // Includes active tickets that are already late
                if (t.startedAt && t.expectedDuration) {
                    const endTime = t.completedAt || new Date()
                    const durationInMinutes = (endTime.getTime() - t.startedAt.getTime()) / (1000 * 60)
                    if (durationInMinutes > t.expectedDuration * 60) totalDelayed++
                }
            })
        }

        const transactions = await prisma.employeeTransaction.findMany({
            where: {
                userId,
                createdAt: { 
                    gte: user.hireDate && new Date(user.hireDate) > startDate 
                         ? new Date(new Date(user.hireDate).setHours(0,0,0,0)) 
                         : startDate, 
                    lte: endDate 
                }
            },
            orderBy: { createdAt: 'desc' }
        })

        // Fetch Warranty Rework Losses (Clawbacks)
        const clawbacks = user.technician ? await prisma.ticket.findMany({
            where: {
                technicianId: user.technician.id,
                commissionClawback: { gt: 0 },
                updatedAt: { 
                    gte: user.hireDate && new Date(user.hireDate) > startDate 
                         ? new Date(new Date(user.hireDate).setHours(0,0,0,0)) 
                         : startDate, 
                    lte: endDate 
                }
            },
            select: {
                id: true,
                barcode: true,
                commissionClawback: true,
                updatedAt: true,
                returnReason: true,
                commissionAmount: true // To show original gain too
            }
        }) : []

        // KPI Calculations
        let { baseSalary, totalBonuses, totalDeductions, netDue: netAccrued } = await calculateNetDue({
            salary: user.salary,
            hireDate: user.hireDate,
            dailyLogs: attendanceLogs,
            employeeTransactions: transactions
        }, startDate, endDate);


        const hireDateStr = user.hireDate ? new Date(user.hireDate).toLocaleDateString('en-CA') : null;

        // Sum from clawbacks
        // (Clawbacks are already filtered by date in the query above)
        clawbacks.forEach(cb => {
            const cbDateStr = new Date(cb.updatedAt).toLocaleDateString('en-CA');
            if (hireDateStr && cbDateStr < hireDateStr) return;

            // Already handled by MAINTENANCE_COMMISSION_REVERSAL if recorded, 
            // but we add it if it's not yet in the transactions list
            if (!transactions.some(tx => tx.referenceId === cb.id && tx.type === 'MAINTENANCE_COMMISSION_REVERSAL')) {
                totalDeductions = totalDeductions.plus(cb.commissionClawback.toString())
            }
        })

        // Add maintenance commissions to bonuses ONLY if they aren't already in ledger
        // This handles legacy tickets before the automated linkage
        if (!transactions.some(tx => tx.type === 'MAINTENANCE_COMMISSION')) {
            totalBonuses = totalBonuses.plus(maintenanceCommissions)
        }

        // netAccrued is already calculated by salary-utils but we update it 
        // if legacy commissions or clawbacks were added above
        netAccrued = baseSalary.plus(totalBonuses).minus(totalDeductions);

        // Success Ratio logic
        const successRatio = totalCompleted > 0 
            ? Math.max(0, ((totalCompleted - totalReturns) / totalCompleted) * 100) 
            : 100

        return {
            success: true,
            data: {
                user: JSON.parse(JSON.stringify(user)),
                attendanceLogs: JSON.parse(JSON.stringify(attendanceLogs)),
                tickets: JSON.parse(JSON.stringify(tickets)),
                transactions: JSON.parse(JSON.stringify(transactions)),
                clawbacks: JSON.parse(JSON.stringify(clawbacks)),
                kpis: {
                    contractualSalary: user.salary ? Number(user.salary) : 0,
                    baseSalary: baseSalary.toNumber(),
                    netAccrued: netAccrued.toNumber(),
                    totalDeductions: totalDeductions.toNumber(),
                    totalBonuses: totalBonuses.toNumber(), // Added
                    maintenanceCommissions: maintenanceCommissions.toNumber(), // Added
                    completedTickets: totalCompleted,
                    returnCount: totalReturns,
                    successRatio: Math.round(successRatio * 100) / 100,
                    workflowGaps: totalDelayed
                }
            }
        }
    } catch (error: any) {
        console.error('Error fetching employee profile:', error)
        return { success: false, error: 'Internal Server Error' }
    }
}
