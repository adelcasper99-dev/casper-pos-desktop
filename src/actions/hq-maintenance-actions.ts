"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { TicketStatus } from "@/lib/constants";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { startOfDay, subHours, endOfDay } from "date-fns";

export interface DashboardFilters {
    branchId?: string | "ALL";
    dateRange?: {
        from: Date;
        to: Date;
    };
}

export const getHQMaintenanceStats = secureAction(async (filters: DashboardFilters = {}) => {
    try {
        const { branchId, dateRange } = filters;

        // Base Where Clause
        const where: Prisma.TicketWhereInput = {
            deletedAt: null
        };

        if (branchId && branchId !== "ALL") {
            where.currentBranchId = branchId;
        }

        if (dateRange) {
            where.createdAt = {
                gte: startOfDay(dateRange.from),
                lte: endOfDay(dateRange.to),
            };
        }

        // 1. Live Status Board Data
        // Pending
        const pendingCount = await prisma.ticket.count({
            where: {
                ...where,
                status: {
                    in: [
                        TicketStatus.NEW,
                        TicketStatus.AT_CENTER,
                        TicketStatus.IN_PROGRESS,
                        TicketStatus.DIAGNOSING,
                        TicketStatus.WAITING_FOR_PARTS,
                        TicketStatus.QC_PENDING,
                        TicketStatus.PENDING_APPROVAL
                    ]
                }
            }
        });

        // Critical Aging (> 48 Hours and NOT Closed)
        const fortyEightHoursAgo = subHours(new Date(), 48);
        const criticalAgingCount = await prisma.ticket.count({
            where: {
                ...where,
                createdAt: {
                    lt: fortyEightHoursAgo
                },
                status: {
                    notIn: [
                        TicketStatus.COMPLETED,
                        TicketStatus.DELIVERED,
                        TicketStatus.PAID_DELIVERED,
                        TicketStatus.REJECTED,
                        TicketStatus.CANCELLED,
                        TicketStatus.PICKED_UP,
                        TicketStatus.READY_AT_BRANCH
                    ]
                }
            }
        });

        // Delivered (Revenue Realized)
        const deliveredCount = await prisma.ticket.count({
            where: {
                ...where,
                status: {
                    in: [TicketStatus.DELIVERED, TicketStatus.PAID_DELIVERED, TicketStatus.PICKED_UP]
                }
            }
        });

        // Success Rate Calculation
        const completedStats = await prisma.ticket.groupBy({
            by: ['status'],
            where: {
                ...where,
                status: {
                    in: [
                        TicketStatus.COMPLETED,
                        TicketStatus.DELIVERED,
                        TicketStatus.PAID_DELIVERED,
                        TicketStatus.PICKED_UP,
                        TicketStatus.READY_AT_BRANCH,
                        TicketStatus.REJECTED
                    ]
                }
            },
            _count: {
                id: true
            }
        });

        let repairedCount = 0;
        let rejectedCount = 0;

        completedStats.forEach(stat => {
            if (stat.status === TicketStatus.REJECTED) {
                rejectedCount += stat._count.id;
            } else {
                repairedCount += stat._count.id;
            }
        });

        const totalClosed = repairedCount + rejectedCount;
        const successRate = totalClosed > 0 ? (repairedCount / totalClosed) * 100 : 0;

        // 2. Aging Analysis (Buckets)
        const twentyFourHoursAgo = subHours(new Date(), 24);

        const under24h = await prisma.ticket.count({
            where: {
                ...where,
                createdAt: { gte: twentyFourHoursAgo },
                status: {
                    notIn: [
                        TicketStatus.COMPLETED,
                        TicketStatus.DELIVERED,
                        TicketStatus.PAID_DELIVERED,
                        TicketStatus.REJECTED,
                        TicketStatus.CANCELLED,
                        TicketStatus.PICKED_UP
                    ]
                }
            }
        });

        const between24and48h = await prisma.ticket.count({
            where: {
                ...where,
                createdAt: { lt: twentyFourHoursAgo, gte: fortyEightHoursAgo },
                status: {
                    notIn: [
                        TicketStatus.COMPLETED,
                        TicketStatus.DELIVERED,
                        TicketStatus.PAID_DELIVERED,
                        TicketStatus.REJECTED,
                        TicketStatus.CANCELLED,
                        TicketStatus.PICKED_UP
                    ]
                }
            }
        });

        // 3. Branch Performance Matrix
        const branchPerformance = await prisma.branch.findMany({
            where: branchId && branchId !== "ALL" ? { id: branchId } : { deletedAt: null },
            select: {
                id: true,
                name: true,
                currentTickets: {
                    where: dateRange ? {
                        createdAt: {
                            gte: startOfDay(dateRange.from),
                            lte: endOfDay(dateRange.to)
                        }
                    } : {},
                    select: {
                        id: true,
                        status: true,
                        repairPrice: true,
                        partsCost: true,
                        createdAt: true,
                        completedAt: true,
                    }
                }
            }
        });

        const branchMatrix = branchPerformance.map(branch => {
            const activeTickets = branch.currentTickets.filter(t =>
                ![
                    TicketStatus.COMPLETED,
                    TicketStatus.DELIVERED,
                    TicketStatus.PAID_DELIVERED,
                    TicketStatus.REJECTED,
                    TicketStatus.CANCELLED,
                    TicketStatus.PICKED_UP
                ].includes(t.status as any)
            ).length;

            const closedTickets = branch.currentTickets.filter(t =>
                [
                    TicketStatus.COMPLETED,
                    TicketStatus.DELIVERED,
                    TicketStatus.PAID_DELIVERED,
                    TicketStatus.PICKED_UP
                ].includes(t.status as any)
            );

            const totalRevenue = branch.currentTickets.reduce((sum, t) => sum + Number(t.repairPrice), 0);
            const totalPartsCost = branch.currentTickets.reduce((sum, t) => sum + Number(t.partsCost), 0);
            const netProfit = totalRevenue - totalPartsCost;

            let totalRepairTime = 0;
            let repairTimeCount = 0;
            branch.currentTickets.forEach(t => {
                if (t.completedAt && t.createdAt) {
                    const diff = new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime();
                    totalRepairTime += diff;
                    repairTimeCount++;
                }
            });
            const avgRepairTime = repairTimeCount > 0 ? (totalRepairTime / repairTimeCount) / (1000 * 60 * 60) : 0;

            return {
                branchId: branch.id,
                branchName: branch.name,
                activeTickets,
                avgRepairTime: avgRepairTime.toFixed(1),
                sparePartsCost: totalPartsCost,
                serviceRevenue: totalRevenue,
                netProfit: netProfit
            };
        });

        // 4. Technician Leaderboard
        const techStats = await prisma.technician.findMany({
            where: {
                deletedAt: null,
                ...(branchId && branchId !== "ALL" ? { user: { branchId: branchId } } : {})
            },
            select: {
                id: true,
                name: true,
                completedTickets: {
                    where: dateRange ? {
                        completedAt: {
                            gte: startOfDay(dateRange.from),
                            lte: endOfDay(dateRange.to)
                        }
                    } : {
                        status: { in: [TicketStatus.COMPLETED, TicketStatus.DELIVERED, TicketStatus.PAID_DELIVERED, TicketStatus.PICKED_UP] }
                    },
                    select: {
                        id: true,
                        repairPrice: true,
                        returnCount: true
                    }
                }
            },
            take: 10
        });

        const leaderboard = techStats.map(tech => {
            const ticketsClosed = tech.completedTickets.length;
            const revenueGenerated = tech.completedTickets.reduce((sum, t) => sum + Number(t.repairPrice), 0);
            const returnedTicketsCount = tech.completedTickets.filter(t => t.returnCount > 0).length;
            const bounceRate = ticketsClosed > 0 ? (returnedTicketsCount / ticketsClosed) * 100 : 0;

            return {
                id: tech.id,
                name: tech.name,
                ticketsClosed,
                revenueGenerated,
                bounceRate: bounceRate.toFixed(1)
            };
        }).sort((a, b) => b.revenueGenerated - a.revenueGenerated);

        return {
            liveStatus: {
                pending: pendingCount,
                criticalAging: criticalAgingCount,
                delivered: deliveredCount,
                successRate: successRate.toFixed(1)
            },
            agingAnalysis: {
                under24h,
                between24and48h,
                over48h: criticalAgingCount
            },
            branchMatrix,
            leaderboard
        };

    } catch (error: any) {
        console.error("Error fetching HQ maintenance stats:", error);
        throw new Error("Failed to fetch dashboard data");
    }
}, { permission: PERMISSIONS.REPORTS_VIEW, requireCSRF: false });
