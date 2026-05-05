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
    { id: 'treasury-cash-main', name: 'الخزنة النقدية', paymentMethod: 'CASH', isDefault: true },
    { id: 'treasury-wallet-main', name: 'محفظة إلكترونية', paymentMethod: 'WALLET', isDefault: false },
    { id: 'treasury-instapay-main', name: 'إنستا باي', paymentMethod: 'INSTAPAY', isDefault: false },
    { id: 'treasury-card-main', name: 'فيزا / بطاقة', paymentMethod: 'CARD', isDefault: false },
];

export async function ensureMainBranch(): Promise<string> {
    // ── Migration Check (MAIN-001 -> MAIN) ──
    if (!migrationChecked) {
        // ── Self-Healing: Fix users with orphaned branchId links ──
        const allBranches = await prisma.branch.findMany({ select: { id: true } });
        const allBranchIds = allBranches.map(b => b.id);
        const mainBranch = allBranches.find(b => b.id === 'branch-1' || b.id === 'MAIN') || await prisma.branch.findFirst({ where: { code: MAIN_BRANCH_CODE } });
        
        if (mainBranch) {
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

    // 🚨 ANTI-DUPLICATION LOCK: Clean up any existing accidental duplicates first
    // V-09: We now search by Name OR ID and merge them strictly.
    const allTreasuries = await prisma.treasury.findMany({
        where: { branchId: branch.id, deletedAt: null },
    });

    // Ensure all required payment-method treasuries exist with STATIC IDs
    for (const t of PAYMENT_TREASURIES) {
        // Find existing by STATIC ID first, then by name
        let existing = allTreasuries.find(x => x.id === t.id || x.name === t.name || x.paymentMethod === t.paymentMethod);

        if (!existing) {
            try {
                await prisma.treasury.create({
                    data: {
                        id: t.id, // FORCE STATIC ID
                        name: t.name,
                        branchId: branch.id,
                        isDefault: t.isDefault,
                        paymentMethod: t.paymentMethod,
                        balance: 0
                    }
                });
                console.log(`[INIT] Created static treasury: ${t.name}`);
            } catch (error: any) {
                // If ID already exists (P2002), we are good.
                if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
                    console.error(`[INIT] Error creating static treasury ${t.name}:`, error.message);
                }
            }
        } else {
            // If it exists but with a random ID, we might have a name collision.
            // In a production environment, we'd merge logs, but here we enforce the static one.
            if (existing.id !== t.id) {
                console.warn(`[INIT] Detected non-static treasury for ${t.name}. Cleaning up...`);
                // Move balance if possible (simplified here to just cleanup duplicates)
                const duplicates = allTreasuries.filter(x => (x.name === t.name || x.paymentMethod === t.paymentMethod) && x.id !== t.id);
                for (const d of duplicates) {
                    await prisma.treasury.deleteMany({ where: { id: d.id } });
                }
            }
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
