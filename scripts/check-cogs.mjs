import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    // 1. Check journal lines per account
    const accountSummary = await prisma.$queryRaw`
        SELECT a.code, a.name, 
               CAST(SUM(jl.debit) AS TEXT) as total_debit, 
               CAST(SUM(jl.credit) AS TEXT) as total_credit, 
               COUNT(*) as entry_count
        FROM "JournalLine" jl
        JOIN "Account" a ON a.id = jl."accountId"
        WHERE a.code IN ('5000', '4000', '1200', '1050', '2000')
        GROUP BY a.code, a.name
        ORDER BY a.code
    `;
    console.log('\n=== Journal Lines by Account ===');
    console.table(accountSummary);

    // 2. Total sales count
    const salesCount = await prisma.sale.count();
    console.log(`\nTotal Sales in DB: ${salesCount}`);

    // 3. Total purchase invoices
    const purchasesCount = await prisma.purchaseInvoice.count();
    console.log(`Total Purchase Invoices: ${purchasesCount}`);

    // 4. Total journal entries
    const journalCount = await prisma.journalEntry.count();
    console.log(`Total Journal Entries: ${journalCount}`);

    // 5. Show all journal entries with their totals
    const allEntries = await prisma.journalEntry.findMany({
        select: {
            id: true,
            description: true,
            date: true,
            saleId: true,
            purchaseId: true,
            expenseId: true,
            lines: {
                select: {
                    account: { select: { code: true, name: true } },
                    debit: true,
                    credit: true
                }
            }
        },
        orderBy: { date: 'desc' },
        take: 20
    });

    console.log('\n=== Last 20 Journal Entries ===');
    for (const entry of allEntries) {
        console.log(`\n[${entry.date.toISOString().split('T')[0]}] ${entry.description}`);
        console.log(`  saleId: ${entry.saleId || 'N/A'} | purchaseId: ${entry.purchaseId || 'N/A'} | expenseId: ${entry.expenseId || 'N/A'}`);
        for (const line of entry.lines) {
            if (Number(line.debit) > 0 || Number(line.credit) > 0) {
                console.log(`    ${line.account.code} ${line.account.name}: Dr ${line.debit} / Cr ${line.credit}`);
            }
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
