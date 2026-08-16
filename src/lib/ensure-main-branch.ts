/**
 * ensure-main-branch.ts
 *
 * Ensures a single "main" branch exists, named after the store.
 * This app runs in single-branch mode: only one branch is allowed.
 * The branch name is always synced with StoreSettings.name.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

const MAIN_BRANCH_CODE = 'MAIN';
let cachedMainBranchId: string | null = null; // V-08: In-memory cache for ultra-fast login
let migrationChecked = false; // Ensure migration logic runs at least once per process
let initPromise: Promise<string> | null = null;

/**
 * Resets the in-memory caches so the next call to ensureMainBranch() and
 * initDatabase() will run the full initialization path again.
 * MUST be called before wiping the database (e.g. during setup reset).
 */
export function resetBranchCache(): void {
    cachedMainBranchId = null;
    migrationChecked = false;
    initPromise = null;
    // Also reset the db-init flag so initDatabase() re-runs on next request
    const g = globalThis as unknown as { dbInitialized?: boolean };
    g.dbInitialized = false;
}

// Payment method treasuries to auto-create
// Only CASH is created by default. Other payment methods (VISA, WALLET, INSTAPAY)
// can be added manually by the user from the Treasury settings page.
const PAYMENT_TREASURIES = [
    { id: 'treasury-cash-main', name: 'الخزنة النقدية', paymentMethod: 'CASH', isDefault: true },
];

export async function ensureMainBranch(): Promise<string> {
    if (initPromise) return initPromise;
    initPromise = _ensureMainBranchInternal().catch(e => {
        initPromise = null;
        throw e;
    });
    return initPromise;
}

async function _ensureMainBranchInternal(): Promise<string> {
    // ── Migration Check (Legacy branch-1 → MAIN) ──
    if (!migrationChecked) {
        const allBranches = await prisma.branch.findMany({ select: { id: true, code: true, type: true } });
        const allBranchIds = allBranches.map(b => b.id);

        // Find the true MAIN branch (code=MAIN). Fall back to branch-1 or first branch.
        const mainBranch =
            await prisma.branch.findFirst({ where: { code: MAIN_BRANCH_CODE } }) ||
            allBranches.find(b => b.id === 'branch-1') ||
            allBranches[0];

        if (mainBranch) {
            // Self-heal: ensure the active main branch is type CENTER.
            // Under single-branch mode, the main branch acts as the repair center.
            if (mainBranch.type !== 'CENTER') {
                await prisma.branch.update({
                    where: { id: mainBranch.id },
                    data: { type: 'CENTER' }
                });
                console.log(`[INIT] Self-healed active branch ${mainBranch.id} (${mainBranch.code}) type → CENTER`);
                mainBranch.type = 'CENTER';
            }

            // Also ensure the legacy "branch-1" is CENTER if it still exists separately
            const legacyBranch1 = allBranches.find(b => b.id === 'branch-1');
            if (legacyBranch1 && legacyBranch1.type !== 'CENTER') {
                await prisma.branch.update({
                    where: { id: 'branch-1' },
                    data: { type: 'CENTER' }
                });
                console.log(`[INIT] Self-healed legacy branch-1 type → CENTER`);
            }

            // Fix users with orphaned or null branchId
            await prisma.user.updateMany({
                where: {
                    OR: [
                        { branchId: null },
                        { branchId: { notIn: allBranchIds } }
                    ]
                },
                data: { branchId: mainBranch.id }
            });
        }

        migrationChecked = true;
    }




    // ── V-08: Extreme Fast Path (Memory) ──────────────────────────────────────────
    if (cachedMainBranchId) return cachedMainBranchId;

    // ── V-08: Regular Fast Path (DB Check) ───────────────────────────────────────
    // Get store info from settings
    const settings = await prisma.storeSettings.findFirst({
        select: { name: true, phone: true, address: true }
    });

    const storeInfo = {
        name: settings?.name || 'الفرع الرئيسي',
        phone: settings?.phone || null,
        address: settings?.address || null
    };

    // Try to find the existing main branch and check if it has the default treasury
    const branch = await prisma.branch.findUnique({
        where: { code: MAIN_BRANCH_CODE },
        include: { treasuries: { where: { isDefault: true, deletedAt: null } } }
    });

    // If branch exists, all info matches, and it has at least one default treasury, skip heavy initialization
    if (branch &&
        branch.name === storeInfo.name &&
        branch.phone === storeInfo.phone &&
        branch.address === storeInfo.address &&
        branch.treasuries.length > 0) {
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
        branch = await prisma.branch.findFirst({
            where: { code: MAIN_BRANCH_CODE }
        });
        if (!branch) {
            try {
                branch = await prisma.branch.create({
                    data: {
                        name: storeInfo.name,
                        code: MAIN_BRANCH_CODE,
                        type: 'CENTER',
                        phone: storeInfo.phone,
                        address: storeInfo.address,
                        sortOrder: 0
                    }
                });
            } catch (e) {
                branch = await prisma.branch.findFirst({
                    where: { code: MAIN_BRANCH_CODE }
                });
                if (!branch) throw e;
            }
        }
    } else if (branch.name !== storeInfo.name || branch.phone !== storeInfo.phone || branch.address !== storeInfo.address || branch.type !== 'CENTER') {
        branch = await prisma.branch.update({
            where: { code: MAIN_BRANCH_CODE },
            data: {
                name: storeInfo.name,
                phone: storeInfo.phone,
                address: storeInfo.address,
                type: 'CENTER' // Self-heal: ensure main branch is always CENTER type
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

    // Always ensure a default MAINTENANCE warehouse exists
    const existingMaintWarehouse = await prisma.warehouse.findFirst({
        where: { branchId: branch.id, isMaintenanceDefault: true, deletedAt: null }
    });

    if (!existingMaintWarehouse) {
        // If no maintenance warehouse is set, fallback to the standard default warehouse
        const defaultWh = await prisma.warehouse.findFirst({
            where: { branchId: branch.id, isDefault: true, deletedAt: null }
        });
        if (defaultWh) {
            await prisma.warehouse.update({
                where: { id: defaultWh.id },
                data: { isMaintenanceDefault: true }
            });
        }
    }

    // 🚨 ANTI-DUPLICATION LOCK: Clean up any existing accidental duplicates first
    // V-09: We now search by Name OR ID and merge them strictly.
    // NOTE: Include soft-deleted records (no deletedAt filter) so we detect static ID
    // collisions that would otherwise surface as P2002 unique-constraint violations.
    const allTreasuries = await prisma.treasury.findMany({
        where: { branchId: branch.id },
    });
    // Active (non-deleted) subset used for duplicate detection
    const activeTreasuries = allTreasuries.filter(x => x.deletedAt === null);

    // Ensure all required payment-method treasuries exist with STATIC IDs
    for (const t of PAYMENT_TREASURIES) {
        const anyWithStaticId = allTreasuries.find(x => x.id === t.id);

        if (anyWithStaticId) {
            // Row with the static ID already exists (may be soft-deleted). Restore + sync it.
            if (anyWithStaticId.deletedAt !== null || anyWithStaticId.name !== t.name || anyWithStaticId.paymentMethod !== t.paymentMethod) {
                await prisma.treasury.update({
                    where: { id: t.id },
                    data: { deletedAt: null, name: t.name, paymentMethod: t.paymentMethod, branchId: branch.id }
                });
                console.log(`[INIT] Restored / synced static treasury: ${t.name}`);
            }
            // Safely archive any duplicates (active or soft-deleted) that collide on name or paymentMethod but have a different id
            const duplicates = allTreasuries.filter(x => (x.name === t.name || x.paymentMethod === t.paymentMethod) && x.id !== t.id);
            for (const d of duplicates) {
                const archivedName = `${d.name} (Archived ${Date.now()}-${d.id.slice(0,4)})`;
                await prisma.treasury.update({ 
                    where: { id: d.id }, 
                    data: { name: archivedName, paymentMethod: null, isDefault: false } 
                });
                console.warn(`[INIT] Archived duplicate treasury id=${d.id} to name="${archivedName}"`);
            }
        } else {
            // Safely archive any colliding names or payment methods before we attempt creation
            const collidingNames = allTreasuries.filter(x => x.name === t.name || x.paymentMethod === t.paymentMethod);
            for (const d of collidingNames) {
                const archivedName = `${d.name} (Archived ${Date.now()}-${d.id.slice(0,4)})`;
                await prisma.treasury.update({ 
                    where: { id: d.id }, 
                    data: { name: archivedName, paymentMethod: null, isDefault: false } 
                });
                console.warn(`[INIT] Archived duplicate treasury id=${d.id} to name="${archivedName}" to prevent P2002`);
            }

            const existingTreasury = await prisma.treasury.findUnique({
                where: { id: t.id }
            });
            if (!existingTreasury) {
                try {
                    await prisma.treasury.create({
                        data: {
                            id: t.id,
                            name: t.name,
                            branchId: branch.id,
                            isDefault: t.isDefault,
                            paymentMethod: t.paymentMethod,
                            balance: 0
                        }
                    });
                } catch {
                    // Handled if created concurrently
                }
            } else {
                await prisma.treasury.update({
                    where: { id: t.id },
                    data: {
                        deletedAt: null,
                        name: t.name,
                        paymentMethod: t.paymentMethod,
                        branchId: branch.id,
                    }
                });
            }
            console.log(`[INIT] Initialized static treasury: ${t.name}`);
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

    // Cleanup: Ensure only ONE warehouse is marked as default for this branch
    const defaultWarehouses = await prisma.warehouse.findMany({
        where: { branchId: branch.id, isDefault: true, deletedAt: null },
        orderBy: { createdAt: 'asc' } // Keep the oldest one as the true original
    });

    if (defaultWarehouses.length > 1) {
        const trueOriginalWarehouse = defaultWarehouses[0];

        // Ensure we don't accidentally delete stock. If the duplicates have no stock, we can delete them.
        // Otherwise we just mark them as not default.
        for (let i = 1; i < defaultWarehouses.length; i++) {
            const duplicateWh = defaultWarehouses[i];
            
            // Check if it has stock, invoices, sales, or movements
            const [stockCount, invoiceCount, saleCount, mvCount] = await Promise.all([
                prisma.stock.count({ where: { warehouseId: duplicateWh.id, quantity: { gt: 0 } } }),
                prisma.purchaseInvoice.count({ where: { warehouseId: duplicateWh.id } }),
                prisma.sale.count({ where: { warehouseId: duplicateWh.id } }),
                prisma.stockMovement.count({ where: { OR: [{ fromWarehouseId: duplicateWh.id }, { toWarehouseId: duplicateWh.id }] } })
            ]);

            if (stockCount === 0 && invoiceCount === 0 && saleCount === 0 && mvCount === 0) {
                // Completely safe to delete the duplicate phantom warehouse
                await prisma.stock.deleteMany({ where: { warehouseId: duplicateWh.id } }); // Delete any zero-qty stock records
                await prisma.technician.deleteMany({ where: { warehouseId: duplicateWh.id } });
                try {
                    await prisma.warehouse.delete({ where: { id: duplicateWh.id } });
                } catch (error: any) {
                    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2025') {
                        throw error;
                    }
                }
            } else {
                // Not safe to delete, just remove the default flag and rename it to avoid confusion
                await prisma.warehouse.update({
                    where: { id: duplicateWh.id },
                    data: { 
                        isDefault: false, 
                        name: `${duplicateWh.name} (Duplicate)` 
                    }
                });
            }
        }
    }

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
