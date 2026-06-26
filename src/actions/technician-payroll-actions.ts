"use server"

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";

// Types
export interface TechPayrollSummary {
    technicianId: string;
    technicianName: string;
    ticketsCount: number;
    totalRevenue: number;
    totalPartsCost: number;
    netServiceMargin: number;
    commissionEarned: number;
    debtCarryover: number;
    basicSalary: number;
    totalPayable: number;
}

export async function getTechniciansPayrollSummary({
    startDate,
    endDate
}: {
    startDate: string | Date;
    endDate: string | Date;
}): Promise<{ success: boolean; data?: TechPayrollSummary[]; error?: string }> {
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        // Ensure end of day for end date
        end.setHours(23, 59, 59, 999);

        // Fetch unsettled PAID tickets
        const tickets = await prisma.ticket.findMany({
            where: {
                status: { in: ['PAID', 'PAID_DELIVERED', 'DELIVERED'] },
                isTechCommissionSettled: false,
                completedAt: {
                    gte: start,
                    lte: end
                },
                technicianId: {
                    not: null
                }
            },
            include: {
                technician: {
                    include: {
                        user: true
                    }
                }
            }
        });

        const techMap = new Map<string, TechPayrollSummary>();

        for (const ticket of tickets) {
            if (!ticket.technicianId || !ticket.technician) continue;

            const techId = ticket.technicianId;
            const techName = ticket.technician.name || "Unknown Technician";
            const basicSalary = Number(ticket.technician.user?.salary || 0);

            if (!techMap.has(techId)) {
                techMap.set(techId, {
                    technicianId: techId,
                    technicianName: techName,
                    ticketsCount: 0,
                    totalRevenue: 0,
                    totalPartsCost: 0,
                    netServiceMargin: 0,
                    commissionEarned: 0,
                    debtCarryover: 0,
                    basicSalary: basicSalary,
                    totalPayable: 0
                });
            }

            const summary = techMap.get(techId)!;

            // Calculations using Decimal to avoid floating point errors
            const revenue = new Decimal(ticket.finalCustomerPrice?.toString() || ticket.amountPaid?.toString() || 0);
            const partsCost = new Decimal(ticket.partsCost?.toString() || 0);
            const margin = revenue.minus(partsCost);
            const commission = new Decimal(ticket.techCommissionAmount?.toString() || 0);

            summary.ticketsCount += 1;
            summary.totalRevenue = new Decimal(summary.totalRevenue).plus(revenue).toDecimalPlaces(2).toNumber();
            summary.totalPartsCost = new Decimal(summary.totalPartsCost).plus(partsCost).toDecimalPlaces(2).toNumber();
            summary.netServiceMargin = new Decimal(summary.netServiceMargin).plus(margin).toDecimalPlaces(2).toNumber();
            summary.commissionEarned = new Decimal(summary.commissionEarned).plus(commission).toDecimalPlaces(2).toNumber();
        }

        // Fetch Debt Carryover (LOSS_DEDUCTION transactions)
        const userIds = Array.from(techMap.values()).map(t => {
            const ticket = tickets.find(tk => tk.technicianId === t.technicianId);
            return ticket?.technician?.userId;
        }).filter(Boolean) as string[];

        const lossTransactions = await prisma.employeeTransaction.findMany({
            where: {
                userId: { in: userIds },
                type: { in: ['LOSS_DEDUCTION', 'MAINTENANCE_PENALTY', 'MAINTENANCE_COMMISSION_REVERSAL'] },
                createdAt: {
                    gte: start,
                    lte: end
                }
            }
        });

        // Add debt to techMap
        for (const tx of lossTransactions) {
            // find technician for this userId
            const ticketMatch = tickets.find(tk => tk.technician?.userId === tx.userId);
            if (ticketMatch && ticketMatch.technicianId) {
                const summary = techMap.get(ticketMatch.technicianId);
                if (summary) {
                    summary.debtCarryover = new Decimal(summary.debtCarryover).plus(new Decimal(tx.amount)).toDecimalPlaces(2).toNumber();
                }
            }
        }

        // Finalize total payable
        const result = Array.from(techMap.values()).map(summary => {
            summary.totalPayable = new Decimal(summary.commissionEarned)
                .plus(summary.basicSalary)
                .minus(new Decimal(summary.debtCarryover).abs())
                .toDecimalPlaces(2)
                .toNumber();
            return summary;
        });

        return { success: true, data: result };

    } catch (error: any) {
        console.error("Error in getTechniciansPayrollSummary:", error);
        return { success: false, error: error.message || "Failed to fetch summary" };
    }
}

export async function settleTechnicianPayroll({
    technicianId,
    startDate,
    endDate,
    totalPayableAmount,
    userId,
    treasuryId,
    branchId
}: {
    technicianId: string;
    startDate: string | Date;
    endDate: string | Date;
    totalPayableAmount: number;
    userId: string;
    treasuryId: string;
    branchId: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Constraint 3: Idempotency Key
        const idempotencyKey = `TECH_SETTLE_${technicianId}_${start.toISOString()}_${end.toISOString()}`;

        // Verify if it was already settled
        const existingTx = await prisma.transaction.findUnique({
            where: { idempotencyKey }
        });

        if (existingTx) {
            throw new Error("عفواً، تم صرف الرواتب لهذه الفترة مسبقاً (عملية مكررة).");
        }

        // Constraint 2: Dedicated Cash Expense Category
        const CATEGORY_NAME = "رواتب وعمولات فنيين";
        let category = await prisma.cashCategory.findUnique({
            where: { name: CATEGORY_NAME }
        });

        if (!category) {
            category = await prisma.cashCategory.create({
                data: {
                    name: CATEGORY_NAME,
                    type: "OUT",
                    isActive: true,
                    isSystem: true
                }
            });
        }

        // Execute Transaction atomically
        await prisma.$transaction(async (tx) => {
            // Constraint 1: Strict Treasury Balance Check
            const treasury = await tx.treasury.findUnique({
                where: { id: treasuryId }
            });

            if (!treasury) {
                throw new Error("الخزنة المحددة غير موجودة.");
            }

            const currentBalance = new Decimal(treasury.balance?.toString() || 0);
            const payoutAmount = new Decimal(totalPayableAmount);

            if (currentBalance.lessThan(payoutAmount)) {
                throw new Error("عفواً، رصيد الخزنة الحالي لا يغطي إجمالي المستحق للصرف.");
            }

            // Deduct from Treasury
            await tx.treasury.update({
                where: { id: treasuryId },
                data: {
                    balance: currentBalance.minus(payoutAmount)
                }
            });

            // Create Expense Record
            const expense = await tx.expense.create({
                data: {
                    description: `صرف راتب وعمولة للفني للفترة من ${start.toLocaleDateString()} إلى ${end.toLocaleDateString()}`,
                    amount: payoutAmount,
                    category: category!.name, // Link to dedicated category
                    paymentMethod: "CASH",
                    branchId: branchId,
                    date: new Date()
                }
            });

            // Create Transaction Record
            await tx.transaction.create({
                data: {
                    type: "EXPENSE",
                    amount: payoutAmount,
                    description: `صرف راتب وعمولة للفني`,
                    paymentMethod: "CASH",
                    treasuryId: treasuryId,
                    expenseId: expense.id,
                    categoryId: category!.id,
                    idempotencyKey: idempotencyKey
                }
            });

            // Get Technician's User ID to link the Employee Transaction
            const tech = await tx.technician.findUnique({
                where: { id: technicianId },
                select: { userId: true, name: true }
            });

            if (tech && tech.userId) {
                await tx.employeeTransaction.create({
                    data: {
                        userId: tech.userId,
                        type: "SALARY_PAYOUT",
                        amount: payoutAmount,
                        description: `صرف مستحقات من الخزنة`,
                        branchId: branchId
                    }
                });
            }

            // Mark tickets as settled to prevent double counting next time
            await tx.ticket.updateMany({
                where: {
                    technicianId: technicianId,
                    status: { in: ['PAID', 'PAID_DELIVERED', 'DELIVERED'] },
                    isTechCommissionSettled: false,
                    completedAt: {
                        gte: start,
                        lte: end
                    }
                },
                data: {
                    isTechCommissionSettled: true,
                    techCommissionSettledAt: new Date()
                }
            });

            // Constraint 4: Mandatory Audit Logging
            await tx.auditLog.create({
                data: {
                    entityType: "PAYROLL",
                    entityId: technicianId,
                    action: "TECHNICIAN_PAYROLL_SETTLED",
                    user: userId,
                    branchId: branchId,
                    newData: JSON.stringify({
                        totalPayableAmount,
                        technicianName: tech?.name,
                        startDate: start.toISOString(),
                        endDate: end.toISOString()
                    }),
                    reason: "Automated Tech Settlement"
                }
            });
        });

        return { success: true };

    } catch (error: any) {
        console.error("Error settling technician payroll:", error);
        return { success: false, error: error.message || "حدث خطأ غير متوقع أثناء عملية الصرف" };
    }
}
