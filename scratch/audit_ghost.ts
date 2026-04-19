
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function auditGhostBranch() {
  const ghostId = '1313b067-d9f3-4e3e-961b-b890aa3a967a';
  
  console.log(`🕵️ Auditing Ghost Branch: ${ghostId}`);
  
  const [sales, tickets, txs, users, warehouses, treasuries] = await Promise.all([
    prisma.sale.count({ where: { branchId: ghostId } }),
    prisma.ticket.count({ where: { currentBranchId: ghostId } }),
    prisma.transaction.count({ where: { treasury: { branchId: ghostId } } }),
    prisma.user.count({ where: { branchId: ghostId } }),
    prisma.warehouse.count({ where: { branchId: ghostId } }),
    prisma.treasury.count({ where: { branchId: ghostId, deletedAt: null } })
  ]);

  console.log('--- Ghost Branch Contents ---');
  console.log(`Sales: ${sales}`);
  console.log(`Tickets: ${tickets}`);
  console.log(`Transactions: ${txs}`);
  console.log(`Users: ${users}`);
  console.log(`Warehouses: ${warehouses}`);
  console.log(`Treasuries: ${treasuries}`);
}

auditGhostBranch()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
