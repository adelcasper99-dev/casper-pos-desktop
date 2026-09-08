const { PrismaClient } = require('@prisma/client');

async function checkLatestTenants() {
  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        users: {
          select: { id: true, username: true, name: true, phone: true, roleStr: true }
        }
      }
    });

    console.log('=== LATEST 8 TENANTS CREATED ===');
    for (const t of tenants) {
      console.log(`\nTenant ID: ${t.id} | Name: "${t.name}" | Slug: "${t.slug}" | CreatedAt: ${t.createdAt}`);
      console.log(`Users (${t.users.length}):`, t.users);
    }
  } catch (err) {
    console.error('Error querying tenants:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkLatestTenants();
