'use server';

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { z } from "zod";
import { getCurrentUser } from "./auth";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getTranslations } from "@/lib/i18n-mock";

const reorderRuleSchema = z.object({
  warehouseId: z.string(),
  productId: z.string(),
  minQty: z.number().min(0),
  maxQty: z.number().min(0),
  isActive: z.boolean().default(true),
});

export const getReorderRules = secureAction(async (warehouseId: string) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const rules = await prisma.reorderRule.findMany({
    where: { warehouseId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          type: true,
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return { success: true, data: rules };
}, { requireCSRF: false });

export const upsertReorderRule = secureAction(async (data: z.infer<typeof reorderRuleSchema> & { id?: string, csrfToken?: string }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (!hasPermission(user.permissions, PERMISSIONS.WAREHOUSE_VIEW)) {
    throw new Error("Forbidden");
  }

  const { warehouseId, productId, minQty, maxQty, isActive, id } = data;

  const rule = await prisma.reorderRule.upsert({
    where: id ? { id } : { warehouseId_productId: { warehouseId, productId } },
    update: { minQty, maxQty, isActive },
    create: {
      warehouseId,
      productId,
      minQty,
      maxQty,
      isActive,
    }
  });

  return { success: true, data: rule };
});

export const deleteReorderRule = secureAction(async (data: { id: string, csrfToken?: string }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (!hasPermission(user.permissions, PERMISSIONS.WAREHOUSE_VIEW)) {
    throw new Error("Forbidden");
  }

  await prisma.reorderRule.delete({
    where: { id: data.id }
  });

  return { success: true };
});

export const checkAndGenerateRequests = secureAction(async (data: { warehouseId?: string, csrfToken?: string }) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Get active rules
  const whereClause = data.warehouseId ? { warehouseId: data.warehouseId, isActive: true } : { isActive: true };
  const rules = await prisma.reorderRule.findMany({
    where: whereClause,
    include: {
      warehouse: {
        include: { branch: true }
      },
      product: true
    }
  });

  let generatedCount = 0;

  for (const rule of rules) {
    // Check current stock
    const currentStock = await prisma.stock.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: rule.warehouseId,
          productId: rule.productId
        }
      }
    });

    const qty = currentStock ? Number(currentStock.quantity) : 0;

    if (qty <= Number(rule.minQty)) {
      const neededQty = Number(rule.maxQty) - qty;
      if (neededQty <= 0) continue;

      // Mitigation 1: Check if destWarehouse exists
      const destWarehouse = await prisma.warehouse.findFirst({
        where: {
          branchId: rule.warehouse.branchId,
          isDefault: true,
          deletedAt: null,
        }
      });

      if (!destWarehouse) {
        console.warn(`ReorderRule ${rule.id}: No default warehouse for branch ${rule.warehouse.branchId} — skipping`);
        continue;
      }

      // Mitigation 2: Idempotency check
      const existingReq = await prisma.stockRequest.findFirst({
        where: {
          warehouseId: destWarehouse.id,
          status: { in: ['PENDING', 'APPROVED'] },
          items: { some: { productId: rule.productId } }
        }
      });

      if (existingReq) continue; // Already requested

      // Generate stock request
      await prisma.stockRequest.create({
        data: {
          warehouseId: destWarehouse.id,
          requestedById: user.id,
          status: 'PENDING',
          items: {
            create: {
              productId: rule.productId,
              quantity: neededQty
            }
          }
        }
      });
      generatedCount++;
    }
  }

  return { success: true, count: generatedCount };
});
