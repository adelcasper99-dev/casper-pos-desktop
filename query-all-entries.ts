import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const entries = await prisma.journalEntry.findMany({
    where: { reference: '82d86d4b-d7b9-4753-b142-74c7603d19f8' },
    include: { lines: true }
  });
  console.dir(entries, {depth: null});
}
main().catch(console.error).finally(() => prisma.$disconnect());
