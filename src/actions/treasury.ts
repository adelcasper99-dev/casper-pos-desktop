"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { EXPENSE_CATEGORY_MAP, INCOMING_CATEGORIES, PAYMENT_METHOD_GL_MAP, GL } from "@/shared/constants/accounting-mappings";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getCurrentUser } from "./auth";
import { getCurrentShiftInternal } from "./shift-management-actions";
import { Decimal } from "@prisma/client/runtime/library";

// ─── Get Cash Categories ──────────────────────────────────────────────────────
export async function getCashCategories() {
  try {
    const categories = await prisma.cashCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return { success: true, data: categories };
  } catch (error) {
    return { success: false, error: "Failed to load categories" };
  }
}

// ─── Get Treasury Data ────────────────────────────────────────────────────────
export async function getTreasuryData(filters?: {
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
}) {
  try {
    // Always scope to the current main branch — prevents orphaned records from ghost branches appearing
    const { ensureMainBranch } = await import('@/lib/ensure-main-branch');
    const branchId = await ensureMainBranch();

    // Transaction has no direct branchId — scope through the treasury relation
    const transactionWhere: any = {
      deletedAt: null,
      treasury: { branchId }, // Scope via relation: only transactions in this branch's treasuries
    };

    if (filters?.startDate || filters?.endDate) {
      transactionWhere.createdAt = {};
      if (filters.startDate) transactionWhere.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        transactionWhere.createdAt.lte = endDate;
      }
    }

    if (filters?.paymentMethod && filters.paymentMethod !== "ALL") {
      transactionWhere.paymentMethod = filters.paymentMethod;
    }

    const [transactions, rawTreasuries] = await Promise.all([
      prisma.transaction.findMany({
        where: transactionWhere,
        orderBy: { createdAt: "desc" },
        include: { 
          treasury: true,
          category: true
        },
        take: 500,
      }),
      prisma.treasury.findMany({
        where: { deletedAt: null, branchId }, // Treasury has direct branchId
        orderBy: { isDefault: "desc" },
      }),
    ]);

    // Calculate balances by payment method
    const POSITIVE_TYPES = ["IN", "CAPITAL", "SALE", "TICKET", "CUSTOMER_PAYMENT"];
    const byMethod = transactions.reduce(
      (acc, t) => {
        const isPositive = POSITIVE_TYPES.includes(t.type);
        const amount = new Decimal(t.amount.toString());
        const existing = new Decimal(acc[t.paymentMethod] || 0);
        const delta = isPositive ? amount : amount.negated();
        acc[t.paymentMethod] = existing.add(delta).toNumber();
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
          categoryName: t.category?.name,
          createdAt: t.createdAt.toISOString(),
        })),
        treasuries: rawTreasuries.map((t) => ({
          id: t.id,
          name: t.name,
          balance: Number(t.balance),
          isDefault: t.isDefault,
          branchId: t.branchId,
          paymentMethod: t.paymentMethod,
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
  expenseCategory?: string,
  incomingCategoryId?: string,
  shiftId?: string,
  categoryId?: string,
  idempotencyKey?: string // 🆕 Replay-safe key — prevents double-billing on reconnect
) {
  try {
    const POSITIVE_TYPES = ["IN", "CAPITAL", "SALE", "TICKET", "CUSTOMER_PAYMENT"];

    // ── Idempotency Guard (Replay Protection) ─────────────────────────────────
    if (idempotencyKey) {
      const existing = await prisma.transaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return { success: true, existing: true, id: existing.id };
      }
    }


    // Determine exact type and GL code - prioritize DB category
    let finalType = type;
    let creditAccount: string | undefined = undefined; 
    let glCode: string | undefined = undefined;

    // 🆕 Use dynamic CashCategory from DB if provided (Highest Priority)
    if (categoryId) {
      const dbCategory = await prisma.cashCategory.findUnique({
        where: { id: categoryId }
      });
      if (dbCategory) {
        finalType = dbCategory.type; // Match DB type strictly
        glCode = dbCategory.glCode || undefined;
        // If it's an IN type, set creditAccount for accounting mapping
        if (dbCategory.type === 'IN') {
          creditAccount = dbCategory.glCode || undefined;
        }
      }
    } else if (incomingCategoryId) {
      const category = INCOMING_CATEGORIES.find((c: any) => c.id === incomingCategoryId);
      if (category) {
        finalType = category.actionType;
        creditAccount = category.creditAccountId;
      }
    } else if (expenseCategory) {
      const cat = EXPENSE_CATEGORY_MAP[expenseCategory];
      if (cat) {
        glCode = cat.glCode;
      }
    }

    // AC-06: Eliminate hardcoded GL defaults (E-01)
    if (!glCode && finalType === 'OUT') {
        return { success: false, error: "فشل تحديد حساب المصروفات. يرجى التأكد من إعدادات التصنيف." };
    }
    if (!creditAccount && POSITIVE_TYPES.includes(finalType) && finalType !== 'SALE') {
        // If it's capital injection, use GL object constant instead of raw string
        creditAccount = GL.EQUITY.CAPITAL; 
    }

    const isPositive = POSITIVE_TYPES.includes(finalType);
    const decimalAmount = new Decimal(amount);

    const currentUser = await getCurrentUser();

    // AC-02: Validate shift status before treasury operations (V-01)
    if (currentUser) {
      const shiftToCheck = shiftId 
        ? await prisma.shift.findUnique({ where: { id: shiftId } })
        : (await getCurrentShiftInternal({ userId: currentUser.id })).shift;

      if (!shiftToCheck || shiftToCheck.status !== 'OPEN') {
        return { success: false, error: "يجب فتح وردية أولاً لإجراء هذه الحركة" };
      }
    }

    await prisma.$transaction(async (tx) => {
      let finalTreasuryId = treasuryId;

      // ── V-X: Treasury ID Resolution (P2003 Fix) ──
      // If treasuryId is missing but shiftId is present, find the branch's default CASH treasury
      if (!finalTreasuryId && shiftId) {
        const shift = await tx.shift.findUnique({
          where: { id: shiftId },
          include: { user: { select: { branchId: true } } }
        });
        if (shift?.user?.branchId) {
          const defaultTreasury = await tx.treasury.findFirst({
            where: { branchId: shift.user.branchId, isDefault: true, paymentMethod: 'CASH' }
          });
          finalTreasuryId = defaultTreasury?.id;
        }
      }

      // ── V-X: Atomic Balance Check & Lock ──
      // Note: We'll use the 'where' in update for atomic safety, but we pre-check for clean error messages
      if (finalTreasuryId && !isPositive) {
        const treasury = await tx.treasury.findUnique({ where: { id: finalTreasuryId } });
        if (!treasury) throw new Error("Invalid Treasury ID provided.");
        
        const currentBalance = new Decimal(treasury.balance?.toString() || "0");
        const canGoNegative = hasPermission(currentUser?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);

        if (currentBalance.lt(decimalAmount) && !canGoNegative) {
          throw new Error(`رصيد الخزنة غير كافٍ (${currentBalance.toFixed(2)}). ولا تملك صلاحية السحب بالسالب.`);
        }
      }

      const dbTx = await tx.transaction.create({
        data: { 
          type: finalType, 
          amount: decimalAmount, 
          description, 
          paymentMethod, 
          treasuryId: finalTreasuryId || undefined,
          shiftId, 
          categoryId,
          idempotencyKey: idempotencyKey ?? undefined, // 🆕 stored for replay detection
        },
        include: { category: true }
      });

      if (finalTreasuryId) {
        // AC-01: Atomic Balance Update (Race Condition Prevention)
        const canGoNegative = hasPermission(currentUser?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
        
        const updateWhere: any = { id: finalTreasuryId };
        if (!isPositive && !canGoNegative) {
            updateWhere.balance = { gte: decimalAmount };
        }

        try {
          await tx.treasury.update({
            where: updateWhere,
            data: {
              balance: isPositive
                ? { increment: decimalAmount }
                : { decrement: decimalAmount },
            },
          });
        } catch (err: any) {
          // P2025 happens if where condition (including balance check) fails
          if (err.code === 'P2025') {
            throw new Error("فشل تحديث الرصيد: رصيد غير كافٍ أو تم تغييره من قبل مستخدم آخر.");
          }
          throw err;
        }
      }

      const resolvedTreasury = finalTreasuryId ? await tx.treasury.findUnique({ where: { id: finalTreasuryId }, select: { glCode: true, branchId: true } }) : null;
      const debitAccount = resolvedTreasury?.glCode || PAYMENT_METHOD_GL_MAP[paymentMethod.toUpperCase()] || GL.ASSETS.CASH;

      const targetBranchId = resolvedTreasury?.branchId || undefined;

      // Determine category Label for JournalEntry
      const categoryLabel = dbTx.category?.name || (isPositive ? "إيداع" : "مصاريف");

      if (finalType === 'OUT') {
        if (!glCode) throw new Error("GL Code mandatory for withdrawals");
        await AccountingEngine.recordTransaction({
          description: `${categoryLabel}: ${description}`,
          reference: dbTx.id,
          date: new Date(),
          branchId: targetBranchId,
          transactionId: dbTx.id, // 🆕 Link JE to Transaction
          lines: [
            { accountCode: glCode, debit: decimalAmount.toNumber(), credit: 0, description },
            { accountCode: debitAccount, debit: 0, credit: decimalAmount.toNumber(), description: `${paymentMethod} Withdrawal` }
          ]
        }, tx);
      } else if (isPositive) {
        if (!creditAccount && finalType !== 'SALE') throw new Error("Credit account mandatory for deposits");
        await AccountingEngine.recordTransaction({
          description: `${categoryLabel}: ${description}`,
          reference: dbTx.id,
          date: new Date(),
          branchId: targetBranchId,
          transactionId: dbTx.id, // 🆕 Link JE to Transaction
          lines: [
            { accountCode: debitAccount, debit: decimalAmount.toNumber(), credit: 0, description: `${paymentMethod} Deposit` },
            { accountCode: creditAccount!, debit: 0, credit: decimalAmount.toNumber(), description: categoryLabel }
          ]
        }, tx);
      }
    });

    revalidatePath("/treasury");
    return { success: true };
  } catch (error: any) {
    console.error("Treasury Transaction Error:", error);
    return { success: false, error: error.message || "Failed to add transaction" };
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
    
    // TR-03 Guard: Prohibit amount edits on posted transactions
    if (existing && !new Decimal(existing.amount.toString()).eq(data.amount)) {
        return { success: false, error: 'لا يمكن تعديل مبلغ حركة مُرحَّلة. يرجى إلغاء الحركة وإعادة ترحيلها.' };
    }

    if (existing) {
      const currentUser = await getCurrentUser();
      await prisma.auditLog.create({
        data: {
          entityType: "TRANSACTION",
          entityId: id,
          action: "UPDATE",
          previousData: JSON.stringify({
            type: existing.type,
            amount: new Decimal(existing.amount.toString()).toNumber(),
            description: existing.description,
            paymentMethod: existing.paymentMethod,
          }),
          newData: JSON.stringify(data),
          reason,
          user: currentUser?.username || currentUser?.name || undefined,
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
    const amountDec = new Decimal(existing.amount.toString());
    const absAmount = amountDec.abs();
    const isIncome = IN_TYPES.has(existing.type) && amountDec.gt(0);

    await prisma.$transaction(async (tx) => {
      const currentUser = await getCurrentUser();
      
      // 1. Audit trail (A-01: Add user tracking)
      await tx.auditLog.create({
        data: {
          entityType: "TRANSACTION",
          entityId: id,
          action: "SOFT_DELETE",
          previousData: JSON.stringify({
            type: existing.type,
            amount: amountDec.toNumber(),
            treasuryId: existing.treasuryId,
            description: existing.description,
          }),
          newData: null,
          reason,
          user: currentUser?.username || currentUser?.name || undefined,
        },
      });

      // 2. Soft-delete the record
      await tx.transaction.update({
        where: { id },
        data: { deletedAt: new Date(), deletedReason: reason },
      });

      // 3. Reverse the physical balance if the transaction belongs to a treasury
      if (existing.treasuryId && absAmount.gt(0)) {
        // AC-01: Atomic Balance Check (Race Condition Prevention)
        const canGoNegative = hasPermission(currentUser?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
        
        const updateWhere: any = { id: existing.treasuryId };
        
        // If we are deleting income, the balance will DECREASE.
        // We must ensure the treasury has enough balance to support this decrease if negative is not allowed.
        if (isIncome && !canGoNegative) {
            updateWhere.balance = { gte: absAmount };
        }

        try {
          await tx.treasury.update({
            where: updateWhere,
            data: {
              balance: isIncome
                ? { decrement: absAmount }  // Was income -> remove it (Atomic decrease)
                : { increment: absAmount }, // Was expense -> add it back
            },
          });
        } catch (err: any) {
          if (err.code === 'P2025') {
            throw new Error(`تعذر الحذف: رصيد الخزنة غير كافٍ لإتمام عملية الاسترجاع (${absAmount.toFixed(2)}).`);
          }
          throw err;
        }
      }

      // 4. Reverse Accounting Entries (Integration)
      const { FinancialReversalService } = await import("@/lib/financial-reversal-service");
      
      // B26: If HQ Transfer, reverse the sibling transaction as well
      if (['INTER_HQ_IN', 'INTER_HQ_OUT'].includes(existing.type)) {
          await FinancialReversalService.reverseAccountingEntries(tx, existing.id, reason);
          if (existing.relatedTransactionId) {
              await FinancialReversalService.reverseAccountingEntries(tx, existing.relatedTransactionId, reason);
          }
      } else {
          await FinancialReversalService.reverseAccountingEntries(tx, id, reason);
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
  paymentMethod?: string;
}) {
  try {
    const { ensureMainBranch } = await import('@/lib/ensure-main-branch');
    const mainBranchId = await ensureMainBranch();

    if (data.isDefault) {
      await prisma.treasury.updateMany({
        where: { branchId: mainBranchId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const treasury = await prisma.treasury.create({
      data: {
        name: data.name,
        branchId: mainBranchId,
        isDefault: data.isDefault || false,
        paymentMethod: data.paymentMethod || "CASH",
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
    if (!new Decimal(treasury.balance.toString()).isZero()) {
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
    const { ensureMainBranch } = await import('@/lib/ensure-main-branch');
    const branchId = await ensureMainBranch();

    const treasuries = await prisma.treasury.findMany({
      where: { deletedAt: null, branchId },
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
    
    // AC-06: Validate GL codes exist before using in transfers (V-04)
    const fromGlCode = fromTreasury.glCode || (PAYMENT_METHOD_GL_MAP[fromTreasury.paymentMethod?.toUpperCase() ?? 'CASH'] || '1000');
    const toGlCode = toTreasury.glCode || (PAYMENT_METHOD_GL_MAP[toTreasury.paymentMethod?.toUpperCase() ?? 'CASH'] || '1000');
    
    if (!fromGlCode || !toGlCode) {
        return { success: false, error: "فشل تحديد حسابات الأستاذ لهذا التحويل. يرجى مراجعة إعدادات الخزينة." };
    }

    // Verify GL accounts exist
    const [fromGlAccount, toGlAccount] = await Promise.all([
      prisma.account.findUnique({ where: { code: fromGlCode } }),
      prisma.account.findUnique({ where: { code: toGlCode } })
    ]);
    
    if (!fromGlAccount) {
      return { success: false, error: `حساب الأستاذ الخزنة المصدر "${fromGlCode}" غير موجود` };
    }
    if (!toGlAccount) {
      return { success: false, error: `حساب الأستاذ الخزنة الهدف "${toGlCode}" غير موجود` };
    }

    const currentUser = await getCurrentUser();
    
    // AC-02: Shift Validation for Transfers (V-01)
    // Only enforce for branch-to-branch or branch-to-safe if the user is a cashier
    const shiftResult = await getCurrentShiftInternal({ userId: currentUser?.id || "" });
    if (!shiftResult.shift || shiftResult.shift.status !== 'OPEN') {
        const isGlobalAdmin = currentUser?.isGlobalAdmin || hasPermission(currentUser?.permissions, PERMISSIONS.TREASURY_MANAGE);
        if (!isGlobalAdmin) {
            return { success: false, error: "يجب فتح وردية لإتمام عملية التحويل بين الخزائن الفرعية" };
        }
    }

    const amountDec = new Decimal(data.amount);
    const fromBalance = new Decimal(fromTreasury.balance.toString());

    // Check permission for negative balance (Pre-check for UI UX)
    if (fromBalance.lt(amountDec)) {
      const canGoNegative = hasPermission(currentUser?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
      if (!canGoNegative) {
        return { success: false, error: `رصيد الخزنة غير كافٍ. الرصيد الحالي: ${fromBalance.toFixed(2)}. ولا تملك صلاحية السحب بالسالب.` };
      }
    }

    const method = data.paymentMethod || "CASH";
    const desc = data.description || `تحويل من ${fromTreasury.name} إلى ${toTreasury.name}`;

    await prisma.$transaction(async (tx) => {
      // 1. Deduct from source with Atomic check
      const canGoNegative = hasPermission(currentUser?.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);
      const updateWhere: any = { id: data.fromTreasuryId };
      if (!canGoNegative) {
          updateWhere.balance = { gte: amountDec };
      }

      try {
        await tx.treasury.update({
          where: updateWhere,
          data: { balance: { decrement: amountDec } },
        });
      } catch (err: any) {
        if (err.code === 'P2025') throw new Error("فشل الخصم من المصدر: رصيد غير كافٍ أو تم تغيير الرصيد.");
        throw err;
      }
      const sourceTx = await tx.transaction.create({
        data: {
          type: "TRANSFER_OUT",
          amount: amountDec,
          description: desc,
          paymentMethod: method,
          treasuryId: data.fromTreasuryId,
        },
      });

      // 2. Add to destination
      await tx.treasury.update({
        where: { id: data.toTreasuryId },
        data: { balance: { increment: amountDec } },
      });
      const destTx = await tx.transaction.create({
        data: {
          type: "TRANSFER_IN",
          amount: amountDec,
          description: desc,
          paymentMethod: method,
          treasuryId: data.toTreasuryId,
          relatedTransactionId: sourceTx.id, // Link them at the transaction level
        },
      });

      // 3. Accounting: Record inter-fund transfer with correct per-treasury GL codes
      const { AccountingEngine } = await import('@/lib/accounting/transaction-factory');
      const fromBranchId = fromTreasury.branchId ?? undefined;
      
      await AccountingEngine.recordTransaction({
          description: `Inter-Fund Transfer: ${fromTreasury.name} → ${toTreasury.name}`,
          reference: `TRF-${sourceTx.id.slice(0, 8)}`, // Use part of ID for stable reference
          date: new Date(),
          branchId: fromBranchId,
          transactionId: sourceTx.id, // 🆕 Link JE to the source movement
          lines: [
              { accountCode: toGlCode,   debit: amountDec.toNumber(), credit: 0,                   description: `Received by ${toTreasury.name} (Ref: ${destTx.id.slice(0, 8)})` },
              { accountCode: fromGlCode, debit: 0,                   credit: amountDec.toNumber(), description: `Sent from ${fromTreasury.name}` }
          ]
      }, tx);
    });

    revalidatePath("/treasury");
    return { success: true };
  } catch (error) {
    return { success: false, error: "فشل تنفيذ التحويل" };
  }
}
