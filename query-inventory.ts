import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const lines = await prisma.journalLine.findMany({
        where: { account: { code: '1200' } },
        include: { journalEntry: true },
        orderBy: { journalEntry: { date: 'asc' } }
    });
    console.log(`Total lines found: ${lines.length}`);
    for (const line of lines) {
        console.log(`[${line.journalEntry.date.toISOString()}] ${line.journalEntry.description} | Debit: ${line.debit} | Credit: ${line.credit}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
