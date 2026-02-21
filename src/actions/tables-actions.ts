"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";

// FLOOR ACTIONS
export const getFloors = secureAction(async () => {
    const floors = await prisma.floor.findMany({
        orderBy: { createdAt: 'asc' },
    });
    return { data: floors };
}, { requireCSRF: false });

export const createFloor = secureAction(async (data: { name: string }) => {
    const floor = await prisma.floor.create({
        data: { name: data.name }
    });
    return { data: floor };
}, { permission: 'MANAGE_SETTINGS', requireCSRF: false });

export const updateFloor = secureAction(async (id: string, data: { name: string }) => {
    const floor = await prisma.floor.update({
        where: { id },
        data: { name: data.name }
    });
    return { data: floor };
}, { permission: 'MANAGE_SETTINGS', requireCSRF: false });

export const deleteFloor = secureAction(async (id: string) => {
    await prisma.floor.delete({ where: { id } });
    return { success: true };
}, { permission: 'MANAGE_SETTINGS', requireCSRF: false });


// TABLE ACTIONS
export const getTablesByFloor = secureAction(async (floorId: string) => {
    const tables = await prisma.table.findMany({
        where: { floorId },
        orderBy: { name: 'asc' },
    });
    return { data: tables };
}, { requireCSRF: false });

export const createTable = secureAction(async (data: { name: string; floorId: string }) => {
    const table = await prisma.table.create({
        data: {
            name: data.name,
            floorId: data.floorId
        }
    });
    return { data: table };
}, { permission: 'MANAGE_SETTINGS', requireCSRF: false });

export const updateTable = secureAction(async (id: string, data: { name?: string; status?: string }) => {
    const table = await prisma.table.update({
        where: { id },
        data: {
            ...(data.name && { name: data.name }),
            ...(data.status && { status: data.status }),
        }
    });
    return { data: table };
}, { requireCSRF: false }); // Open for POS usage to update status quickly

export const deleteTable = secureAction(async (id: string) => {
    await prisma.table.delete({ where: { id } });
    return { success: true };
}, { permission: 'MANAGE_SETTINGS', requireCSRF: false });
