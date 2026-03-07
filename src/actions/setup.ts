
"use server";

/**
 * AUDIT TRAIL POLICY: This file performs sensitive financial/inventory operations.
 * All mutations MUST be accompanied by an AuditLog entry.
 * AuditLog is APPEND-ONLY and must not be deleted or modified.
 */

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * Wipes all application data so setup can run on a clean slate.
 */
async function resetForSetup(): Promise<void> {
    // Reset in-memory caches before any DB wipe
    const { resetBranchCache } = await import('@/lib/ensure-main-branch');
    resetBranchCache();

    await prisma.$executeRawUnsafe('PRAGMA foreign_keys=OFF;');
    try {
        await prisma.session.deleteMany({});
        await prisma.user.deleteMany({});
        await prisma.auditLog.deleteMany({});
        await prisma.treasury.deleteMany({});
        await prisma.warehouse.deleteMany({});
        await prisma.branch.deleteMany({});
        await prisma.storeSettings.deleteMany({});
        await prisma.account.deleteMany({});
    } finally {
        await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON;');
    }
}

export async function performSetup(data: {
    admin: {
        username: string;
        name: string;
        password: string;
    },
    branch: {
        name: string;
        type: string;
    },
    settings: {
        taxRate: number;
        currency: string;
    }
}) {
    await resetForSetup();

    // Store Settings (read by ensureMainBranch to name warehouse correctly)
    await prisma.storeSettings.create({
        data: {
            id: "settings",
            name: data.branch.name,
            taxRate: data.settings.taxRate,
            currency: data.settings.currency,
        }
    });

    await prisma.$transaction(async (tx) => {
        // 1. Branch
        const branch = await tx.branch.create({
            data: {
                name: data.branch.name,
                code: "MAIN",
                type: data.branch.type,
            }
        });

        // 2. Default Warehouse (always created with setup)
        await tx.warehouse.create({
            data: {
                name: data.branch.name,
                branchId: branch.id,
                isDefault: true,
            }
        });

        // 3. Default CASH Treasury
        await tx.treasury.create({
            data: {
                name: 'الخزنة النقدية',
                paymentMethod: 'CASH',
                branchId: branch.id,
                isDefault: true,
                balance: 0,
            }
        });

        // 4. Admin User
        const hashedPassword = await bcrypt.hash(data.admin.password, 10);
        await tx.user.create({
            data: {
                username: data.admin.username,
                password: hashedPassword,
                name: data.admin.name,
                roleStr: "ADMIN",
                branchId: branch.id
            }
        });
    });

    // Seed Chart of Accounts (outside transaction — BL-09 fix)
    const { seedAccounts } = await import('@/lib/accounting/seed-accounts');
    await seedAccounts();

    return { success: true };
}
