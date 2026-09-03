import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== CHECKING ALL BRANCHES ===");
  const allBranches = await prisma.branch.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  for (const b of allBranches) {
    const users = await prisma.user.count({ where: { branchId: b.id } });
    const treasuries = await prisma.treasury.count({ where: { branchId: b.id } });
    const warehouses = await prisma.warehouse.count({ where: { branchId: b.id } });
    const sales = await prisma.sale.count({ where: { branchId: b.id } });
    console.log(`[${b.tenantId}] ${b.id} | Name: "${b.name}" | Code: ${b.code} | Users: ${users}, Treasuries: ${treasuries}, Warehouses: ${warehouses}, Sales: ${sales}`);
  }

  // Find duplicate branches per tenant
  const tenantMap = new Map();
  for (const b of allBranches) {
    if (!tenantMap.has(b.tenantId)) {
      tenantMap.set(b.tenantId, []);
    }
    tenantMap.get(b.tenantId).push(b);
  }

  for (const [tenantId, branches] of tenantMap.entries()) {
    if (branches.length > 1) {
      console.log(`\nTenant "${tenantId}" has ${branches.length} branches! Cleaning up duplicates...`);
      
      // Look for the primary branch created during tenant creation (ends with -MAIN or has users/treasuries)
      // Or find the branch with the users/treasuries
      let primaryBranch = null;
      for (const b of branches) {
        const users = await prisma.user.count({ where: { branchId: b.id } });
        const treasuries = await prisma.treasury.count({ where: { branchId: b.id } });
        if (users > 0 || treasuries > 0) {
          primaryBranch = b;
          break;
        }
      }

      if (!primaryBranch) {
        primaryBranch = branches[0];
      }

      console.log(`Keeping primary branch: ${primaryBranch.id} ("${primaryBranch.name}")`);

      // Rename primary branch cleanly if it has redundant "Main Branch"
      let cleanName = primaryBranch.name;
      if (cleanName.endsWith(" Main Branch")) {
        cleanName = cleanName.replace(/ Main Branch$/, "");
      }
      await prisma.branch.update({
        where: { id: primaryBranch.id },
        data: { name: cleanName, type: "CENTER" },
      });
      console.log(`Updated primary branch name to: "${cleanName}"`);

      // For all other duplicate branches in this tenant:
      for (const other of branches) {
        if (other.id === primaryBranch.id) continue;

        console.log(`Merging secondary branch: ${other.id} ("${other.name}") -> ${primaryBranch.id}`);
        
        // Reassign any warehouses, users, treasuries, sales to primaryBranch
        await prisma.warehouse.updateMany({
          where: { branchId: other.id },
          data: { branchId: primaryBranch.id },
        });

        await prisma.user.updateMany({
          where: { branchId: other.id },
          data: { branchId: primaryBranch.id },
        });

        await prisma.treasury.updateMany({
          where: { branchId: other.id },
          data: { branchId: primaryBranch.id },
        });

        await prisma.sale.updateMany({
          where: { branchId: other.id },
          data: { branchId: primaryBranch.id },
        });

        // Soft delete the duplicate branch
        await prisma.branch.update({
          where: { id: other.id },
          data: { deletedAt: new Date(), code: `${other.code}_DUP_${Date.now()}` },
        });
        console.log(`Soft-deleted duplicate branch ${other.id}`);
      }
    }
  }

  console.log("\n=== FINISHED ===");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
