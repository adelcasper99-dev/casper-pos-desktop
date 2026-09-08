import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testStaffQuery() {
    const users = await prisma.user.findMany({
        where: {
            deletedAt: null,
            username: { not: 'SYSTEM_USER' },
            isGlobalAdmin: false,
            roleStr: { notIn: ['ADMIN', 'SUPER_ADMIN'] }
        },
        include: { role: true, technician: true }
    });

    console.log(`Found ${users.length} active employee(s):`);
    for (const u of users) {
        console.log(`- Employee: ${u.name || u.username} (${u.username}) | Role: ${u.roleStr} | Tech: ${!!u.technician}`);
    }
}

testStaffQuery().finally(() => prisma.$disconnect());
