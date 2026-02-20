/**
 * ensure-main-branch.ts
 *
 * Ensures a single "main" branch exists, named after the store.
 * This app runs in single-branch mode: only one branch is allowed.
 * The branch name is always synced with StoreSettings.name.
 */

import { prisma } from '@/lib/prisma';

const MAIN_BRANCH_CODE = 'MAIN';

// Payment method treasuries to auto-create
const PAYMENT_TREASURIES = [
    { paymentMethod: 'CASH', name: 'الخزنة النقدية', isDefault: true },
    { paymentMethod: 'VISA', name: 'خزنة الفيزا / البطاقة', isDefault: false },
    { paymentMethod: 'WALLET', name: 'خزنة فودافون كاش', isDefault: false },
    { paymentMethod: 'INSTAPAY', name: 'خزنة انستاباي', isDefault: false },
];

export async function ensureMainBranch(): Promise<string> {
    // Get store name from settings
    const settings = await prisma.storeSettings.findUnique({
        where: { id: 'settings' },
        select: { name: true }
    });
    const storeName = settings?.name || 'الفرع الرئيسي';

    // Try to find the existing main branch
    let branch = await prisma.branch.findUnique({
        where: { code: MAIN_BRANCH_CODE }
    });

    if (!branch) {
        branch = await prisma.branch.create({
            data: {
                name: storeName,
                code: MAIN_BRANCH_CODE,
                type: 'STORE',
                sortOrder: 0
            }
        });
    } else if (branch.name !== storeName) {
        branch = await prisma.branch.update({
            where: { code: MAIN_BRANCH_CODE },
            data: { name: storeName }
        });
    }

    // Always ensure a default warehouse exists for this branch
    const existingDefaultWarehouse = await prisma.warehouse.findFirst({
        where: { branchId: branch.id, isDefault: true, deletedAt: null }
    });

    if (!existingDefaultWarehouse) {
        const anyWarehouse = await prisma.warehouse.findFirst({
            where: { branchId: branch.id, deletedAt: null }
        });
        if (anyWarehouse) {
            await prisma.warehouse.update({
                where: { id: anyWarehouse.id },
                data: { isDefault: true }
            });
        } else {
            await prisma.warehouse.create({
                data: { name: storeName, branchId: branch.id, isDefault: true }
            });
        }
    }

    // Ensure all 4 payment-method treasuries exist
    for (const t of PAYMENT_TREASURIES) {
        const existing = await prisma.treasury.findFirst({
            where: { branchId: branch.id, paymentMethod: t.paymentMethod, deletedAt: null }
        });
        if (!existing) {
            // Check if name already taken (edge case: manually created with same name)
            const nameTaken = await prisma.treasury.findFirst({
                where: { branchId: branch.id, name: t.name }
            });
            await prisma.treasury.create({
                data: {
                    name: nameTaken ? `${t.name} (${t.paymentMethod})` : t.name,
                    branchId: branch.id,
                    isDefault: t.isDefault,
                    paymentMethod: t.paymentMethod,
                    balance: 0
                }
            });
        }
    }

    // Assign all users without a branch to this branch
    await prisma.user.updateMany({
        where: { branchId: null },
        data: { branchId: branch.id }
    });

    return branch.id;
}



/**
 * Sync the main branch name with the store name.
 * Call this after updating StoreSettings.name.
 */
export async function syncMainBranchName(storeName: string): Promise<void> {
    try {
        await prisma.branch.update({
            where: { code: MAIN_BRANCH_CODE },
            data: { name: storeName }
        });
    } catch {
        // Branch might not exist yet – not a critical error
    }
}
