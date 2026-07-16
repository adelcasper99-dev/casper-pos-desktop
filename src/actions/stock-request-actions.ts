'use server';

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { z } from "zod";
import { getCurrentUser } from "./auth";
import { STOCK_REQUEST_STATUS, StockRequestStatus, ALLOWED_TRANSITIONS } from "@/shared/constants/stock-request-statuses";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { transferStock } from "./inventory-transfer";

const transitionSchema = z.object({
  requestId: z.string(),
  targetStatus: z.string()
});

export const getStockRequests = secureAction(async (warehouseId?: string) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const where = warehouseId ? { warehouseId } : {};

  const requests = await prisma.stockRequest.findMany({
    where,
    include: {
      warehouse: { include: { branch: true } },
      items: { include: { product: true } },
      requestedBy: { select: { id: true, name: true } },
      fulfilledBy: { select: { id: true, name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return { success: true, data: requests };
}, { requireCSRF: false });

export const transitionStockRequest = secureAction(async (data: z.infer<typeof transitionSchema> & { csrfToken?: string }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const targetStatus = data.targetStatus as StockRequestStatus;

  // 1. Get current request
  const req = await prisma.stockRequest.findUnique({
    where: { id: data.requestId },
    include: { items: true }
  });

  if (!req) throw new Error("Request not found");

  const currentStatus = req.status as StockRequestStatus;

  // 2. State Machine Transition Check
  if (!ALLOWED_TRANSITIONS[currentStatus].includes(targetStatus)) {
    throw new Error(`Invalid transition from ${currentStatus} to ${targetStatus}`);
  }

  // 3. Handle DISPATCHED side-effect (Stock Transfer)
  if (targetStatus === 'DISPATCHED') {
    // Check permission for dispatching
    if (!hasPermission(user.permissions, PERMISSIONS.WAREHOUSE_VIEW)) {
       throw new Error("Forbidden: Cannot dispatch stock");
    }

    const sourceWarehouse = await prisma.warehouse.findFirst({
      where: { type: 'CENTER', deletedAt: null }
    });
    if (!sourceWarehouse) throw new Error("Center warehouse not found for dispatch");

    const itemsToTransfer = req.items.map(item => ({
      productId: item.productId,
      quantity: Number(item.quantity)
    }));

    // Perform actual transfer using existing single source of truth
    const transferResult = await transferStock({
      sourceId: sourceWarehouse.id,
      sourceType: 'WAREHOUSE',
      destinationId: req.warehouseId,
      destinationType: 'WAREHOUSE',
      items: itemsToTransfer
    });

    if (!transferResult.success) {
      throw new Error("Failed to dispatch stock: " + transferResult.error);
    }
  }

  // 4. Update status with concurrency guard
  const updateResult = await prisma.stockRequest.updateMany({
    where: { 
      id: data.requestId, 
      status: currentStatus // State Machine Guard (Mitigation 4)
    },
    data: { 
      status: targetStatus,
      ...(targetStatus === 'DISPATCHED' ? { fulfilledById: user.id } : {})
    }
  });

  if (updateResult.count === 0) {
    throw new Error("Concurrent update detected or request already processed.");
  }

  return { success: true };
});
