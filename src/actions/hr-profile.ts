'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { PERMISSIONS, hasPermission } from '@/lib/permissions'
import { Decimal } from 'decimal.js'
import { Ticket } from '@prisma/client'
import { unstable_noStore as noStore } from 'next/cache';

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
                date: { gte: startDate, lte: endDate }
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
                    createdAt: { gte: startDate, lte: endDate }
                },
                orderBy: { createdAt: 'desc' }
            })

            // Calculate Metrics from tickets
            tickets.forEach(t => {
                if (t.status === 'COMPLETED' || t.status === 'PAID_DELIVERED') {
                    totalCompleted++
                    maintenanceCommissions = maintenanceCommissions.plus(t.commissionAmount?.toString() || '0')
                }
                if (t.isWarrantyReturn) totalReturns++
                
                // Workflow Gaps: Tickets taking longer than expected duration (in hours)
                if (t.startedAt && t.completedAt && t.expectedDuration) {
                    const durationInMinutes = (t.completedAt.getTime() - t.startedAt.getTime()) / (1000 * 60)
                    if (durationInMinutes > t.expectedDuration * 60) totalDelayed++
                }
            })
        }

        // Fetch Financial Ledger Entries (Employee Transactions)
        const transactions = await prisma.employeeTransaction.findMany({
            where: {
                userId,
                createdAt: { gte: startDate, lte: endDate }
            },
            orderBy: { createdAt: 'desc' }
        })

        // Fetch Warranty Rework Losses (Clawbacks)
        const clawbacks = user.technician ? await prisma.ticket.findMany({
            where: {
                technicianId: user.technician.id,
                commissionClawback: { gt: 0 },
                updatedAt: { gte: startDate, lte: endDate }
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
        let baseSalary = new Decimal(user.salary?.toString() || '0')
        const hireDate = user.hireDate ? new Date(user.hireDate) : null

        // Prorate salary if hired in current month
        if (hireDate) {
            if (hireDate > endDate) {
                baseSalary = new Decimal(0);
            } else if (hireDate > startDate) {
                const daysInMonth = 30; 
                const startDay = hireDate.getDate();
                const daysWorked = Math.max(0, 31 - startDay);
                baseSalary = baseSalary.times(daysWorked).dividedBy(30);
            }
        }

        let totalBonuses = new Decimal(0)
        let totalDeductions = new Decimal(0)

        // Sum from attendance
        attendanceLogs.forEach(log => {
            totalBonuses = totalBonuses.plus(log.bonus.toString())
            
            const logDeduction = new Decimal(log.deduction.toString())
            if (log.status === 'ABSENT' && logDeduction.isZero()) {
                const dailyRate = baseSalary.dividedBy(30)
                totalDeductions = totalDeductions.plus(dailyRate)
            } else {
                totalDeductions = totalDeductions.plus(logDeduction)
            }
        })

        noStore();

        // Sum from transactions
        transactions.forEach((tx: any) => {
            if (tx.type === 'BONUS' || tx.type === 'ADDITION' || tx.type.endsWith('_REVERSAL')) {
                totalBonuses = totalBonuses.plus(tx.amount.toString())
            } else if (tx.type === 'DEDUCTION' || tx.type === 'PENALTY' || tx.type.endsWith('_DEDUCTION') || tx.type === 'SALARY_PAYMENT') {
                totalDeductions = totalDeductions.plus(tx.amount.toString())
            }
        })


        // Sum from clawbacks
        clawbacks.forEach(cb => {
            totalDeductions = totalDeductions.plus(cb.commissionClawback.toString())
        })

        // Add maintenance commissions to bonuses
        totalBonuses = totalBonuses.plus(maintenanceCommissions)

        const netAccrued = baseSalary.plus(totalBonuses).minus(totalDeductions)

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
                    baseSalary: baseSalary.toNumber(),
                    netAccrued: netAccrued.toNumber(),
                    totalDeductions: totalDeductions.toNumber(),
                    totalBonuses: totalBonuses.toNumber(), // Added
                    maintenanceCommissions: maintenanceCommissions.toNumber(), // Added
                    completedTickets: totalCompleted,
                    returnCount: totalReturns,
                    successRatio: Math.round(successRatio),
                    workflowGaps: totalDelayed
                }
            }
        }
    } catch (error: any) {
        console.error('Error fetching employee profile:', error)
        return { success: false, error: 'Internal Server Error' }
    }
}
