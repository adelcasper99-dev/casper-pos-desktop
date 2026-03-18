import { prisma } from "../src/lib/prisma";
import Decimal from "decimal.js";

async function main() {
    console.log("Starting Audit Gap Backfill...");

    // 1. Expense GL branchId Backfill
    console.log("\n[1/2] Backfilling missing branchIds on Expense GL Journal Entries...");
    try {
        // SQLite doesn't support UPDATE...FROM JOIN syntax. Use Prisma loop instead.
        const expenses = await (prisma as any).expense.findMany({
            where: { branchId: { not: null } },
            select: { id: true, branchId: true }
        });

        let patched = 0;
        for (const exp of expenses) {
            const updateResult = await (prisma as any).journalEntry.updateMany({
                where: { expenseId: exp.id, branchId: null },
                data: { branchId: exp.branchId }
            });
            patched += updateResult.count;
        }
        console.log(`✅ Success: Patched ${patched} journal entries across ${expenses.length} expenses.`);
    } catch (e: any) {
        console.error(`❌ Error in GL backfill: ${e.message}`);
    }

    // 2. Purchase Float Drift Repair
    console.log("\n[2/2] Scanning Purchase Invoices for float arithmetic drift...");
    let fixedPurchases = 0;
    
    try {
        const purchases = await prisma.purchaseInvoice.findMany({
            include: { items: true }
        });

        for (const invoice of purchases) {
            const exactSubtotal = invoice.items.reduce(
                (acc, item) => acc.plus(new Decimal(String(item.unitCost)).times(item.quantity)),
                new Decimal(0)
            );
            const deliveryCharge = new Decimal(String(invoice.deliveryCharge || 0));
            const exactTotal = exactSubtotal.plus(deliveryCharge);
            
            const currentTotal = new Decimal(String(invoice.totalAmount));
            
            // If absolute difference is greater than zero
            if (!currentTotal.equals(exactTotal)) {
                console.log(`Fixing Invoice ${invoice.invoiceNumber}: ${currentTotal.toNumber()} -> ${exactTotal.toNumber()}`);
                
                // Update Invoice
                await prisma.purchaseInvoice.update({
                    where: { id: invoice.id },
                    data: { totalAmount: exactTotal.toNumber() }
                });

                // Also fix supplier balance delta (subtract wrong total, add correct total)
                const driftAmount = exactTotal.minus(currentTotal);
                await prisma.supplier.update({
                    where: { id: invoice.supplierId },
                    data: { balance: { increment: driftAmount.toNumber() } }
                });

                fixedPurchases++;
            }
        }
        console.log(`✅ Success: Processed ${purchases.length} invoices. Fixed ${fixedPurchases} with drift.`);
    } catch (e: any) {
        console.error(`❌ Error in Purchase backfill: ${e.message}`);
    }

    console.log("\n🎉 Backfill Complete.");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
