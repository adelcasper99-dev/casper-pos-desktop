'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { PERMISSIONS, hasPermission } from '@/lib/permissions'
import { Decimal } from 'decimal.js'
import { Ticket } from '@prisma/client'
import { unstable_noStore as noStore } from 'next/cache';
import { calculateNetDue } from '@/lib/salary-utils';
import { getTicketFinalPrice } from '@/lib/commission-validation';

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

                if (t.status === 'PAID_DELIVERED') {
                    totalCompleted++
                    let comm = Number(t.commissionAmount || 0);
                    if (comm === 0 && user.technician?.commissionRate) {
                        const transferVal = Number((t as any).techBillingPrice || t.partsCost || 0);
                        const netProfit = Number(t.repairPrice || 0) - transferVal;
                        if (netProfit > 0) {
                            comm = (netProfit * Number(user.technician.commissionRate)) / 100;
                            comm = Math.round(comm * 100) / 100;
                        }
                    }
                    maintenanceCommissions = maintenanceCommissions.plus(comm)
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
        const { baseSalary, totalBonuses, totalDeductions, netDue: netAccrued, kpis } = await calculateNetDue({
            salary: user.salary,
            hireDate: user.hireDate,
            dailyLogs: attendanceLogs,
            employeeTransactions: transactions,
            technician: user.technician ? {
                id: user.technician.id,
                commissionRate: user.technician.commissionRate,
                tickets: tickets
            } : undefined
        }, startDate, endDate);

        // Synthesize virtual ledger entries for tickets that haven't been "posted" to EmployeeTransaction yet
        // This ensures the "Detailed Ledger" in the UI is truly complete.
        const virtualEntries: any[] = [];
        if (user.technician) {
            tickets.forEach(t => {
                if (t.status === 'PAID_DELIVERED') {
                    const hasComm = transactions.some(tx => tx.referenceId === t.id && tx.type === 'MAINTENANCE_COMMISSION');
                    if (!hasComm) {
                        let comm = Number(t.commissionAmount || 0);
                        if (comm === 0 && user.technician?.commissionRate) {
                            const techBilling = Number((t as any).techBillingPrice || t.partsCost || 0);
                            const repairPrice = Number(t.repairPrice || 0);
                            const netProfit = repairPrice - techBilling;
                            if (netProfit > 0) {
                                comm = (netProfit * Number(user.technician.commissionRate)) / 100;
                                comm = Math.round(comm * 100) / 100;
                            }
                        }
                        if (comm > 0) {
                            virtualEntries.push({
                                id: `v-comm-${t.id}`,
                                type: 'MAINTENANCE_COMMISSION',
                                amount: comm,
                                description: `عمولة صيانة: ${t.barcode}`,
                                createdAt: t.completedAt || t.updatedAt,
                                isVirtual: true,
                                status: 'OPERATIONS',
                                referenceId: t.id,
                                referenceType: 'TICKET'
                            });
                        }
                    }
                }

                if (Number(t.commissionClawback || 0) > 0) {
                    const hasClaw = transactions.some(tx => tx.referenceId === t.id && tx.type === 'MAINTENANCE_COMMISSION_REVERSAL');
                    if (!hasClaw) {
                        virtualEntries.push({
                            id: `v-claw-${t.id}`,
                            type: 'MAINTENANCE_COMMISSION_REVERSAL',
                            amount: Number(t.commissionClawback),
                            description: `خصم مرتجع صيانة: ${t.barcode}`,
                            createdAt: t.updatedAt,
                            isVirtual: true,
                            status: 'OPERATIONS',
                            referenceId: t.id,
                            referenceType: 'TICKET'
                        });
                    }
                }
            });
        }

        return {
            success: true,
            data: {
                user: JSON.parse(JSON.stringify(user)),
                attendanceLogs: JSON.parse(JSON.stringify(attendanceLogs)),
                tickets: JSON.parse(JSON.stringify(tickets.map(t => {
                    const clawbackVal = new Decimal(t.commissionClawback || 0);
                    const isLoss = t.status === 'RETURNED' || t.status === 'VOIDED' || t.isWarrantyReturn || clawbackVal.greaterThan(0);
                    const isEligible = t.status === 'PAID_DELIVERED';
                    
                    let commission = Math.abs(new Decimal(t.commissionAmount || 0).toNumber());
                    if (commission === 0 && user.technician?.commissionRate) {
                        const currentTransferVal = Number((t as any).techBillingPrice || t.partsCost || 0);
                        const netProfit = Number(t.repairPrice || 0) - currentTransferVal;
                        if (netProfit > 0) {
                            commission = (netProfit * Number(user.technician.commissionRate)) / 100;
                            commission = Math.round(commission * 100) / 100;
                        }
                    }

                    const finalPrice = getTicketFinalPrice(t as any);
                    const transferVal = Number((t as any).techBillingPrice || t.partsCost || 0);
                    const laborAmount = (isEligible || isLoss) ? (finalPrice - transferVal) : 0;

                    return {
                        ...t,
                        totalAmount: (isEligible || isLoss) ? finalPrice : 0,
                        laborAmount: laborAmount,
                        displayCommission: isLoss 
                            ? -Math.abs(clawbackVal.toNumber() || commission)
                            : (isEligible ? commission : 0)
                    }
                }))),
                transactions: JSON.parse(JSON.stringify([...transactions, ...virtualEntries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))),
                clawbacks: JSON.parse(JSON.stringify(clawbacks)),
                kpis: {
                    ...kpis,
                    contractualSalary: user.salary ? Number(user.salary) : 0,
                    baseSalary: baseSalary.toNumber(),
                    netAccrued: netAccrued.toNumber(),
                    totalDeductions: totalDeductions.toNumber(),
                    totalBonuses: totalBonuses.toNumber(),
                    workflowGaps: kpis.delayedTickets
                }
            }
        }
    } catch (error: any) {
        console.error('Error fetching employee profile:', error)
        return { success: false, error: 'Internal Server Error' }
    }
}
