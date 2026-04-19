
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testUniqueness() {
  console.log('🧪 Testing Uniqueness Constraint...');
  try {
    const mainBranch = await prisma.branch.findFirst({ where: { code: 'MAIN' } });
    if (!mainBranch) throw new Error('Main branch not found');

    await prisma.treasury.create({
      data: {
        name: 'الخزنة النقدية',
        branchId: mainBranch.id,
        balance: 0
      }
    });
    console.log('❌ FAILURE: System allowed duplicate creation!');
  } catch (error: any) {
    if (error.code === 'P2002') {
      console.log('✅ SUCCESS: Database REJECTED duplicate creation. The lock is working.');
    } else {
      console.log('❓ Unexpected error:', error.message);
    }
  }
}

testUniqueness()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
