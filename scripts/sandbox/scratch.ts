import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('StoreSettings:', await prisma.storeSettings.findMany());
}

main().finally(() => process.exit(0));
