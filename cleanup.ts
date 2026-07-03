import { PrismaClient } from '@prisma/client';
import { AccountingEngine } from './src/lib/accounting/transaction-factory';

const prisma = new PrismaClient();
async function main() {
  const overrides = await prisma.journalEntry.findMany({
    where: { 
        reference: '82d86d4b-d7b9-4753-b142-74c7603d19f8',
        idempotencyKey: { startsWith: 'TICKET_DIST_OVERRIDE_' }
    },
    orderBy: { createdAt: 'asc' }
  });
  
  // Keep the last one active
  const toReverse = overrides.slice(0, overrides.length - 1);

  for (const override of toReverse) {
      const alreadyReversed = await prisma.journalEntry.findFirst({
          where: { reference: override.id, description: { startsWith: 'REVERSAL:' } }
      });
      
      if (!alreadyReversed) {
          console.log(`Reversing override: ${override.id} | ${override.idempotencyKey}`);
          await AccountingEngine.reverseJournalEntry(override.id, `REV_${override.idempotencyKey}_MANUAL_CLEANUP`, prisma);
      }
  }
  
  console.log('Cleanup complete. The active override is:', overrides[overrides.length - 1].idempotencyKey);
}
main().catch(console.error).finally(() => prisma.$disconnect());
