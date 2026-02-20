
import { prisma } from "../src/lib/prisma";

async function main() {
    console.log("🛠️  Fixing Admin Permissions...");

    // 1. Find or Create the 'Admin' Role with full permissions
    let adminRole = await prisma.role.findUnique({
        where: { name: 'Admin' }
    });

    if (!adminRole) {
        console.log("🆕 Creating 'Admin' role...");
        // Wildcard permission for full access
        adminRole = await prisma.role.create({
            data: {
                name: 'Admin',
                permissions: '["*"]'
            }
        });
    } else {
        console.log("✅ 'Admin' role found.");
        // Ensure it has wildcard
        if (!adminRole.permissions.includes('*')) {
            console.log("🔄 Updating Admin role to use wildcard [*]...");
            await prisma.role.update({
                where: { id: adminRole.id },
                data: { permissions: '["*"]' }
            });
        }
    }

    // 2. Assign this role to the 'admin' user
    const user = await prisma.user.findUnique({ where: { username: 'admin' } });
    if (user) {
        console.log(`👤 Assigning Admin role to user '${user.username}'...`);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                roleId: adminRole.id,
                roleStr: 'ADMIN', // Keep legacy sync
                isGlobalAdmin: true
            }
        });
        console.log("🎉 User updated successfully!");

        // 3. Clear sessions to force re-login and fresh permission load
        console.log("🧹 Clearing user sessions...");
        await prisma.session.deleteMany({ where: { userId: user.id } });
    } else {
        console.error("❌ User 'admin' not found!");
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
