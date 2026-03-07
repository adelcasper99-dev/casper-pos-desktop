/**
 * ensure-main-branch.ts
 *
 * Ensures a single "main" branch exists, named after the store.
 * This app runs in single-branch mode: only one branch is allowed.
 * The branch name is always synced with StoreSettings.name.
 */

import { prisma } from '@/lib/prisma';

const MAIN_BRANCH_CODE = 'MAIN';
let cachedMainBranchId: string | null = null; // V-08: In-memory cache for ultra-fast login
let migrationChecked = false; // Ensure migration logic runs at least once per process

/**
 * Resets the in-memory caches so the next call to ensureMainBranch() and
 * initDatabase() will run the full initialization path again.
 * MUST be called before wiping the database (e.g. during setup reset).
 */
export function resetBranchCache(): void {
    cachedMainBranchId = null;
    migrationChecked = false;
    // Also reset the db-init flag so initDatabase() re-runs on next request
    const g = globalThis as unknown as { dbInitialized?: boolean };
    g.dbInitialized = false;
}

// Payment method treasuries to auto-create
// Only CASH is created by default. Other payment methods (VISA, WALLET, INSTAPAY)
// can be added manually by the user from the Treasury settings page.
const PAYMENT_TREASURIES = [
    { paymentMethod: 'CASH', name: 'الخزنة النقدية', isDefault: true },
];

export async function ensureMainBranch(): Promise<string> {
    // ── Migration Check (MAIN-001 -> MAIN) ──
    if (!migrationChecked) {
        const legacyBranch = await prisma.branch.findUnique({ where: { code: 'MAIN-001' } });
        if (legacyBranch) {
            const mainBranch = await prisma.branch.findUnique({ where: { code: MAIN_BRANCH_CODE } });
            if (mainBranch) {
                // Collision: user doesn't need current database data. 
                // Move users to MAIN so they can still log in, but clear other records to avoid conflicts.
                await prisma.$transaction([
                    prisma.user.updateMany({ where: { branchId: legacyBranch.id }, data: { branchId: mainBranch.id } }),
                    prisma.treasury.deleteMany({ where: { branchId: legacyBranch.id } }),
                    prisma.warehouse.deleteMany({ where: { branchId: legacyBranch.id } }),
                    prisma.stockRequest.deleteMany({ where: { branchId: legacyBranch.id } }),
                    prisma.branch.delete({ where: { id: legacyBranch.id } })
                ]).catch(async () => {
                    // Fallback: If transaction fails (e.g. more complex FKs), just rename it to avoid code conflict
                    await prisma.branch.update({ where: { id: legacyBranch.id }, data: { code: `OLD-${legacyBranch.id.slice(0, 4)}` } });
                });
            } else {
                // Safe to rename
                await prisma.branch.update({ where: { id: legacyBranch.id }, data: { code: MAIN_BRANCH_CODE } });
            }
        }
        migrationChecked = true;
    }

    // ── V-08: Extreme Fast Path (Memory) ──────────────────────────────────────────
    if (cachedMainBranchId) return cachedMainBranchId;

    // ── V-08: Regular Fast Path (DB Check) ───────────────────────────────────────
    // Get store info from settings
    const settings = await prisma.storeSettings.findUnique({
        where: { id: 'settings' },
        select: { name: true, phone: true, address: true }
    });

    const storeInfo = {
        name: settings?.name || 'الفرع الرئيسي',
        phone: settings?.phone || null,
        address: settings?.address || null
    };

    // Try to find the existing main branch
    const branch = await prisma.branch.findUnique({
        where: { code: MAIN_BRANCH_CODE }
    });

    // If branch exists and all info matches, skip heavy initialization
    if (branch &&
        branch.name === storeInfo.name &&
        branch.phone === storeInfo.phone &&
        branch.address === storeInfo.address) {
        cachedMainBranchId = branch.id;
        return branch.id;
    }

    // ── Slow Path (Initialization or Update) ────────────────────────────────────
    const branchId = await initializeOrUpdateMainBranch(storeInfo, branch);
    cachedMainBranchId = branchId;
    return branchId;
}

async function initializeOrUpdateMainBranch(storeInfo: { name: string, phone: string | null, address: string | null }, existingBranch: any): Promise<string> {
    let branch = existingBranch;

    if (!branch) {
        branch = await prisma.branch.create({
            data: {
                name: storeInfo.name,
                code: MAIN_BRANCH_CODE,
                type: 'STORE',
                phone: storeInfo.phone,
                address: storeInfo.address,
                sortOrder: 0
            }
        });
    } else if (branch.name !== storeInfo.name || branch.phone !== storeInfo.phone || branch.address !== storeInfo.address) {
        branch = await prisma.branch.update({
            where: { code: MAIN_BRANCH_CODE },
            data: {
                name: storeInfo.name,
                phone: storeInfo.phone,
                address: storeInfo.address
            }
        });
    }

    const storeName = storeInfo.name;

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
                data: { isDefault: true, name: storeName }
            });
        } else {
            await prisma.warehouse.create({
                data: { name: storeName, branchId: branch.id, isDefault: true }
            });
        }
    } else if (existingDefaultWarehouse.name !== storeName) {
        await prisma.warehouse.update({
            where: { id: existingDefaultWarehouse.id },
            data: { name: storeName }
        });
    }

    // Ensure all 4 payment-method treasuries exist
    for (const t of PAYMENT_TREASURIES) {
        const existing = await prisma.treasury.findFirst({
            where: {
                branchId: branch.id,
                OR: [
                    { paymentMethod: t.paymentMethod },
                    { name: t.name }
                ]
            }
        });

        if (!existing) {
            await prisma.treasury.create({
                data: {
                    name: t.name,
                    branchId: branch.id,
                    isDefault: t.isDefault,
                    paymentMethod: t.paymentMethod,
                    balance: 0
                }
            });
        } else if (!existing.paymentMethod && t.paymentMethod) {
            // Found by name but paymentMethod was null? Update it.
            await prisma.treasury.update({
                where: { id: existing.id },
                data: { paymentMethod: t.paymentMethod }
            });
        }
    }

    // Cleanup: Ensure only ONE treasury is marked as default for this branch
    const defaults = await prisma.treasury.findMany({
        where: { branchId: branch.id, isDefault: true, deletedAt: null },
        orderBy: { updatedAt: 'desc' }
    });

    if (defaults.length > 1) {
        // Keep only the most recently updated default (or prioritize CASH if exists)
        const primaryDefault = defaults.find(d => d.paymentMethod === 'CASH') || defaults[0];

        await prisma.treasury.updateMany({
            where: {
                branchId: branch.id,
                isDefault: true,
                id: { not: primaryDefault.id }
            },
            data: { isDefault: false }
        });
    }

    // Assign all users without a branch to this branch
    await prisma.user.updateMany({
        where: { branchId: null },
        data: { branchId: branch.id }
    });

    return branch.id;
}



/**
 * Sync the main branch details with the store settings.
 * Call this after updating StoreSettings (name, phone, address).
 */
export async function syncMainBranchDetails(details: { name?: string; phone?: string | null; address?: string | null }): Promise<void> {
    try {
        await prisma.branch.update({
            where: { code: MAIN_BRANCH_CODE },
            data: {
                name: details.name ?? undefined,
                phone: details.phone === undefined ? undefined : details.phone,
                address: details.address === undefined ? undefined : details.address
            }
        });

        // Also sync default warehouse name if store name changed
        if (details.name) {
            const branch = await prisma.branch.findUnique({ where: { code: MAIN_BRANCH_CODE } });
            if (branch) {
                await prisma.warehouse.updateMany({
                    where: { branchId: branch.id, isDefault: true },
                    data: { name: details.name }
                });
            }
        }

        // Clear cache so next ensureMainBranch call gets fresh data
        cachedMainBranchId = null;
    } catch {
        // Branch might not exist yet – not a critical error
    }
}
