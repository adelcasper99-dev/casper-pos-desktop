"use server";

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentUser } from "./auth";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { revalidatePath } from "next/cache";

/**
 * processWalletTransaction
 * 
 * Logic:
 * DEPOSIT: Decrement digital treasury by base. Increment physical treasury by (base + commission).
 * WITHDRAWAL: Increment digital treasury by base. Decrement physical treasury by (base - commission).
 */
export const processWalletTransaction = secureAction(async (data: {
    operationType: 'DEPOSIT' | 'WITHDRAWAL';
    digitalTreasuryId: string;
    physicalTreasuryId: string;
    baseAmount: number;
    commission: number;
    notes?: string;
    idempotencyKey?: string;
}) => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Fetch treasuries
    const [digitalSafe, physicalSafe] = await Promise.all([
        prisma.treasury.findUnique({ where: { id: data.digitalTreasuryId } }),
        prisma.treasury.findUnique({ where: { id: data.physicalTreasuryId } })
    ]);

    if (!digitalSafe || !physicalSafe) throw new Error("Safe not found");

    const baseAmount = new Decimal(data.baseAmount);
    const commission = new Decimal(data.commission);
    const totalPhysicalMovement = data.operationType === 'DEPOSIT' 
        ? baseAmount.plus(commission) 
        : baseAmount.minus(commission);

    // 2. Perform Atomic Transaction
    return await prisma.$transaction(async (tx) => {
        // 🛡️ REPLAY PROTECTION
        if (data.idempotencyKey) {
            const existing = await tx.transaction.findFirst({
                where: { description: { contains: `[IDEM:${data.idempotencyKey}]` } }
            });
            if (existing) return { success: true, message: "Transaction already processed", isIdempotentHit: true };
        }

        // 🛡️ ATOMIC BALANCE VALIDATION
        const [dSafe, pSafe] = await Promise.all([
            tx.treasury.findUnique({ where: { id: digitalSafe.id } }),
            tx.treasury.findUnique({ where: { id: physicalSafe.id } })
        ]);

        if (data.operationType === 'DEPOSIT') {
            // Deposit: Sending from Digital -> Physical
            if (new Decimal(dSafe?.balance || 0).lt(baseAmount)) {
                throw new Error(`رصيد المحفظة الرقمية غير كافٍ (${dSafe?.balance} ج.م)`);
            }
        } else {
            // Withdrawal: Sending from Physical -> Digital
            if (new Decimal(pSafe?.balance || 0).lt(totalPhysicalMovement)) {
                throw new Error(`رصيد الخزنة النقدية غير كافٍ (${pSafe?.balance} ج.م)`);
            }
        }
        // Find current open shift for this user to link transactions
        const shift = await tx.shift.findFirst({
            where: { userId: user.id, status: 'OPEN' },
            orderBy: { openedAt: 'desc' }
        });

        // 🟢 DIGITAL MOVEMENT
        const digitalUpdate = data.operationType === 'DEPOSIT' 
            ? { decrement: baseAmount.toNumber() } 
            : { increment: baseAmount.toNumber() };
        
        await tx.treasury.update({
            where: { id: digitalSafe.id },
            data: { balance: digitalUpdate }
        });

        const digitalTx = await tx.transaction.create({
            data: {
                type: data.operationType === 'DEPOSIT' ? 'EXPENSE' : 'IN',
                amount: baseAmount,
                description: `E-Wallet ${data.operationType}: ${data.notes || ''} ${data.idempotencyKey ? `[IDEM:${data.idempotencyKey}]` : ''} (Digital Side)`,
                treasuryId: digitalSafe.id,
                paymentMethod: digitalSafe.paymentMethod || 'WALLET',
                shiftId: shift?.id,
                referenceType: 'WALLET_TRANSACTION'
            }
        });

        // 🟢 PHYSICAL MOVEMENT
        const physicalUpdate = data.operationType === 'DEPOSIT'
            ? { increment: totalPhysicalMovement.toNumber() }
            : { decrement: totalPhysicalMovement.toNumber() };

        await tx.treasury.update({
            where: { id: physicalSafe.id },
            data: { balance: physicalUpdate }
        });

        const physicalTx = await tx.transaction.create({
            data: {
                type: data.operationType === 'DEPOSIT' ? 'IN' : 'EXPENSE',
                amount: totalPhysicalMovement,
                description: `E-Wallet ${data.operationType}: ${data.notes || ''} (Physical Side)`,
                treasuryId: physicalSafe.id,
                paymentMethod: physicalSafe.paymentMethod || 'CASH',
                shiftId: shift?.id,
                referenceType: 'WALLET_TRANSACTION'
            }
        });

        // 🟢 ACCOUNTING JOURNAL ENTRY
        // Withdrawal: DR Physical (Base+Comm), CR Digital (Base), CR Revenue (Comm)
        // Deposit:    DR Digital (Base), CR Physical (Base-Comm), CR Revenue (Comm)
        const journalLines = data.operationType === 'WITHDRAWAL' 
            ? [
                { accountCode: physicalSafe.glCode || '1000', debit: totalPhysicalMovement.toNumber(), credit: 0, description: 'Physical Cash Movement (In)' },
                { accountCode: digitalSafe.glCode || '1020', debit: 0, credit: baseAmount.toNumber(), description: 'Digital Wallet Movement (Out)' },
                { accountCode: '4500', debit: 0, credit: commission.toNumber(), description: 'E-Wallet Commission' }
            ]
            : [
                { accountCode: digitalSafe.glCode || '1020', debit: baseAmount.toNumber(), credit: 0, description: 'Digital Wallet Movement (In)' },
                { accountCode: physicalSafe.glCode || '1000', debit: 0, credit: totalPhysicalMovement.toNumber(), description: 'Physical Cash Movement (Out)' },
                { accountCode: '4500', debit: 0, credit: commission.toNumber(), description: 'E-Wallet Commission' }
            ];

        await AccountingEngine.recordTransaction({
            description: `E-Wallet ${data.operationType} Operation`,
            reference: physicalTx.id,
            branchId: user.branchId || undefined,
            lines: journalLines
        }, tx);

        // 🟢 SHIFT TOTALS UPDATE (CRITICAL FOR Z-REPORT)
        if (shift) {
            if (data.operationType === 'DEPOSIT') {
                // Deposit: Cash Out (Physical), Wallet In (Digital)
                await tx.shift.update({
                    where: { id: shift.id },
                    data: {
                        totalCashSales: { decrement: totalPhysicalMovement.toNumber() },
                        totalWalletSales: { increment: baseAmount.toNumber() }
                    }
                });
            } else {
                // Withdrawal: Cash In (Physical), Wallet Out (Digital)
                await tx.shift.update({
                    where: { id: shift.id },
                    data: {
                        totalCashSales: { increment: totalPhysicalMovement.toNumber() },
                        totalWalletSales: { decrement: baseAmount.toNumber() }
                    }
                });
            }
        }

        // Audit Log
        await tx.actionLog.create({
            data: {
                action: `WALLET_${data.operationType}`,
                userId: user.id,
                details: `Wallet ${data.operationType} of ${baseAmount} with ${commission} commission. Digital: ${digitalSafe.name}, Physical: ${physicalSafe.name}`
            }
        });

        revalidatePath("/treasury");
        return { success: true, message: "Transaction processed successfully" };
    });
}, { permission: PERMISSIONS.TREASURY_MANAGE, requireCSRF: false });
