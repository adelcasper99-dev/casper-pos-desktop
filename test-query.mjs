import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const salesLines = await prisma.journalLine.findMany({
        where: { account: { code: '4000' } },
        include: { journalEntry: true }
    });
    console.log('--- Sales Lines (4000) ---');
    console.log('Count:', salesLines.length);
    if (salesLines.length > 0) {
        console.log('Sample:', salesLines[0]);
    }

    const expLines = await prisma.journalLine.findMany({
        where: { account: { code: { in: ['5100', '5200', '5300', '5400'] } } }
    });
    console.log('\n--- Expense Lines ---');
    console.log('Count:', expLines.length);

    const purchLines = await prisma.journalLine.findMany({
        where: { account: { code: '1200' }, journalEntry: { purchaseId: { not: null } } }
    });
    console.log('\n--- Purchase Lines (1200) ---');
    console.log('Count:', purchLines.length);

    if (purchLines.length > 0) {
        console.log('Sample:', purchLines[0]);
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
