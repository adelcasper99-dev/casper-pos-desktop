"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { EXPENSE_CATEGORY_MAP, INCOMING_CATEGORIES } from "@/shared/constants/accounting-mappings";

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
  treasuryId?: string,
  expenseCategory?: string, // Added for Phase 3
  incomingCategoryId?: string // Added for Phase 1 deposits
) {
  try {
    const POSITIVE_TYPES = ["IN", "CAPITAL", "SALE", "TICKET", "CUSTOMER_PAYMENT"];

    // Determine exact type if incoming category is provided
    let finalType = type;
    let creditAccount = '3000'; // Default Capital for fallback

    if (incomingCategoryId) {
      const category = INCOMING_CATEGORIES.find((c: any) => c.id === incomingCategoryId);
      if (category) {
        finalType = category.actionType;
        creditAccount = category.creditAccountId;
      }
    }

    const isPositive = POSITIVE_TYPES.includes(finalType);
    const numericAmount = Number(amount);

    await prisma.$transaction(async (tx) => {
      const dbTx = await tx.transaction.create({
        data: { type: finalType, amount: numericAmount, description, paymentMethod, treasuryId },
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

      // ── Accounting Integration ──
      const debitAccount = paymentMethod === 'CASH' ? '1000' : '1010'; // Basic Mapping

      if (finalType === 'OUT') {
        // Expense/Withdrawal
        const glCode = (expenseCategory && EXPENSE_CATEGORY_MAP[expenseCategory])
          ? EXPENSE_CATEGORY_MAP[expenseCategory].glCode
          : '5200'; // Default General Expenses

        await AccountingEngine.recordTransaction({
          description: `Treasury Out: ${description}`,
          reference: dbTx.id,
          date: new Date(),
          lines: [
            { accountCode: glCode, debit: numericAmount, credit: 0, description },
            { accountCode: debitAccount, debit: 0, credit: numericAmount, description: `${paymentMethod} Withdrawal` }
          ]
        }, tx);
      } else if (isPositive) {
        // Dynamic "Cash In" workflow
        const categoryUI = INCOMING_CATEGORIES.find((c: any) => c.id === incomingCategoryId)?.uiLabel || 'Deposit';

        await AccountingEngine.recordTransaction({
          description: `Treasury In: ${description}`,
          reference: dbTx.id,
          date: new Date(),
          lines: [
            { accountCode: debitAccount, debit: numericAmount, credit: 0, description: `${paymentMethod} Deposit` },
            { accountCode: creditAccount, debit: 0, credit: numericAmount, description: categoryUI }
          ]
        }, tx);
      }
    });

    revalidatePath("/treasury");
    return { success: true };
  } catch (error) {
    console.error("Treasury Transaction Error:", error);
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

// ─── Delete Transaction (Soft + Balance Reversal) ──────────────────────────────
export async function deleteTreasuryTransaction(id: string, reason: string) {
  try {
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "Transaction not found" };
    if (existing.deletedAt) return { success: false, error: "Already deleted" };

    // Determine whether deleting this transaction should add or remove money from the treasury.
    // "Income" types (IN, SALE, CAPITAL, CUSTOMER_PAYMENT, SAFE_DROP, TRANSFER_IN)
    // originally INCREASED the balance → deleting them must DECREASE it back.
    // "Expense" types (OUT, EXPENSE, REFUND, TRANSFER_OUT) originally DECREASED it → add back.
    const IN_TYPES = new Set([
      'IN', 'SALE', 'CAPITAL', 'CUSTOMER_PAYMENT', 'SAFE_DROP', 'TRANSFER_IN',
    ]);
    const absAmount = Math.abs(Number(existing.amount));
    const isIncome = IN_TYPES.has(existing.type) && Number(existing.amount) > 0;

    await prisma.$transaction(async (tx) => {
      // 1. Audit trail
      await tx.auditLog.create({
        data: {
          entityType: "TRANSACTION",
          entityId: id,
          action: "SOFT_DELETE",
          previousData: JSON.stringify({
            type: existing.type,
            amount: Number(existing.amount),
            treasuryId: existing.treasuryId,
            description: existing.description,
          }),
          reason,
        },
      });

      // 2. Soft-delete the record
      await tx.transaction.update({
        where: { id },
        data: { deletedAt: new Date(), deletedReason: reason },
      });

      // 3. Reverse the physical balance if the transaction belongs to a treasury
      if (existing.treasuryId && absAmount > 0) {
        await tx.treasury.update({
          where: { id: existing.treasuryId },
          data: {
            balance: isIncome
              ? { decrement: absAmount }  // Was income → remove it
              : { increment: absAmount }, // Was expense → add it back
          },
        });
      }
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

// ─── Get Branch Treasuries For Dropdown / Checkout ────────────────────────────
export async function getBranchTreasuriesForDropdown(branchId?: string | null) {
  try {
    const whereClause: any = { deletedAt: null };
    if (branchId && branchId !== "all" && branchId !== "") {
      whereClause.branchId = branchId;
    }

    const treasuries = await prisma.treasury.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        paymentMethod: true,
        isDefault: true,
        branchId: true
      },
      orderBy: [
        { isDefault: "desc" }, // Put default first
        { name: "asc" }
      ]
    });

    return { success: true, data: treasuries };
  } catch (err) {
    console.error("Error fetching branch treasuries:", err);
    return { success: false, data: [] };
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
