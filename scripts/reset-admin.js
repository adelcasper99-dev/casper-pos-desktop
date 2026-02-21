const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Check if any users exist
    const users = await prisma.user.findMany();
    console.log("Current Users:", users.map(u => u.username));

    // Upsert admin user
    const branch = await prisma.branch.findFirst();
    if (!branch) {
        console.log("No branches exist. Creating one...");
        const newBranch = await prisma.branch.create({
            data: {
                name: "Main Branch",
                code: "MAIN-001",
                type: "STORE"
            }
        });
        await prisma.user.upsert({
            where: { username: 'admin' },
            create: {
                username: 'admin',
                password: hashedPassword,
                name: 'System Admin',
                roleStr: 'ADMIN',
                branchId: newBranch.id,
                isGlobalAdmin: true
            },
            update: {
                password: hashedPassword,
                isGlobalAdmin: true
            }
        });
    } else {
        await prisma.user.upsert({
            where: { username: 'admin' },
            create: {
                username: 'admin',
                password: hashedPassword,
                name: 'System Admin',
                roleStr: 'ADMIN',
                branchId: branch.id,
                isGlobalAdmin: true
            },
            update: {
                password: hashedPassword,
                isGlobalAdmin: true
            }
        });
    }

    console.log("✅ Admin password forcibly reset to: admin123");
}

main().catch(console.error).finally(() => {
    prisma.$disconnect();
    process.exit(0);
});
