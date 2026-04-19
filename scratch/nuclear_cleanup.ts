
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function totalCleanup() {
  console.log('🧹 Starting Nuclear Cleanup...');

  // 1. Find all branches
  const branches = await prisma.branch.findMany();
  console.log(`Found ${branches.length} branches.`);

  if (branches.length > 1) {
    const mainBranch = branches.find(b => b.code === 'MAIN') || branches[0];
    const duplicates = branches.filter(b => b.id !== mainBranch.id);

    for (const dup of duplicates) {
      console.log(`🔄 Merging branch ${dup.id} into ${mainBranch.id}...`);
      
      // Update all relations to main branch
      await prisma.user.updateMany({ where: { branchId: dup.id }, data: { branchId: mainBranch.id } });
      await prisma.warehouse.updateMany({ where: { branchId: dup.id }, data: { branchId: mainBranch.id } });
      await prisma.treasury.updateMany({ where: { branchId: dup.id }, data: { branchId: mainBranch.id } });
      await prisma.sale.updateMany({ where: { branchId: dup.id }, data: { branchId: mainBranch.id } });
      
      // Delete the duplicate branch
      await prisma.branch.delete({ where: { id: dup.id } });
    }
  }

  // 2. Cleanup duplicate Treasuries WITHIN the main branch
  const treasuries = await prisma.treasury.findMany({
    where: { deletedAt: null }
  });

  const seen = new Set();
  for (const t of treasuries) {
    const key = `${t.branchId}-${t.name}`;
    if (seen.has(key)) {
      console.log(`🗑️ Deleting duplicate treasury: ${t.name} (${t.id})`);
      await prisma.treasury.delete({ where: { id: t.id } });
    } else {
      seen.add(key);
    }
  }

  console.log('✨ System is now CLEAN and SINGLE-BRANCH.');
}

totalCleanup()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
