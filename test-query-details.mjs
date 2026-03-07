import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const expLines = await prisma.journalLine.findMany({
        where: { account: { code: { in: ['5100', '5200', '5300', '5400'] } } },
        include: { journalEntry: true }
    });
    console.log('\n--- Expense Lines ---');
    console.dir(expLines, { depth: null });

    const purchLines = await prisma.journalLine.findMany({
        where: { account: { code: '1200' }, journalEntry: { purchaseId: { not: null } } },
        include: { journalEntry: true }
    });
    console.log('\n--- Purchase Lines (1200) ---');
    console.dir(purchLines, { depth: null });
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
