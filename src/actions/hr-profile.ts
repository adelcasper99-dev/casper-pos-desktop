'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { PERMISSIONS, hasPermission } from '@/lib/permissions'
import { Decimal } from 'decimal.js'
import { Ticket } from '@prisma/client'
import { unstable_noStore as noStore } from 'next/cache';
import { calculateNetDue } from '@/lib/salary-utils';
import { getTicketFinalPrice, resolveCommission } from '@/lib/commission-validation';

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
                technician: {
                    include: {
                        commissionRule: true
                    }
                },
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
                if ((t.status === 'PAID_DELIVERED' || t.status === 'DELIVERED') && t.paymentStatus?.toLowerCase() === 'paid') {
                    const hasComm = transactions.some(tx => tx.referenceId === t.id && tx.type === 'MAINTENANCE_COMMISSION');
                    if (!hasComm) {
                        let comm = new Decimal(t.commissionAmount?.toString() || 0);
                        if (comm.isZero()) {
                            const techBilling = new Decimal((t as any).techBillingPrice?.toString() || t.partsCost?.toString() || 0);
                            const repairPrice = new Decimal(t.repairPrice?.toString() || 0);
                            const netProfit = repairPrice.minus(techBilling);
                            if (netProfit.gt(0) && user.technician) {
                                const resolved = resolveCommission(user.technician, netProfit);
                                comm = resolved.commissionAmount;
                            }
                        }
                        if (comm.gt(0)) {
                            virtualEntries.push({
                                id: `v-comm-${t.id}`,
                                type: 'MAINTENANCE_COMMISSION',
                                amount: comm.toNumber(),
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

                const clawbackVal = new Decimal(t.commissionClawback?.toString() || 0);
                const excessLoss = new Decimal((t as any).excessLossAmount?.toString() || 0);

                if (clawbackVal.gt(0) || excessLoss.gt(0)) {
                    const hasClaw = transactions.some(tx => 
                        tx.referenceId === t.id && 
                        (tx.type === 'MAINTENANCE_COMMISSION_REVERSAL' || (tx.type === 'MAINTENANCE_COMMISSION' && Number(tx.amount) < 0))
                    );
                    
                    if (!hasClaw) {
                        let totalClawDeduction = clawbackVal;
                        
                        if ((t as any).lossResponsibility === 'TECH') {
                            totalClawDeduction = totalClawDeduction.plus(excessLoss);
                        } else if ((t as any).lossResponsibility === 'SPLIT') {
                            const techLossRate = new Decimal(user.technician?.lossRate?.toString() || 70).dividedBy(100);
                            totalClawDeduction = totalClawDeduction.plus(excessLoss.times(techLossRate));
                        }

                        if (totalClawDeduction.gt(0)) {
                            virtualEntries.push({
                                id: `v-claw-${t.id}`,
                                type: 'MAINTENANCE_COMMISSION_REVERSAL',
                                amount: totalClawDeduction.toNumber(),
                                description: `خصم مرتجع وخسائر صيانة: ${t.barcode}`,
                                createdAt: t.updatedAt,
                                isVirtual: true,
                                status: 'OPERATIONS',
                                referenceId: t.id,
                                referenceType: 'TICKET'
                            });
                        }
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
                    const isEligible = t.status === 'PAID_DELIVERED' || t.status === 'DELIVERED';
                    const isPendingCredit = t.paymentStatus?.toLowerCase() !== 'paid';
                    
                    let commission = new Decimal(t.commissionAmount?.toString() || 0).abs();
                    if (commission.isZero()) {
                        const currentTransferVal = new Decimal((t as any).techBillingPrice?.toString() || t.partsCost?.toString() || 0);
                        const netProfit = new Decimal(t.repairPrice?.toString() || 0).minus(currentTransferVal);
                        if (netProfit.gt(0) && user.technician) {
                            const resolved = resolveCommission(user.technician, netProfit);
                            commission = resolved.commissionAmount;
                        }
                    }

                    const finalPrice = getTicketFinalPrice(t as any);
                    const transferVal = new Decimal((t as any).techBillingPrice?.toString() || t.partsCost?.toString() || 0);
                    const laborAmount = (isEligible || isLoss) ? finalPrice.minus(transferVal).toNumber() : 0;

                    // 💎 Separate Accounting: Show historical intended profit here.
                    // Losses and reversals will appear in the "Transactions" ledger.
                    return {
                        ...t,
                        totalAmount: finalPrice.toNumber(),
                        laborAmount: laborAmount,
                        displayCommission: commission.toNumber(),
                        isPendingCredit: isPendingCredit
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
