const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('1', 10);

    // Create Main Branch
    const branch = await prisma.branch.create({
        data: {
            name: "Main Branch",
            code: "MAIN-001",
            type: "STORE"
        }
    });

    // Create super admin
    await prisma.user.create({
        data: {
            username: 'adel',
            password: hashedPassword,
            name: 'Adel (Super Admin)',
            roleStr: 'ADMIN',
            branchId: branch.id,
            isGlobalAdmin: true
        }
    });

    console.log("✅ Super admin 'adel' successfully created.");
}

main().catch(e => {
    console.error(e);
    process.exit(1);
}).finally(() => {
    prisma.$disconnect();
});
