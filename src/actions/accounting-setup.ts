"use server";

import { prisma } from "@/lib/prisma";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { revalidatePath } from "next/cache";

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

            // Debits (Assets)
            if (data.cash > 0) {
                lines.push({ accountCode: '1000', debit: data.cash, credit: 0, description: "رصيد افتتاحي - نقدية بالخزينة" });
                // Note: We might want to actually fund the primary Treasury here too, but for accounting it's enough to hit the GL.
                // Assuming we update the raw DB treasury balance:
                const defaultTreasury = await tx.treasury.findFirst({ where: { isDefault: true, deletedAt: null } });
                if (defaultTreasury) {
                    await tx.treasury.update({ where: { id: defaultTreasury.id }, data: { balance: { increment: data.cash } } });
                }
            }
            if (data.bank > 0) {
                lines.push({ accountCode: '1010', debit: data.bank, credit: 0, description: "رصيد افتتاحي - بنك" });
            }
            if (data.inventory > 0) {
                lines.push({ accountCode: '1200', debit: data.inventory, credit: 0, description: "رصيد افتتاحي - مخزون" });
            }
            if (data.receivables > 0) {
                lines.push({ accountCode: '1100', debit: data.receivables, credit: 0, description: "رصيد افتتاحي - عملاء" });
            }

            // Credits (Liabilities & Equity)
            if (data.payables > 0) {
                lines.push({ accountCode: '2000', debit: 0, credit: data.payables, description: "رصيد افتتاحي - موردين" });
            }
            if (data.equity > 0) {
                lines.push({ accountCode: '3000', debit: 0, credit: data.equity, description: "رصيد افتتاحي - رأس المال / حقوق ملكية" });
            } else if (data.equity < 0) {
                // Technically implies negative equity (Deficit) -> Debit retained earnings
                lines.push({ accountCode: '3000', debit: Math.abs(data.equity), credit: 0, description: "رصيد افتتاحي - عجز حقوق ملكية" });
            }

            if (lines.length > 0) {
                await AccountingEngine.recordTransaction({
                    description: "القيد الافتتاحي - Opening Balances",
                    reference: "OPENING-BAL",
                    date: new Date(),
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
