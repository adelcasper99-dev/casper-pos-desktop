/**
 * Script to add PARTNERS permissions to existing roles (Accountants).
 * Run with: npx ts-node scripts/patch-partner-permissions.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NEW_PERMISSIONS = [
    'PARTNERS_VIEW',
    'PARTNERS_MANAGE',
    'PARTNERS_TRANSACTIONS',
    'PARTNERS_DISTRIBUTE'
];

async function run() {
    try {
        console.log("Checking roles for missing PARTNERS permissions...");

        const accountantRoles = await prisma.role.findMany({
            where: { name: "محاسب" }
        });

        if (accountantRoles.length === 0) {
            console.log("No 'محاسب' role found. Nothing to update.");
            return;
        }

        for (const role of accountantRoles) {
            let permissions: string[] = [];
            try {
                permissions = JSON.parse(role.permissions || '[]');
            } catch (e) {
                permissions = [];
            }

            const missingPermissions = NEW_PERMISSIONS.filter(p => !permissions.includes(p));

            if (missingPermissions.length > 0) {
                console.log(`Role ${role.name} is missing permissions. Updating...`);
                
                const updatedPermissions = [...permissions, ...missingPermissions];
                
                await prisma.role.update({
                    where: { id: role.id },
                    data: {
                        permissions: JSON.stringify(updatedPermissions)
                    }
                });

                console.log(`✅ Successfully updated role ${role.name} with ${missingPermissions.length} new permissions.`);
            } else {
                console.log(`Role ${role.name} already has all required PARTNERS permissions.`);
            }
        }

        console.log("Done.");
    } catch (e) {
        console.error("Failed to patch permissions:", e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
