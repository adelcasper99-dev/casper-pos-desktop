const { PrismaClient } = require('@prisma/client');

async function inspectUsers() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, phone: true, tenantId: true }
    });
    console.log('=== USERS IN DATABASE ===');
    console.log(users);

    const tenants = await prisma.tenant.findMany({
      select: { id: true, slug: true, name: true }
    });
    console.log('=== TENANTS IN DATABASE ===');
    console.log(tenants);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

inspectUsers();
