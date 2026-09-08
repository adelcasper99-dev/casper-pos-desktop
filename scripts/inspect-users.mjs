import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function inspectUsers() {
    const users = await prisma.user.findMany({
        include: { role: true, technician: true }
    });
    for (const u of users) {
        console.log(`User: ${u.username} | Name: ${u.name} | RoleStr: ${u.roleStr} | RoleName: ${u.role?.name} | isGlobalAdmin: ${u.isGlobalAdmin} | Salary: ${u.salary} | HasTech: ${!!u.technician}`);
    }
}
inspectUsers().finally(() => prisma.$disconnect());
