'use server';

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { secureAction } from '@/lib/safe-action';
import { PERMISSIONS } from '@/lib/permissions';

// Get treasury data (balances by method + transactions)
export const getTreasuryData = secureAction(async (filters?: {
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
  csrfToken?: string;
}) => {
  // Build dynamic WHERE clause based on filters
  const where: Prisma.TransactionWhereInput = {};

  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      // Set to end of day
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = endDate;
    }
  }

  if (filters?.paymentMethod && filters.paymentMethod !== 'ALL') {
    where.paymentMethod = filters.paymentMethod;
  }

  // Exclude soft-deleted transactions (Phase 3 fix)
  where.deletedAt = null;

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { treasury: true },
    take: 1000 // Increased limit for exports
  });

  const { getCurrentUser } = await import('./auth');
  const user = await getCurrentUser();

  const rawTreasuries = await prisma.treasury.findMany({
    where: {
      branchId: user?.branchId || undefined,
      deletedAt: null
    }, // Filter by user branch if set
    orderBy: { isDefault: 'desc' }
  });

  // Calculate balances by payment method (from filtered transactions)
  const byMethod = transactions.reduce((acc, t) => {
    const isPositive = ['IN', 'CAPITAL', 'SALE', 'TICKET', 'CUSTOMER_PAYMENT'].includes(t.type);
    const delta = isPositive ? Number(t.amount) : -Number(t.amount);
    acc[t.paymentMethod] = (acc[t.paymentMethod] || 0) + delta;
    return acc;
  }, { CASH: 0, VISA: 0, WALLET: 0, INSTAPAY: 0 } as Record<string, number>);

  return {
    success: true,
    data: {
      byMethod,
      transactions: transactions.map(t => ({
        id: t.id,
        type: t.type,
        description: t.description,
        amount: Number(t.amount),
        paymentMethod: t.paymentMethod,
        treasuryId: t.treasuryId,
        treasuryName: t.treasury?.name,
        createdAt: t.createdAt.toISOString()
      })),
      treasuries: rawTreasuries.map(t => ({
        id: t.id,
        name: t.name,
        balance: Number(t.balance),
        isDefault: t.isDefault,
        branchId: t.branchId
      }))
    }
  };
}, { permission: PERMISSIONS.TREASURY_VIEW, requireCSRF: false });

// Add transaction
export const addTreasuryTransaction = secureAction(async (
  type: string,
  amount: number,
  description: string,
  paymentMethod: string,
  treasuryId?: string,
  csrfToken?: string
) => {
  const isPositive = ['IN', 'CAPITAL', 'SALE', 'TICKET', 'CUSTOMER_PAYMENT'].includes(type);
  const numericAmount = Number(amount);

  await prisma.$transaction(async (tx) => {
    // 1. Create Transaction
    await tx.transaction.create({
      data: {
        type,
        amount: numericAmount,
        description,
        paymentMethod,
        treasuryId
      }
    });

    // 2. Update Treasury Balance if linked
    if (treasuryId) {
      if (isPositive) {
        await tx.treasury.update({
          where: { id: treasuryId },
          data: { balance: { increment: numericAmount } }
        });
      } else {
        await tx.treasury.update({
          where: { id: treasuryId },
          data: { balance: { decrement: numericAmount } }
        });
      }
    }
  });

  return { success: true };
}, { permission: PERMISSIONS.TREASURY_MANAGE });

// Update transaction
export const updateTreasuryTransaction = secureAction(async (
  id: string,
  data: { type: string; amount: number; description: string; paymentMethod: string; csrfToken?: string },
  reason: string
) => {
  // Log audit trail
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (existing) {
    await prisma.auditLog.create({
      data: {
        entityType: 'TRANSACTION',
        entityId: id,
        action: 'UPDATE',
        previousData: JSON.stringify({
          type: existing.type,
          amount: Number(existing.amount),
          description: existing.description,
          paymentMethod: existing.paymentMethod
        }),
        newData: JSON.stringify(data),
        reason
      }
    });
  }

  await prisma.transaction.update({
    where: { id },
    data: {
      type: data.type,
      amount: data.amount,
      description: data.description,
      paymentMethod: data.paymentMethod
    }
  });

  return { success: true };
}, { permission: PERMISSIONS.TREASURY_MANAGE });

// Soft-delete transaction (Phase 3 fix - maintains audit trail)
export const deleteTreasuryTransaction = secureAction(async (
  id: string,
  reason: string,
  csrfToken?: string
) => {
  const { getCurrentUser } = await import('./auth');
  const currentUser = await getCurrentUser();

  const existing = await prisma.transaction.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Transaction not found');
  }

  if (existing.deletedAt) {
    throw new Error('Transaction has already been deleted');
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      entityType: 'TRANSACTION',
      entityId: id,
      action: 'SOFT_DELETE',
      previousData: JSON.stringify({
        type: existing.type,
        amount: Number(existing.amount),
        description: existing.description,
        paymentMethod: existing.paymentMethod
      }),
      reason,
      user: currentUser?.username || currentUser?.name || 'system'
    }
  });

  // Soft delete: set deletedAt instead of removing record
  await prisma.transaction.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedBy: currentUser?.username || currentUser?.name || 'system',
      deletedReason: reason
    }
  });

  return { success: true, message: 'Transaction deleted (audit trail preserved)' };
}, { permission: PERMISSIONS.TREASURY_MANAGE });

// Create Treasury
export const createTreasury = secureAction(async (
  data: { name: string; branchId: string; isDefault?: boolean; csrfToken?: string }
) => {
  // If this is set as default, unset other defaults for this branch
  if (data.isDefault) {
    await prisma.treasury.updateMany({
      where: { branchId: data.branchId, isDefault: true },
      data: { isDefault: false }
    });
  }

  try {
    const treasury = await prisma.treasury.create({
      data: {
        name: data.name,
        branchId: data.branchId,
        isDefault: data.isDefault || false,
      }
    });
    return { success: true, data: treasury };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, error: "A treasury with this name already exists in this branch." };
    }
    throw error;
  }
}, { permission: PERMISSIONS.TREASURY_MANAGE });

// Delete Treasury (Soft Delete)
export const deleteTreasury = secureAction(async (id: string) => {
  const treasury = await prisma.treasury.findUnique({ where: { id } });
  if (!treasury) throw new Error("Treasury not found");

  if (Number(treasury.balance) !== 0) {
    return { success: false, error: "Cannot delete a treasury with a non-zero balance. Please transfer funds first." };
  }

  await prisma.treasury.update({
    where: { id },
    data: { deletedAt: new Date() }
  });

  return { success: true };
}, { permission: PERMISSIONS.TREASURY_MANAGE });

// Get all treasuries
export const getTreasuries = secureAction(async () => {
  const treasuries = await prisma.treasury.findMany({
    where: { deletedAt: null },
    include: { branch: true },
    orderBy: { createdAt: 'desc' }
  });

  const serialized = treasuries.map(t => ({
    ...t,
    balance: Number(t.balance)
  }));

  return { success: true, data: serialized };
}, { permission: PERMISSIONS.TREASURY_VIEW, requireCSRF: false });
