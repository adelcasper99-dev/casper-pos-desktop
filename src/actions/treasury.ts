"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ─── Get Treasury Data ────────────────────────────────────────────────────────
export async function getTreasuryData(filters?: {
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
}) {
  try {
    const where: any = { deletedAt: null };

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    if (filters?.paymentMethod && filters.paymentMethod !== "ALL") {
      where.paymentMethod = filters.paymentMethod;
    }

    const [transactions, rawTreasuries] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { treasury: true },
        take: 500,
      }),
      prisma.treasury.findMany({
        where: { deletedAt: null },
        orderBy: { isDefault: "desc" },
      }),
    ]);

    // Calculate balances by payment method
    const POSITIVE_TYPES = ["IN", "CAPITAL", "SALE", "TICKET", "CUSTOMER_PAYMENT"];
    const byMethod = transactions.reduce(
      (acc, t) => {
        const isPositive = POSITIVE_TYPES.includes(t.type);
        const delta = isPositive ? Number(t.amount) : -Number(t.amount);
        acc[t.paymentMethod] = (acc[t.paymentMethod] || 0) + delta;
        return acc;
      },
      { CASH: 0, VISA: 0, WALLET: 0, INSTAPAY: 0 } as Record<string, number>
    );

    return {
      success: true,
      data: {
        byMethod,
        transactions: transactions.map((t) => ({
          id: t.id,
          type: t.type,
          description: t.description,
          amount: Number(t.amount),
          paymentMethod: t.paymentMethod,
          treasuryId: t.treasuryId,
          treasuryName: t.treasury?.name,
          createdAt: t.createdAt.toISOString(),
        })),
        treasuries: rawTreasuries.map((t) => ({
          id: t.id,
          name: t.name,
          balance: Number(t.balance),
          isDefault: t.isDefault,
          branchId: t.branchId,
        })),
      },
    };
  } catch (error) {
    return { success: false, error: "Failed to load treasury data" };
  }
}

// ─── Add Transaction ──────────────────────────────────────────────────────────
export async function addTreasuryTransaction(
  type: string,
  amount: number,
  description: string,
  paymentMethod: string,
  treasuryId?: string
) {
  try {
    const POSITIVE_TYPES = ["IN", "CAPITAL", "SALE", "TICKET", "CUSTOMER_PAYMENT"];
    const isPositive = POSITIVE_TYPES.includes(type);
    const numericAmount = Number(amount);

    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: { type, amount: numericAmount, description, paymentMethod, treasuryId },
      });

      if (treasuryId) {
        await tx.treasury.update({
          where: { id: treasuryId },
          data: {
            balance: isPositive
              ? { increment: numericAmount }
              : { decrement: numericAmount },
          },
        });
      }
    });

    revalidatePath("/treasury");
    return { success: true };
  } catch (error) {
    return { success: false, error: "Failed to add transaction" };
  }
}

// ─── Update Transaction ───────────────────────────────────────────────────────
export async function updateTreasuryTransaction(
  id: string,
  data: { type: string; amount: number; description: string; paymentMethod: string },
  reason: string
) {
  try {
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (existing) {
      await prisma.auditLog.create({
        data: {
          entityType: "TRANSACTION",
          entityId: id,
          action: "UPDATE",
          previousData: JSON.stringify({
            type: existing.type,
            amount: Number(existing.amount),
            description: existing.description,
            paymentMethod: existing.paymentMethod,
          }),
          newData: JSON.stringify(data),
          reason,
        },
      });
    }

    await prisma.transaction.update({
      where: { id },
      data: {
        type: data.type,
        amount: data.amount,
        description: data.description,
        paymentMethod: data.paymentMethod,
      },
    });

    revalidatePath("/treasury");
    return { success: true };
  } catch (error) {
    return { success: false, error: "Failed to update transaction" };
  }
}

// ─── Delete Transaction (Soft) ─────────────────────────────────────────────────
export async function deleteTreasuryTransaction(id: string, reason: string) {
  try {
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "Transaction not found" };
    if (existing.deletedAt) return { success: false, error: "Already deleted" };

    await prisma.auditLog.create({
      data: {
        entityType: "TRANSACTION",
        entityId: id,
        action: "SOFT_DELETE",
        previousData: JSON.stringify({
          type: existing.type,
          amount: Number(existing.amount),
          description: existing.description,
        }),
        reason,
      },
    });

    await prisma.transaction.update({
      where: { id },
      data: { deletedAt: new Date(), deletedReason: reason },
    });

    revalidatePath("/treasury");
    return { success: true };
  } catch (error) {
    return { success: false, error: "Failed to delete transaction" };
  }
}

// ─── Create Treasury ──────────────────────────────────────────────────────────
export async function createTreasury(data: {
  name: string;
  branchId: string;
  isDefault?: boolean;
}) {
  try {
    if (data.isDefault) {
      await prisma.treasury.updateMany({
        where: { branchId: data.branchId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const treasury = await prisma.treasury.create({
      data: {
        name: data.name,
        branchId: data.branchId,
        isDefault: data.isDefault || false,
      },
    });

    revalidatePath("/treasury");
    return { success: true, data: treasury };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return { success: false, error: "خزنة بهذا الاسم موجودة بالفعل في هذا الفرع" };
    }
    return { success: false, error: "فشل إنشاء الخزنة" };
  }
}

// ─── Delete Treasury ──────────────────────────────────────────────────────────
export async function deleteTreasury(id: string) {
  try {
    const treasury = await prisma.treasury.findUnique({ where: { id } });
    if (!treasury) return { success: false, error: "الخزنة غير موجودة" };
    if (treasury.isDefault) {
      return { success: false, error: "لا يمكن حذف الخزنة الرئيسية الافتراضية" };
    }
    if (Number(treasury.balance) !== 0) {
      return { success: false, error: "لا يمكن حذف خزنة بها رصيد. يرجى تحويل الرصيد أولاً" };
    }

    await prisma.treasury.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/treasury");
    return { success: true };
  } catch (error) {
    return { success: false, error: "فشل حذف الخزنة" };
  }
}

// ─── Get All Treasuries ───────────────────────────────────────────────────────
export async function getTreasuries() {
  try {
    const treasuries = await prisma.treasury.findMany({
      where: { deletedAt: null },
      include: { branch: true },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: treasuries.map((t) => ({ ...t, balance: Number(t.balance) })),
    };
  } catch (error) {
    return { success: false, error: "Failed to load treasuries" };
  }
}

// ─── Transfer Between Treasuries ─────────────────────────────────────────────
export async function transferBetweenTreasuries(data: {
  fromTreasuryId: string;
  toTreasuryId: string;
  amount: number;
  description?: string;
  paymentMethod?: string;
}) {
  try {
    if (data.fromTreasuryId === data.toTreasuryId) {
      return { success: false, error: "لا يمكن التحويل من وإلى نفس الخزنة" };
    }
    if (data.amount <= 0) {
      return { success: false, error: "يجب أن يكون المبلغ أكبر من صفر" };
    }

    const fromTreasury = await prisma.treasury.findUnique({ where: { id: data.fromTreasuryId } });
    const toTreasury = await prisma.treasury.findUnique({ where: { id: data.toTreasuryId } });

    if (!fromTreasury || fromTreasury.deletedAt) return { success: false, error: "الخزنة المصدر غير موجودة" };
    if (!toTreasury || toTreasury.deletedAt) return { success: false, error: "الخزنة الهدف غير موجودة" };
    if (Number(fromTreasury.balance) < data.amount) {
      return { success: false, error: `رصيد الخزنة غير كافٍ. الرصيد الحالي: ${Number(fromTreasury.balance).toFixed(2)}` };
    }

    const method = data.paymentMethod || "CASH";
    const desc = data.description || `تحويل من ${fromTreasury.name} إلى ${toTreasury.name}`;

    await prisma.$transaction(async (tx) => {
      // 1. Deduct from source
      await tx.treasury.update({
        where: { id: data.fromTreasuryId },
        data: { balance: { decrement: data.amount } },
      });
      await tx.transaction.create({
        data: {
          type: "TRANSFER_OUT",
          amount: data.amount,
          description: desc,
          paymentMethod: method,
          treasuryId: data.fromTreasuryId,
        },
      });

      // 2. Add to destination
      await tx.treasury.update({
        where: { id: data.toTreasuryId },
        data: { balance: { increment: data.amount } },
      });
      await tx.transaction.create({
        data: {
          type: "TRANSFER_IN",
          amount: data.amount,
          description: desc,
          paymentMethod: method,
          treasuryId: data.toTreasuryId,
        },
      });
    });

    revalidatePath("/treasury");
    return { success: true };
  } catch (error) {
    return { success: false, error: "فشل تنفيذ التحويل" };
  }
}
