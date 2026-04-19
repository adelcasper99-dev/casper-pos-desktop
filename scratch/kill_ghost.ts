
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function killGhostBranch() {
  const ghostId = '1313b067-d9f3-4e3e-961b-b890aa3a967a';
  
  console.log(`💀 Killing Ghost Branch: ${ghostId}`);

  try {
    await prisma.$transaction(async (tx) => {
        // 1. Delete associated Stock
        await tx.stock.deleteMany({ where: { warehouse: { branchId: ghostId } } });
        
        // 2. Delete associated Warehouses
        await tx.warehouse.deleteMany({ where: { branchId: ghostId } });
        
        // 3. Delete associated Treasuries
        await tx.treasury.deleteMany({ where: { branchId: ghostId } });
        
        // 4. Update any users that might be linked (safety)
        await tx.user.updateMany({ 
            where: { branchId: ghostId }, 
            data: { branchId: null } 
        });

        // 5. Delete the branch itself
        await tx.branch.delete({ where: { id: ghostId } });
    });

    console.log('✅ Ghost Branch Exorcised Successfully.');
  } catch (error: any) {
    console.error('❌ Failed to kill ghost branch:', error.message);
  }
}

killGhostBranch()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
