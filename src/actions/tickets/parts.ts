"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentUser } from "../auth";
import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
import { decrementWarehouseStock, incrementWarehouseStock } from "@/lib/stock-helpers";

export const addTicketPart = secureAction(async (data: {
    ticketId: string,
    productId: string,
    quantity: number,
    price: number,
    warehouseId: string,
    csrfToken?: string
}) => {
    const currentUser = await getCurrentUser();

    const result = await prisma.$transaction(async (tx) => {
        if (!currentUser) throw new Error("Unauthorized");

        const part = await tx.ticketPart.create({
            data: {
                ticketId: data.ticketId,
                productId: data.productId,
                quantity: data.quantity,
                price: new Decimal(data.price),
                addedById: currentUser.id
            }
        });

        await decrementWarehouseStock(tx, data.productId, data.warehouseId, data.quantity);

        return part;
    });

    revalidatePath(`/tickets/${data.ticketId}`);
    return { success: true, part: result };
}, { permission: PERMISSIONS.TICKET_EDIT });

export const removeTicketPart = secureAction(async (data: {
    ticketPartId: string,
    warehouseId: string,
    csrfToken?: string
}) => {
    const currentUser = await getCurrentUser();

    await prisma.$transaction(async (tx) => {
        const part = await tx.ticketPart.findUnique({
            where: { id: data.ticketPartId }
        });

        if (!part) throw new Error("Part not found");

        if (!part.productId) throw new Error("Part has no associated product");

        await tx.ticketPart.update({
            where: { id: data.ticketPartId },
            data: { deletedAt: new Date() }
        });

        await incrementWarehouseStock(tx, part.productId, data.warehouseId, part.quantity.toNumber());
    });

    return { success: true };
}, { permission: PERMISSIONS.TICKET_EDIT });
