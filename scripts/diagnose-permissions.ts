
import { prisma } from "../src/lib/prisma";

async function main() {
    const username = "admin"; // Assuming 'admin', will ask user if different
    console.log(`🔍 Diagnosing permissions for user: ${username}`);

    const user = await prisma.user.findUnique({
        where: { username },
        include: { role: true }
    });

    if (!user) {
        console.error("❌ User not found!");
        return;
    }

    console.log("👤 User Details:");
    console.log(`   ID: ${user.id}`);
    console.log(`   Role String: ${user.roleStr}`);
    console.log(`   Role ID: ${user.roleId}`);

    if (user.role) {
        console.log("🛡️  Assigned Role:");
        console.log(`   Name: ${user.role.name}`);
        console.log(`   Permissions (Raw): ${user.role.permissions}`);
        try {
            const parsed = JSON.parse(user.role.permissions);
            console.log(`   Permissions (Parsed):`, parsed);
            console.log(`   Has Wildcard (*): ${parsed.includes('*')}`);
            console.log(`   Has INVENTORY_VIEW: ${parsed.includes('INVENTORY_VIEW')}`);
        } catch (e) {
            console.error("   ❌ Failed to parse permissions JSON");
        }
    } else {
        console.log("⚠️  No linked Role object found.");
    }

    // Check Session if possible (though we can't easily see cookies here)
    const sessions = await prisma.session.findMany({
        where: { userId: user.id }
    });
    console.log(`🔑 Active Sessions: ${sessions.length}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
