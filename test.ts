// @ts-nocheck
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const l = await prisma.license.findUnique({ where: { key: 'CASPER-D5C8-93DA-AB43' } });
  console.log(l);
  
  const l2 = await prisma.license.findFirst();
  console.log('Any license:', l2);
}

main().finally(() => prisma.$disconnect());
