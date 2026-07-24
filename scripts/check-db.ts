import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:casper_pass_123@109.123.247.119:6432/casper_db?pgbouncer=true'
    }
  }
});

async function main() {
  console.log('--- ALL TENANTS ---');
  console.log(await prisma.tenant.findMany());

  console.log('--- ALL USERS ---');
  console.log(await prisma.user.findMany());

  console.log('--- ALL BRANCHES ---');
  console.log(await prisma.branch.findMany());

  console.log('--- ALL LICENSES ---');
  console.log(await prisma.license.findMany());
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
