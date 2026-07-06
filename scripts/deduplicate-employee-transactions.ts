import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting EmployeeTransaction deduplication...');

  // Find duplicates by grouping
  const duplicates = await prisma.employeeTransaction.groupBy({
    by: ['userId', 'referenceId', 'type'],
    _count: {
      id: true,
    },
    having: {
      id: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  console.log(`Found ${duplicates.length} duplicate groups.`);

  let totalDeleted = 0;

  for (const group of duplicates) {
    if (!group.referenceId) {
      console.log(`Skipping group with null referenceId (userId: ${group.userId}, type: ${group.type}) as nulls are distinct in SQL.`);
      continue;
    }

    // Fetch all records for this group, ordered by createdAt ASC
    const records = await prisma.employeeTransaction.findMany({
      where: {
        userId: group.userId,
        referenceId: group.referenceId,
        type: group.type,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Keep the first one, delete the rest
    const [keep, ...toDelete] = records;
    
    if (toDelete.length > 0) {
      const deleteIds = toDelete.map(r => r.id);
      
      await prisma.employeeTransaction.deleteMany({
        where: {
          id: {
            in: deleteIds,
          },
        },
      });
      
      console.log(`Deleted ${toDelete.length} duplicates for userId: ${group.userId}, referenceId: ${group.referenceId}, type: ${group.type}`);
      totalDeleted += toDelete.length;
    }
  }

  console.log(`Deduplication complete. Deleted ${totalDeleted} duplicate records total.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
