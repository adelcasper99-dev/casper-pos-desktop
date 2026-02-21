
"use server";

/**
 * AUDIT TRAIL POLICY: This file performs sensitive financial/inventory operations.
 * All mutations MUST be accompanied by an AuditLog entry.
 * AuditLog is APPEND-ONLY and must not be deleted or modified.
 */

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

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
    // 1. Double check users don't exist
    const userCount = await prisma.user.count();
    if (userCount > 0) {
        throw new Error("System already set up");
    }

    await prisma.$transaction(async (tx) => {
        // 2. Create Branch
        // NOTE: Branch has no isDefault column — identity is by code: "MAIN-001"
        const branch = await tx.branch.create({
            data: {
                name: data.branch.name,
                code: "MAIN-001",
                type: data.branch.type,
                address: "Main Office"
            }
        });

        // 3. Create Treasuries for the branch
        const paymentMethods = ["CASH", "VISA", "WALLET", "INSTAPAY"];

        for (const method of paymentMethods) {
            await tx.treasury.create({
                data: {
                    name: `${method.charAt(0) + method.slice(1).toLowerCase()} Treasury`,
                    paymentMethod: method,
                    branchId: branch.id,
                    isDefault: method === "CASH",
                    balance: 0
                }
            });
        }

        // 4. Create Main Warehouse
        await tx.warehouse.create({
            data: {
                name: "Main Warehouse",
                branchId: branch.id,
                isDefault: true,
                address: "Main Office"
            }
        });

        // 5. Create Admin User
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

        // 6. Set Store Settings
        await tx.storeSettings.upsert({
            where: { id: "settings" },
            update: {
                name: data.branch.name,
                taxRate: data.settings.taxRate,
                currency: data.settings.currency,
            },
            create: {
                id: "settings",
                name: data.branch.name,
                taxRate: data.settings.taxRate,
                currency: data.settings.currency,
            }
        });
    });

    // BL-09 fix: seedAccounts uses global prisma — MUST run outside the transaction
    // so a rollback doesn't leave accounts in an inconsistent state.
    const accountCount = await prisma.account.count();
    if (accountCount === 0) {
        const { seedAccounts } = await import('@/lib/accounting/seed-accounts');
        await seedAccounts();
    }

    revalidatePath("/");
    return { success: true };
}
