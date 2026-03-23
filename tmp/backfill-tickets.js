const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Starting Ticket Backfill (Raw SQL)...");

    // We use raw SQL to bypass the outdated Prisma client metadata
    const result = await prisma.$executeRaw`
        UPDATE Ticket 
        SET finalCustomerPrice = repairPrice 
        WHERE (finalCustomerPrice = 0 OR finalCustomerPrice IS NULL)
        AND status IN ('PAID_DELIVERED', 'DELIVERED', 'CLOSED', 'PICKED_UP')
        AND deletedAt IS NULL
        AND repairPrice > 0
    `;

    console.log(`\nBackfill Complete. Rows affected: ${result}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
