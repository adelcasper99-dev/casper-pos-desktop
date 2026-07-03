import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const ticket = await prisma.ticket.findUnique({ where: { barcode: 'T-002' } });
  console.dir(ticket, {depth: null});
}
main().catch(console.error).finally(() => prisma.$disconnect());
