const { PrismaClient } = require('@prisma/client');

async function checkLatestTenants() {
  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8
    });

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, tenantId: true, username: true, name: true, phone: true, roleStr: true, createdAt: true }
    });

    console.log('=== LATEST 8 TENANTS CREATED ===');
    for (const t of tenants) {
      console.log(`\nTenant ID: ${t.id} | Name: "${t.name}" | Slug: "${t.slug}" | CreatedAt: ${t.createdAt}`);
      const tenantUsers = users.filter(u => u.tenantId === t.id);
      console.log(`Users (${tenantUsers.length}):`, tenantUsers);
    }

    console.log('\n=== LATEST 15 USERS CREATED ===');
    console.table(users);
  } catch (err) {
    console.error('Error querying tenants:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkLatestTenants();
