import { ensureMainBranch, resetBranchCache } from "../src/lib/ensure-main-branch";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Resetting cache and calling ensureMainBranch()...");
  resetBranchCache();
  await ensureMainBranch();
  
  const treasuries = await prisma.treasury.findMany({
    where: { deletedAt: null }
  });
  console.log("Active Treasuries in DB:");
  console.log(JSON.stringify(treasuries, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
