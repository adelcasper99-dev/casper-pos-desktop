"use server";

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { secureAction } from "@/lib/safe-action";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "./auth";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { revalidatePath } from "next/cache";
import { deductTreasuryBalance } from "@/lib/treasury-guard";

/**
 * processWalletTransaction
 * 
 * Logic (Store/Cashier perspective):
 * - DEPOSIT (Cash-In / شحن محفظة): Customer pays cash to store -> Store sends digital balance to customer.
 *   Digital safe decreases (guarded deduction: balance leaves store wallet).
 *   Physical drawer increases (increment: cash received + commission).
 * 
 * - WITHDRAWAL (Cash-Out / سحب كاش): Customer sends digital balance to store -> Store pays physical cash to customer.
 *   Digital safe increases (increment: balance received in store wallet).
 *   Physical drawer decreases (guarded deduction: physical cash paid to customer).
 */
export const processWalletTransaction = secureAction(async (data: {
    operationType: 'DEPOSIT' | 'WITHDRAWAL';
    digitalTreasuryId: string;
    physicalTreasuryId: string;
    baseAmount: number | string;
    commission: number | string;
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
        if (!shift) {
            throw new Error("يجب فتح وردية أولاً لإجراء هذه الحركة");
        }

        const canGoNegative = hasPermission(user.permissions, PERMISSIONS.TREASURY_ALLOW_NEGATIVE_BALANCE);

        // Note: 'DEPOSIT' = Customer deposits cash to branch -> Digital safe decreases (transfer to customer wallet), Physical cash increases.
        //       'WITHDRAW' = Customer withdraws cash from wallet -> Digital safe increases, Physical cash decreases.
        // 🟢 DIGITAL MOVEMENT
        if (data.operationType === 'DEPOSIT') {
            await deductTreasuryBalance({
                tx,
                treasuryId: digitalSafe.id,
                amount: baseAmount,
                actionDescription: `إيداع محفظة إلكترونية - الرصيد الرقمي`,
                allowOverdraftOverride: canGoNegative ? true : undefined,
            });
        } else {
            await tx.treasury.update({
                where: { id: digitalSafe.id },
                data: { balance: { increment: baseAmount } }
            });
        }
        
        const digitalTx = await tx.transaction.create({
            data: {
                type: data.operationType === 'DEPOSIT' ? 'EXPENSE' : 'IN',
                amount: baseAmount,
                description: `E-Wallet ${data.operationType}: ${data.notes || ''} ${data.idempotencyKey ? `[IDEM:${data.idempotencyKey}]` : ''} (Digital Side)`,
                treasuryId: digitalSafe.id,
                paymentMethod: digitalSafe.paymentMethod || 'WALLET',
                shiftId: shift.id,
                referenceType: 'WALLET_TRANSACTION'
            }
        });

        // 🟢 PHYSICAL MOVEMENT
        if (data.operationType === 'DEPOSIT') {
            await tx.treasury.update({
                where: { id: physicalSafe.id },
                data: { balance: { increment: totalPhysicalMovement } }
            });
        } else {
            await deductTreasuryBalance({
                tx,
                treasuryId: physicalSafe.id,
                amount: totalPhysicalMovement,
                actionDescription: `سحب محفظة إلكترونية - النقد الفعلي`,
                allowOverdraftOverride: canGoNegative ? true : undefined,
            });
        }

        const physicalTx = await tx.transaction.create({
            data: {
                type: data.operationType === 'DEPOSIT' ? 'IN' : 'EXPENSE',
                amount: totalPhysicalMovement,
                description: `E-Wallet ${data.operationType}: ${data.notes || ''} (Physical Side)`,
                treasuryId: physicalSafe.id,
                paymentMethod: physicalSafe.paymentMethod || 'CASH',
                shiftId: shift.id,
                referenceType: 'WALLET_TRANSACTION'
            }
        });

        // 🟢 ACCOUNTING JOURNAL ENTRY
        // Withdrawal: DR Physical (Base+Comm), CR Digital (Base), CR Revenue (Comm)
        // Deposit:    DR Digital (Base), CR Physical (Base-Comm), CR Revenue (Comm)
        const journalLines = data.operationType === 'WITHDRAWAL' 
            ? [
                { accountCode: physicalSafe.glCode || '1000', debit: totalPhysicalMovement, credit: 0, description: 'Physical Cash Movement (In)' },
                { accountCode: digitalSafe.glCode || '1020', debit: 0, credit: baseAmount, description: 'Digital Wallet Movement (Out)' },
                { accountCode: '4500', debit: 0, credit: commission, description: 'E-Wallet Commission' }
            ]
            : [
                { accountCode: digitalSafe.glCode || '1020', debit: baseAmount, credit: 0, description: 'Digital Wallet Movement (In)' },
                { accountCode: physicalSafe.glCode || '1000', debit: 0, credit: totalPhysicalMovement, description: 'Physical Cash Movement (Out)' },
                { accountCode: '4500', debit: 0, credit: commission, description: 'E-Wallet Commission' }
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
                        totalCashSales: { decrement: totalPhysicalMovement },
                        totalWalletSales: { increment: baseAmount }
                    }
                });
            } else {
                // Withdrawal: Cash In (Physical), Wallet Out (Digital)
                await tx.shift.update({
                    where: { id: shift.id },
                    data: {
                        totalCashSales: { increment: totalPhysicalMovement },
                        totalWalletSales: { decrement: baseAmount }
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
