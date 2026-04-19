
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function deepAudit() {
  const all = await prisma.treasury.findMany({
    select: { id: true, name: true, branchId: true, deletedAt: true }
  });
  console.log('--- Deep Audit (Including Deleted) ---');
  console.table(all);
}

deepAudit()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
