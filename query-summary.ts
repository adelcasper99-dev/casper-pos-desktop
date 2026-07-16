import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const entries = await prisma.journalEntry.findMany({
    where: { reference: '82d86d4b-d7b9-4753-b142-74c7603d19f8' },
    orderBy: { createdAt: 'asc' },
    include: {
      lines: {
        where: { accountId: 'c6a41ad1-b631-4698-ab91-79cc30356113' } // Account 2200
      }
    }
  });
  
  for (const entry of entries) {
    console.log(`[${entry.createdAt.toISOString()}] ID: ${entry.id} | Key: ${entry.idempotencyKey} | Desc: ${entry.description}`);
    for (const line of entry.lines) {
      console.log(`  -> Debit: ${line.debit.toString()} | Credit: ${line.credit.toString()}`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
