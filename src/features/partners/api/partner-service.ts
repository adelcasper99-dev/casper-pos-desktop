"use server";

import { prisma } from "@/lib/prisma";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { GL } from "@/shared/constants/accounting-mappings";
import { getSession } from "@/lib/auth";

/**
 * Creates a new partner and generates their GL accounts.
 * Validates that total profit share doesn't exceed 100%.
 */
export async function createPartner(data: { name: string; phone?: string; profitShare: number }) {
    try {
        if (data.profitShare <= 0) throw new Error("Profit share must be greater than 0");

        await prisma.$transaction(async (tx) => {
            // Validate Total Profit Share <= 100%
            const existingPartners = await tx.partner.findMany();
            const currentTotal = existingPartners.reduce((sum, p) => sum.plus(p.profitShare), new Decimal(0));
            if (currentTotal.plus(data.profitShare).gt(100)) {
                throw new Error("إجمالي نسب الشركاء لا يمكن أن يتجاوز 100%");
            }

            // Determine Next GL Codes (30XX for Capital, 32XX for Drawings)
            const lastCapitalAccount = await tx.account.findFirst({
                where: { code: { gte: '3001', lt: '3100' }, type: 'EQUITY' },
                orderBy: { code: 'desc' }
            });
            const nextCodeNum = lastCapitalAccount ? parseInt(lastCapitalAccount.code) + 1 : 3001;
            if (nextCodeNum > 3099) {
                throw new Error("لقد تم الوصول للحد الأقصى لعدد الشركاء المسموح به (99 شريكاً). يرجى التواصل مع الدعم الفني.");
            }
            const capitalGlCode = nextCodeNum.toString();
            const currentGlCode = (nextCodeNum + 200).toString(); // e.g., 3001 -> 3201

            // Create Partner
            const partner = await tx.partner.create({
                data: {
                    name: data.name,
                    phone: data.phone,
                    profitShare: data.profitShare,
                    capitalGlCode,
                    currentGlCode
                }
            });

            // Seed GL Accounts
            await tx.account.createMany({
                data: [
                    { code: capitalGlCode, name: `رأس مال - ${data.name}`, type: 'EQUITY', isSystem: true },
                    { code: currentGlCode, name: `جاري - ${data.name}`, type: 'EQUITY', isSystem: true }
                ]
            });
        });

        revalidatePath("/(routes)/accounting/partners");
        return { success: true };
    } catch (error: any) {
        console.error("createPartner error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Adds a partner transaction (Deposit or Drawing) and records the journal entry.
 */
export async function createPartnerTransaction(data: { partnerId: string; type: "DEPOSIT" | "DRAWING"; amount: number; treasuryId: string; description?: string }) {
    try {
        if (data.amount <= 0) throw new Error("Amount must be greater than 0");

        await prisma.$transaction(async (tx) => {
            const partner = await tx.partner.findUniqueOrThrow({ where: { id: data.partnerId } });
            const treasury = await tx.treasury.findUniqueOrThrow({ where: { id: data.treasuryId } });

            // Create Partner Transaction
            await tx.partnerTransaction.create({
                data: {
                    partnerId: partner.id,
                    type: data.type,
                    amount: data.amount,
                    description: data.description
                }
            });

            // Update Treasury
            const amountDelta = data.type === "DEPOSIT" ? data.amount : -data.amount;
            await tx.treasury.update({
                where: { id: treasury.id },
                data: { balance: { increment: amountDelta } }
            });

            // Journal Entry
            const lines: { accountCode: string; debit: number; credit: number; description: string }[] = [];
            const treasuryGl = treasury.glCode || GL.ASSETS.CASH;

            if (data.type === "DEPOSIT") {
                // Deposit: Dr Cash, Cr Capital
                lines.push({ accountCode: treasuryGl, debit: data.amount, credit: 0, description: `إيداع شريك - ${partner.name}` });
                lines.push({ accountCode: partner.capitalGlCode, debit: 0, credit: data.amount, description: `إيداع رأس مال - ${partner.name}` });
            } else {
                // Drawing: Dr Current Account, Cr Cash
                lines.push({ accountCode: partner.currentGlCode, debit: data.amount, credit: 0, description: `مسحوبات شريك - ${partner.name}` });
                lines.push({ accountCode: treasuryGl, debit: 0, credit: data.amount, description: `خروج نقدية لمسحوبات - ${partner.name}` });
            }

            await AccountingEngine.recordTransaction({
                description: data.description || (data.type === "DEPOSIT" ? "إيداع شريك" : "مسحوبات شريك"),
                reference: `PTR-${Date.now()}`,
                date: new Date(),
                branchId: treasury.branchId,
                lines,
            }, tx);
        });

        revalidatePath("/(routes)/accounting/partners");
        return { success: true };
    } catch (error: any) {
        console.error("createPartnerTransaction error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Distributes profit/loss to partners based on their shares.
 */
export async function distributeProfitLoss(data: { periodFrom: Date; periodTo: Date; netAmount: number; branchId?: string }) {
    try {
        const session = await getSession();
        const branchId = data.branchId || session?.user?.branchId || undefined;

        await prisma.$transaction(async (tx) => {
            const partners = await tx.partner.findMany();
            if (partners.length === 0) throw new Error("لا يوجد شركاء");

            const currentTotal = partners.reduce((sum, p) => sum.plus(p.profitShare), new Decimal(0));
            if (!currentTotal.equals(100)) throw new Error("يجب أن يكون إجمالي نسب الشركاء 100% لتوزيع الأرباح");

            const isProfit = new Decimal(data.netAmount).gt(0);
            const absoluteAmountDec = new Decimal(data.netAmount).abs();
            const absoluteAmount = absoluteAmountDec.toNumber();
            
            const idempotencyKey = `DIST-${data.periodFrom.toISOString().split('T')[0]}-${data.periodTo.toISOString().split('T')[0]}`;
            
            // Check for previous distribution
            const existingEntry = await tx.journalEntry.findUnique({ where: { idempotencyKey } });
            if (existingEntry) throw new Error("تم توزيع أرباح هذه الفترة من قبل");

            const lines: { accountCode: string; debit: number; credit: number; description: string }[] = [];
            // Dr/Cr Retained Earnings (3300)
            if (isProfit) {
                // We debit Retained Earnings to clear it out to Partners
                lines.push({ accountCode: GL.EQUITY.RETAINED_EARNINGS, debit: absoluteAmount, credit: 0, description: "توزيع أرباح" });
            } else {
                // We credit Retained Earnings to clear the loss from Partners
                lines.push({ accountCode: GL.EQUITY.RETAINED_EARNINGS, debit: 0, credit: absoluteAmount, description: "توزيع خسائر" });
            }

            for (const partner of partners) {
                const shareAmount = absoluteAmountDec.times(partner.profitShare).dividedBy(100).toNumber();

                // Record PartnerTransaction
                await tx.partnerTransaction.create({
                    data: {
                        partnerId: partner.id,
                        type: "DISTRIBUTION",
                        amount: isProfit ? shareAmount : -shareAmount,
                        description: `توزيع ${isProfit ? 'أرباح' : 'خسائر'} الفترة`,
                        periodFrom: data.periodFrom,
                        periodTo: data.periodTo
                    }
                });

                // Record Journal Line
                if (isProfit) {
                    // Credit Current Account (Increase Equity)
                    lines.push({ accountCode: partner.currentGlCode, debit: 0, credit: shareAmount, description: `أرباح موزعة - ${partner.name}` });
                } else {
                    // Debit Current Account (Decrease Equity)
                    lines.push({ accountCode: partner.currentGlCode, debit: shareAmount, credit: 0, description: `خسائر موزعة - ${partner.name}` });
                }
            }

            // Generate Journal Entry
            await AccountingEngine.recordTransaction({
                description: `توزيع ${isProfit ? 'أرباح' : 'خسائر'} من ${data.periodFrom.toLocaleDateString()} إلى ${data.periodTo.toLocaleDateString()}`,
                reference: `DIST-${Date.now()}`,
                date: new Date(),
                branchId,
                idempotencyKey,
                lines,
            }, tx);
        });

        revalidatePath("/(routes)/accounting/partners");
        return { success: true };
    } catch (error: any) {
        console.error("distributeProfitLoss error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Fetches all partners along with their current balances.
 */
export async function getPartners() {
    try {
        const partners = await prisma.partner.findMany({
            orderBy: { createdAt: 'asc' }
        });

        // For each partner, we need to calculate the balance of their Capital and Current GL accounts
        const partnersWithBalances = await Promise.all(partners.map(async (p) => {
            // Capital Balance
            const capLines = await prisma.journalLine.aggregate({
                _sum: { debit: true, credit: true },
                where: { account: { code: p.capitalGlCode } }
            });
            // Equity accounts are Credit-normal (Balance = Credit - Debit)
            const capitalBalance = new Decimal(capLines._sum.credit || 0).minus(capLines._sum.debit || 0).toNumber();

            // Current Balance
            const curLines = await prisma.journalLine.aggregate({
                _sum: { debit: true, credit: true },
                where: { account: { code: p.currentGlCode } }
            });
            const currentBalance = new Decimal(curLines._sum.credit || 0).minus(curLines._sum.debit || 0).toNumber();

            return {
                ...p,
                profitShare: new Decimal(p.profitShare).toNumber(),
                capitalBalance,
                currentBalance
            };
        }));

        return { success: true, data: partnersWithBalances };
    } catch (error: any) {
        console.error("getPartners error:", error);
        return { success: false, error: error.message };
    }
}
