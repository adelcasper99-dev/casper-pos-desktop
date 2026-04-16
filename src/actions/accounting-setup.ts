"use server";

import { prisma } from "@/lib/prisma";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { revalidatePath } from "next/cache";
import { GL } from "@/shared/constants/accounting-mappings";

export async function setOpeningBalances(data: {
    cash: number;
    bank: number;
    inventory: number;
    receivables: number;
    payables: number;
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

        await prisma.$transaction(async (tx) => {
            const lines = [];

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
