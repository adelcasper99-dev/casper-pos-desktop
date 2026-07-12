"use server";

import { prisma } from "@/lib/prisma";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { revalidatePath } from "next/cache";
import { GL } from "@/shared/constants/accounting-mappings";
import Decimal from "decimal.js";

import { Prisma } from "@prisma/client";

export async function setOpeningBalances(data: {
    cash: number;
    bank: number;
    inventory: number;
    receivables: number;
    payables: number;
    fixedAssets?: number;
    vehicles?: number;
    depreciation?: number;
    equity: number;
}) {
    try {
        // Prevent duplicate open balances
        const existingOpening = await prisma.journalEntry.findFirst({
            where: { reference: 'OPENING-BAL' }
        });

        if (existingOpening) {
            return { success: false, error: "تم إعداد الأرصدة الافتتاحية من قبل. لا يمكن تكرار القيد الافتتاحي." };
        }

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const lines: Array<{ accountCode: string; debit: number; credit: number; description: string }> = [];

            // Fetch default treasury for branch context tagging
            const defaultTreasury = await tx.treasury.findFirst({ where: { isDefault: true, deletedAt: null } });

            // Debits (Assets)
            if (data.cash > 0) {
                lines.push({ accountCode: GL.ASSETS.CASH, debit: data.cash, credit: 0, description: "رصيد افتتاحي - نقدية بالخزينة" });
                // Note: We might want to actually fund the primary Treasury here too, but for accounting it's enough to hit the GL.
                // Assuming we update the raw DB treasury balance:
                if (defaultTreasury) {
                    await tx.treasury.update({ where: { id: defaultTreasury.id }, data: { balance: { increment: data.cash } } });
                }
            }
            if (data.bank > 0) {
                lines.push({ accountCode: GL.ASSETS.BANK, debit: data.bank, credit: 0, description: "رصيد افتتاحي - بنك" });
            }
            if (data.inventory > 0) {
                lines.push({ accountCode: GL.ASSETS.INVENTORY, debit: data.inventory, credit: 0, description: "رصيد افتتاحي - مخزون" });
            }
            if (data.receivables > 0) {
                lines.push({ accountCode: GL.ASSETS.RECEIVABLES, debit: data.receivables, credit: 0, description: "رصيد افتتاحي - عملاء" });
            }
            if (data.fixedAssets && data.fixedAssets > 0) {
                lines.push({ accountCode: GL.ASSETS.FIXED_ASSETS, debit: data.fixedAssets, credit: 0, description: "رصيد افتتاحي - معدات وأثاث" });
            }
            if (data.vehicles && data.vehicles > 0) {
                lines.push({ accountCode: GL.ASSETS.FIXED_ASSETS, debit: data.vehicles, credit: 0, description: "رصيد افتتاحي - وسائل نقل" });
            }
            if (data.depreciation && data.depreciation > 0) {
                lines.push({ accountCode: GL.ASSETS.ACCUM_DEPRECIATION, debit: 0, credit: data.depreciation, description: "رصيد افتتاحي - إهلاك متراكم" });
            }

            // Credits (Liabilities & Equity)
            if (data.payables > 0) {
                lines.push({ accountCode: GL.LIABILITIES.PAYABLES, debit: 0, credit: data.payables, description: "رصيد افتتاحي - موردين" });
            }
            if (data.equity > 0) {
                lines.push({ accountCode: GL.EQUITY.CAPITAL, debit: 0, credit: data.equity, description: "رصيد افتتاحي - رأس المال / حقوق ملكية" });
            } else if (data.equity < 0) {
                // Technically implies negative equity (Deficit) -> Debit retained earnings
                lines.push({ accountCode: GL.EQUITY.CAPITAL, debit: Math.abs(data.equity), credit: 0, description: "رصيد افتتاحي - عجز حقوق ملكية" });
            }

            if (lines.length > 0) {
                await AccountingEngine.recordTransaction({
                    description: "القيد الافتتاحي - Opening Balances",
                    reference: "OPENING-BAL",
                    date: new Date(),
                    branchId: defaultTreasury?.branchId ?? undefined,
                    lines,
                }, tx);
            }
        });

        revalidatePath("/(routes)/accounting", "layout");
        return { success: true };
    } catch (error: any) {
        console.error("Opening Balances Error:", error);
        return { success: false, error: error.message || "Failed to save opening balances" };
    }
}

/**
 * Adds a supplementary opening balance adjustment entry.
 * Used when the main OPENING-BAL entry already exists and the user needs to
 * add fixed assets (equipment, furniture, vehicles) or correct depreciation.
 *
 * Creates a balanced journal entry: asset debits offset by GL 3999 (Opening Balance Equity).
 */
export async function updateOpeningBalances(data: {
    fixedAssets?: number;   // معدات وأثاث → GL 1300
    vehicles?: number;      // سيارات → GL 1300 (same account, different description)
    depreciation?: number;  // إهلاك متراكم → GL 1310 (contra-asset: credit)
}) {
    try {
        if (!data.fixedAssets && !data.vehicles && !data.depreciation) {
            return { success: false, error: "لم يتم إدخال أي قيم للتعديل" };
        }

        // Count existing adjustment entries to generate sequential reference
        const adjCount = await prisma.journalEntry.count({
            where: { reference: { startsWith: 'OPENING-BAL-ADJ' } }
        });
        const reference = `OPENING-BAL-ADJ-${String(adjCount + 1).padStart(3, '0')}`;

        const defaultTreasury = await prisma.treasury.findFirst({ where: { isDefault: true, deletedAt: null } });

        const lines: { accountCode: string; debit: number; credit: number; description: string }[] = [];
        let netAssetAddition = new Decimal(0);

        if (data.fixedAssets && data.fixedAssets > 0) {
            lines.push({ accountCode: GL.ASSETS.FIXED_ASSETS, debit: data.fixedAssets, credit: 0, description: "تعديل افتتاحي - معدات وأثاث" });
            netAssetAddition = netAssetAddition.plus(data.fixedAssets);
        }
        if (data.vehicles && data.vehicles > 0) {
            lines.push({ accountCode: GL.ASSETS.FIXED_ASSETS, debit: data.vehicles, credit: 0, description: "تعديل افتتاحي - وسائل نقل" });
            netAssetAddition = netAssetAddition.plus(data.vehicles);
        }
        if (data.depreciation && data.depreciation > 0) {
            // Contra-asset: credit reduces the net asset value
            lines.push({ accountCode: GL.ASSETS.ACCUM_DEPRECIATION, debit: 0, credit: data.depreciation, description: "تعديل افتتاحي - إهلاك متراكم" });
            netAssetAddition = netAssetAddition.minus(data.depreciation);
        }

        // Balancing line: net equity change goes to Opening Balance Equity (3999)
        if (netAssetAddition.gt(0)) {
            lines.push({ accountCode: GL.EQUITY.OPENING_BALANCE, debit: 0, credit: netAssetAddition.toNumber(), description: "تعديل افتتاحي - حقوق ملكية مقابلة" });
        } else if (netAssetAddition.lt(0)) {
            lines.push({ accountCode: GL.EQUITY.OPENING_BALANCE, debit: netAssetAddition.abs().toNumber(), credit: 0, description: "تعديل افتتاحي - عجز حقوق ملكية" });
        }

        await AccountingEngine.recordTransaction({
            description: "تعديل الأرصدة الافتتاحية - Opening Balance Adjustment",
            reference,
            date: new Date(),
            branchId: defaultTreasury?.branchId ?? undefined,
            lines,
        });

        revalidatePath("/(routes)/accounting", "layout");
        return { success: true, reference };
    } catch (error: any) {
        console.error("Opening Balance Adjustment Error:", error);
        return { success: false, error: error.message || "Failed to save opening balance adjustment" };
    }
}
