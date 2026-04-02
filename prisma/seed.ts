import { prisma } from '../src/lib/prisma';
import { seedCashCategories } from '../src/lib/accounting/seed-cash-categories';

async function main() {
  console.log('--- Starting Database Seed ---');
  
  try {
    await seedCashCategories();
    console.log('--- Database Seed Successful ---');
  } catch (error) {
    console.error('--- Database Seed Failed ---', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
