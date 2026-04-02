import { prisma } from "../src/lib/prisma";
import Decimal from "decimal.js";

/**
 * Audit Integrity Script: Casper POS Financial Success Ratio
 * 
 * This script calculates the "Integrity Score" of the system by cross-referencing
 * Treasury Transactions with General Ledger (JournalEntry) records.
 * 
 * Success Metrics:
 * 1. Linkage Score: % of transactions linked to a Journal Entry.
 * 2. Balance Score: % of Journal Entries where Sum(Debit) == Sum(Credit).
 * 3. Precision Score: Detection of float vs decimal drift.
 */

async function main() {
    console.log("\n🚀 Financial Integrity Audit: Starting Service...");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Linkage Audit
    console.log("\n[1/3] Auditing Transaction-to-GL Linkage...");
    const transactions = await prisma.transaction.findMany({
        where: { 
            createdAt: { gte: thirtyDaysAgo },
            deletedAt: null,
            // Only types that MUST have a JE
            type: { in: ['IN', 'OUT', 'SALE', 'TRANSFER_IN', 'TRANSFER_OUT', 'SAFE_DROP', 'EXPENSE', 'REFUND'] }
        },
        include: { journalEntry: true }
    });

    const totalTx = transactions.length;
    const linkedTx = transactions.filter(t => (t as any).journalEntry).length;
    const linkageScore = totalTx > 0 ? (linkedTx / totalTx) * 100 : 100;

    console.log(`- Total Transactions (30d): ${totalTx}`);
    console.log(`- Linked Transactions: ${linkedTx}`);
    console.log(`- Linkage Score: ${linkageScore.toFixed(2)}%`);

    // 2. Balance Audit
    console.log("\n[2/3] Auditing Ledger Balance (Debit vs Credit)...");
    const journalEntries = await prisma.journalEntry.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        include: { lines: true }
    });

    let unbalancedCount = 0;
    for (const je of journalEntries) {
        const totalDebit = je.lines.reduce((sum, l) => sum.plus(new Decimal(l.debit.toString())), new Decimal(0));
        const totalCredit = je.lines.reduce((sum, l) => sum.plus(new Decimal(l.credit.toString())), new Decimal(0));
        
        if (!totalDebit.equals(totalCredit)) {
            unbalancedCount++;
            console.warn(`⚠️ Unbalanced JE #${je.id.slice(0,8)}: Diff = ${totalDebit.minus(totalCredit).toFixed(2)}`);
        }
    }

    const totalJE = journalEntries.length;
    const balancedScore = totalJE > 0 ? ((totalJE - unbalancedCount) / totalJE) * 100 : 100;
    console.log(`- Total Journal Entries (30d): ${totalJE}`);
    console.log(`- Unbalanced Entries: ${unbalancedCount}`);
    console.log(`- Balance Score: ${balancedScore.toFixed(2)}%`);

    // 3. Precision Audit (Detection of Potential Drift)
    console.log("\n[3/3] Auditing Precision Drift (Number vs Decimal)...");
    // We check if any Transaction amount has many decimal places which might indicate float conversion artifacts
    const driftDetected = transactions.filter(t => {
        const str = t.amount.toString();
        return str.includes('.') && str.split('.')[1].length > 4;
    }).length;

    const precisionScore = totalTx > 0 ? ((totalTx - driftDetected) / totalTx) * 100 : 100;
    console.log(`- Transactions with potential float drift: ${driftDetected}`);
    console.log(`- Precision Score: ${precisionScore.toFixed(2)}%`);

    // --- FINAL REPORT ---
    const finalScore = (linkageScore * 0.4) + (balancedScore * 0.4) + (precisionScore * 0.2);

    console.log("\n" + "=" .repeat(40));
    console.log(`🏆 FINAL INTEGRITY SUCCESS RATIO: ${finalScore.toFixed(2)}%`);
    console.log("=" .repeat(40));

    if (finalScore < 95) {
        console.error("\n❌ CRITICAL: System health is below threshold. Manual reconciliation required.");
    } else if (finalScore < 100) {
        console.warn("\n⚠️ WARNING: Minor discrepancies detected. Run backfill-audit-gaps.ts to repair.");
    } else {
        console.log("\n✅ SUCCESS: All financial systems are perfectly aligned.");
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
