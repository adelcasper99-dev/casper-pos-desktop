'use server'

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import bcrypt from 'bcryptjs'
import { secureAction } from "@/lib/safe-action"
import { PERMISSIONS } from "@/lib/permissions"
import { serialize } from "@/lib/serialization"
import { Decimal } from "@prisma/client/runtime/library"
import { decrementWarehouseStock, incrementWarehouseStock } from "@/lib/stock-helpers"

// Helper to calculate time diff in hours
function getHoursDiff(start: Date, end: Date) {
    return Math.abs(end.getTime() - start.getTime()) / 36e5;
}

const DONE_STATUSES = ['COMPLETED', 'DELIVERED', 'READY_AT_BRANCH', 'PICKED_UP', 'CANCELLED', 'PAID_DELIVERED', 'REJECTED'];

/**
 * Get technician statistics
 */
export const getEngineersStats = secureAction(async () => {
    try {
        const technicians = await prisma.technician.findMany({
            where: { deletedAt: null },
            include: { user: true, warehouse: true }
        });

        const techIds = technicians.map(t => t.id);
        const allTickets = await prisma.ticket.findMany({
            where: {
                OR: [
                    { technicianId: { in: techIds } },
                    { collaborators: { some: { technicianId: { in: techIds } } } }
                ]
            },
            select: {
                technicianId: true,
                status: true,
                createdAt: true,
                completedAt: true,
                collaborators: { select: { technicianId: true } }
            }
        });

        const stats = technicians.map((tech) => {
            const techTickets = allTickets.filter((t) =>
                t.technicianId === tech.id ||
                t.collaborators?.some((c) => c.technicianId === tech.id)
            );

            const activeTickets = techTickets.filter((t) => !DONE_STATUSES.includes(t.status));
            const completedTickets = techTickets.filter((t) => DONE_STATUSES.includes(t.status));

            let totalHours = 0;
            let countWithTime = 0;
            completedTickets.forEach((t) => {
                if (t.completedAt) {
                    totalHours += getHoursDiff(new Date(t.createdAt), new Date(t.completedAt));
                    countWithTime++;
                }
            });

            const avgTime = countWithTime > 0 ? (totalHours / countWithTime).toFixed(1) : "0.0";

            return {
                ...tech,
                commissionRate: tech.commissionRate.toString(),
                activeTicketsCount: activeTickets.length,
                completedTicketsCount: completedTickets.length,
                averageRepairTime: avgTime,
            };
        });

        return serialize({ data: stats });
    } catch (error: unknown) {
        console.error("Error fetching engineer stats:", error);
        throw new Error(error instanceof Error ? error.message : `Failed to fetch stats`);
    }
}, { permission: PERMISSIONS.ENGINEER_VIEW, requireCSRF: false });

/**
 * Upsert a technician
 */
export const upsertEngineer = secureAction(async (data: {
    id?: string,
    name: string,
    phone: string,
    email?: string,
    skills?: string,
    commissionRate: string | number | Decimal,
    username?: string,
    password?: string,
    createWarehouse?: boolean,
    branchId: string,
    defaultPriceTier?: string,
    csrfToken?: string,
}) => {
    try {
        await prisma.$transaction(async (tx) => {
            let userId: string | null = null;

            if (data.username && data.password) {
                const hashedPassword = await bcrypt.hash(data.password, 10);
                const existing = await tx.user.findUnique({ where: { username: data.username } });
                if (existing) throw new Error("Username already taken");

                const user = await tx.user.create({
                    data: {
                        username: data.username,
                        name: data.name,
                        password: hashedPassword,
                        roleStr: 'TECHNICIAN',
                        branchId: data.branchId
                    }
                });
                userId = user.id;
            }

            let warehouseId: string | null = null;
            if (data.createWarehouse) {
                const wh = await tx.warehouse.create({
                    data: {
                        name: `${data.name}'s Stock`,
                        isDefault: false,
                        branchId: data.branchId
                    }
                });
                warehouseId = wh.id;
            }

            if (data.id) {
                await tx.technician.update({
                    where: { id: data.id },
                    data: {
                        name: data.name,
                        phone: data.phone,
                        email: data.email,
                        skills: data.skills,
                        commissionRate: new Decimal(data.commissionRate.toString()),
                        defaultPriceTier: data.defaultPriceTier || 'COST',
                        ...(userId ? { userId } : {}),
                        ...(warehouseId ? { warehouseId } : {})
                    }
                });
            } else {
                await tx.technician.create({
                    data: {
                        name: data.name,
                        phone: data.phone,
                        email: data.email,
                        skills: data.skills,
                        commissionRate: new Decimal(data.commissionRate.toString()),
                        defaultPriceTier: data.defaultPriceTier || 'COST',
                        userId: userId!,
                        warehouseId: warehouseId || undefined
                    }
                });
            }
        });

        revalidatePath('/maintenance/technicians');
        return { success: true };
    } catch (error: unknown) {
        console.error("Upsert Engineer Error:", error);
        throw new Error(error instanceof Error ? error.message : "Unknown error");
    }
}, { permission: PERMISSIONS.ENGINEER_MANAGE });

/**
 * Soft delete a technician
 */
export const deleteEngineer = secureAction(async (data: { id: string, csrfToken?: string }) => {
    const { id } = data;
    await prisma.technician.update({
        where: { id },
        data: { deletedAt: new Date() }
    });
    revalidatePath('/maintenance/technicians');
    return { success: true };
}, { permission: PERMISSIONS.ENGINEER_MANAGE });

/**
 * Get all active technicians
 */
export const getAllTechnicians = secureAction(async () => {
    try {
        const technicians = await prisma.technician.findMany({
            where: { deletedAt: null },
            orderBy: { name: 'asc' }
        });
        return { success: true, technicians };
    } catch (error: unknown) {
        console.error("Error fetching all technicians:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to fetch technicians", technicians: [] };
    }
}, { permission: PERMISSIONS.TICKET_VIEW, requireCSRF: false });

/**
 * Get all active branches
 */
export const getBranches = async () => {
    try {
        const branches = await prisma.branch.findMany({
            orderBy: { name: 'asc' }
        });
        return { success: true, data: branches };
    } catch (error: unknown) {
        console.error("Error fetching branches:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to fetch branches" };
    }
};

export const getEngineerStock = secureAction(async (warehouseId: string) => {
    try {
        const stocks = await prisma.stock.findMany({
            where: { warehouseId },
            include: {
                product: {
                    select: {
                        name: true,
                        sku: true,
                        costPrice: true,
                        sellPrice: true,
                        sellPrice2: true,
                        sellPrice3: true,
                    }
                }
            }
        });
        return serialize({ success: true, data: stocks });
    } catch (error: unknown) {
        console.error("Error fetching engineer stock:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to fetch stock" };
    }
}, { permission: PERMISSIONS.ENGINEER_VIEW, requireCSRF: false });
export const getEngineerDetails = secureAction(async (id: string) => {
    try {
        const engineer = await prisma.technician.findFirst({
            where: { id, deletedAt: null },
            include: {
                user: true,
                warehouse: true,
                tickets: {
                    where: {
                        status: { notIn: DONE_STATUSES }
                    }
                },
                collaborations: {
                    where: {
                        ticket: { status: { notIn: DONE_STATUSES } }
                    },
                    include: {
                        ticket: true
                    }
                }
            } as any
        });

        if (!engineer) throw new Error("Engineer not found");

        const techIds = [id];

        // 1. Fetch ALL tickets involving this engineer
        const allTickets = await prisma.ticket.findMany({
            where: {
                OR: [
                    { technicianId: id },
                    { collaborators: { some: { technicianId: id } } }
                ]
            },
            select: {
                id: true,
                status: true,
                createdAt: true,
                completedAt: true,
                repairPrice: true, // For revenue calc if needed later
                returnCount: true,
                paymentStatus: true
            }
        });

        // 2. Calculate Stats
        const totalTickets = allTickets.length;
        const pendingTickets = allTickets.filter(t => !DONE_STATUSES.includes(t.status)).length;
        const completedTickets = allTickets.filter(t => DONE_STATUSES.includes(t.status));

        // Returned: Status is 'RETURNED' or 'RETURNED_WARRANTY' OR returnCount > 0
        const returnedTickets = allTickets.filter(t =>
            ['RETURNED', 'RETURNED_WARRANTY'].includes(t.status) || t.returnCount > 0
        ).length;

        // Refunded: Status 'REFUNDED' or paymentStatus 'refunded'
        const refundedTickets = allTickets.filter(t =>
            t.status === 'REFUNDED' || t.paymentStatus === 'refunded' || t.status === 'VOIDED'
        ).length;



        let totalHours = 0;
        let countWithTime = 0;
        completedTickets.forEach(t => {
            if (t.completedAt) {
                totalHours += getHoursDiff(new Date(t.createdAt), new Date(t.completedAt));
                countWithTime++;
            }
        });
        const avgTime = countWithTime > 0 ? (totalHours / countWithTime).toFixed(1) : "0.0";

        // 3. Fetch Stock Wastage (Loss)
        let lossCount = 0;
        let lossAmount = new Decimal(0);
        if (engineer.userId) {
            lossCount = await prisma.stockWastage.count({
                where: { reportedBy: engineer.userId }
            });

            const deductions = await prisma.employeeTransaction.findMany({
                where: { 
                    userId: engineer.userId, 
                    type: 'DEDUCTION' 
                },
                select: { amount: true }
            });
            lossAmount = deductions.reduce((sum, d) => sum.add(new Decimal(d.amount.toString())), new Decimal(0));
        }

        const { tickets, collaborations, ...serializedTech } = engineer as any;

        return serialize({
            data: {
                ...serializedTech,
                commissionRate: engineer.commissionRate.toString(),
                activeTicketsCount: pendingTickets,
                completedTicketsCount: completedTickets.length,
                totalTicketsCount: totalTickets,
                returnedTicketsCount: returnedTickets,
                refundedTicketsCount: refundedTickets,
                lossCount: lossCount,
                lossAmount: lossAmount.toString(),
                averageRepairTime: avgTime,
                createdAt: engineer.createdAt,
                updatedAt: engineer.updatedAt,
            }
        });

    } catch (error: unknown) {
        console.error("Error fetching engineer details:", error);
        throw new Error(error instanceof Error ? error.message : `Failed to fetch engineer details`);
    }
}, { permission: PERMISSIONS.ENGINEER_VIEW, requireCSRF: false });

export const getEngineerHistory = secureAction(async (engineerId: string) => {
    try {
        const history = await prisma.ticket.findMany({
            where: {
                OR: [
                    {
                        technicianId: engineerId,
                        status: { in: ['COMPLETED', 'DELIVERED', 'READY_AT_BRANCH', 'PICKED_UP', 'CANCELLED', 'PAID_DELIVERED', 'REJECTED'] }
                    },
                    { completedById: engineerId }
                ]
            },
            orderBy: { completedAt: 'desc' },
            select: {
                id: true,
                barcode: true,
                deviceModel: true,
                deviceBrand: true,
                issueDescription: true,
                repairPrice: true,
                completedAt: true,
                status: true,
                customerName: true,
                customerPhone: true,
                updatedAt: true
            },
            take: 50
        });

        // Use helper to serialize Decimal and Dates
        return serialize({ data: history });
    } catch (error: unknown) {
        console.error("Error fetching engineer history:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to fetch history");
    }
}, { permission: PERMISSIONS.ENGINEER_VIEW, requireCSRF: false });

export const getEngineerConsumption = secureAction(async (engineerId: string) => {
    try {
        // Find warehouse for this engineer
        const tech = await prisma.technician.findUnique({
            where: { id: engineerId },
            select: { warehouseId: true }
        });

        if (!tech?.warehouseId) return serialize({ data: [] });

        const consumption = await prisma.stockMovement.findMany({
            where: {
                fromWarehouseId: tech.warehouseId,
                type: 'USAGE'
            },
            orderBy: { createdAt: 'desc' },
            include: {
                product: {
                    select: { name: true, sku: true }
                }
            },
            take: 50
        });

        return serialize({ data: consumption });
    } catch (error: unknown) {
        console.error("Error fetching engineer consumption:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to fetch consumption");
    }
}, { permission: PERMISSIONS.ENGINEER_VIEW, requireCSRF: false });
