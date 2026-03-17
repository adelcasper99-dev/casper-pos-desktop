
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const techs = await prisma.technician.findMany({
            include: { user: { include: { role: true } } }
        });
        console.log("TECHS WITH ROLES:", JSON.stringify(techs.map(t => ({
            name: t.name,
            username: t.user.username,
            role: t.user.role?.name,
            roleId: t.user.roleId
        })), null, 2));

    } catch (e) {
        console.error(e);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
