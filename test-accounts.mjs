import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const lines = await prisma.journalLine.groupBy({
        by: ['accountId'],
        _sum: { debit: true, credit: true },
        where: {
            journalEntry: { date: { gte: new Date('2026-02-01'), lte: new Date('2026-03-31') } }
        }
    });

    const accounts = await prisma.account.findMany();
    const map = new Map(accounts.map(a => [a.id, a.code + ' - ' + a.name]));

    const result = lines.map(l => ({
        account: map.get(l.accountId) || l.accountId,
        debit: l._sum.debit,
        credit: l._sum.credit
    }));

    console.log(result);
}

main().catch(console.error).finally(() => prisma.$disconnect());
