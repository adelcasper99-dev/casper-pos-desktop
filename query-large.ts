import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const account = await prisma.account.findFirst({ where: { code: '2200' } });
  if (!account) return;
  const lines = await prisma.journalLine.findMany({
    where: { accountId: account.id },
    include: { journalEntry: true }
  });
  
  for (const line of lines) {
    if (line.debit.abs().toNumber() > 1000000 || line.credit.abs().toNumber() > 1000000) {
      console.log('Found large entry:');
      console.log('Debit:', line.debit.toString());
      console.log('Credit:', line.credit.toString());
      console.log('Desc:', line.description);
      console.log('Entry Date:', line.journalEntry.date);
      console.log('Entry Reference:', line.journalEntry.reference);
      console.log('Entry Idempotency:', line.journalEntry.idempotencyKey);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
