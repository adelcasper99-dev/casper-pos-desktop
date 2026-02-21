"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createFloor(data: { name: string }) {
    try {
        const newFloor = await prisma.floor.create({
            data: {
                name: data.name,
            },
            include: { tables: true }
        });

        revalidatePath('/pos');
        revalidatePath('/settings');
        return { success: true, data: newFloor };
    } catch (error: any) {
        console.error("Failed to create floor:", error);
        return { success: false, error: error.message };
    }
}

export async function createTable(data: { name: string, floorId: string }) {
    try {
        const newTable = await prisma.table.create({
            data: {
                name: data.name,
                floorId: data.floorId,
                status: "AVAILABLE",
            }
        });

        revalidatePath('/pos');
        revalidatePath('/settings');
        return { success: true, data: newTable };
    } catch (error: any) {
        console.error("Failed to create table:", error);
        return { success: false, error: error.message };
    }
}

export async function updateFloor(id: string, name: string) {
    try {
        const updatedFloor = await prisma.floor.update({
            where: { id },
            data: { name },
            include: { tables: true }
        });

        revalidatePath('/pos');
        revalidatePath('/settings');
        return { success: true, data: updatedFloor };
    } catch (error: any) {
        console.error("Failed to update floor:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteFloor(id: string) {
    try {
        await prisma.floor.delete({
            where: { id }
        });

        revalidatePath('/pos');
        revalidatePath('/settings');
        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete floor:", error);
        return { success: false, error: error.message };
    }
}

export async function updateTable(id: string, name: string) {
    try {
        const updatedTable = await prisma.table.update({
            where: { id },
            data: { name }
        });

        revalidatePath('/pos');
        revalidatePath('/settings');
        return { success: true, data: updatedTable };
    } catch (error: any) {
        console.error("Failed to update table:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteTable(id: string) {
    try {
        await prisma.table.delete({
            where: { id }
        });

        revalidatePath('/pos');
        revalidatePath('/settings');
        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete table:", error);
        return { success: false, error: error.message };
    }
}

