
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanupTreasuries() {
  console.log('🚀 Starting Treasury Cleanup...');

  // Find all treasuries with name 'الخزنة النقدية'
  const duplicates = await prisma.treasury.findMany({
    where: { 
        name: 'الخزنة النقدية',
        deletedAt: null 
    },
    orderBy: { createdAt: 'asc' }
  });

  if (duplicates.length <= 1) {
    console.log('✅ No duplicates found.');
    return;
  }

  const [main, ...others] = duplicates;
  console.log(`💎 Keeping Main Treasury: ${main.id}`);

  for (const dup of others) {
    // Double check for transactions before deleting
    const txCount = await prisma.transaction.count({ where: { treasuryId: dup.id } });
    
    if (txCount === 0) {
        console.log(`🗑️ Deleting empty duplicate: ${dup.id}`);
        await prisma.treasury.delete({ where: { id: dup.id } });
    } else {
        console.log(`⚠️ Duplicate ${dup.id} has transactions! Merging them to ${main.id}...`);
        await prisma.transaction.updateMany({
            where: { treasuryId: dup.id },
            data: { treasuryId: main.id }
        });
        await prisma.treasury.delete({ where: { id: dup.id } });
    }
  }

  console.log('✨ Cleanup Complete.');
}

cleanupTreasuries()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
