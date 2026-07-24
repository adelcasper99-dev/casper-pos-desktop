
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
/**
 * Selective Reset Options
 */
export interface ResetOptions {
    keepProducts?: boolean;
    keepCustomers?: boolean;
    keepEmployees?: boolean;
    keepSettings?: boolean;
    keepTreasuryAndWarehouses?: boolean;
}

/**
 * Wipes application data selectively so setup can run on a clean slate.
 */
async function resetForSetup(options: ResetOptions = {}): Promise<void> {
    const { resetBranchCache } = await import('@/lib/ensure-main-branch');
    resetBranchCache();

    const isPostgres = Boolean(process.env.DATABASE_URL?.startsWith('postgres'));

    if (isPostgres) {
        try {
            await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica';`);
        } catch {
            // Non-superuser in cloud/managed Postgres - safe to ignore as deletion order is topological
        }
    } else {
        try {
            await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`);
        } catch {
            // SQLite foreign keys fallback
        }
    }

    try {
        // ALWAYS WIPE (Sensitive/Session Data)
        await prisma.actionLog.deleteMany({});
        await prisma.auditLog.deleteMany({});

        // MODULE: Financials & Sales (Usually wiped to clear balances)
        await prisma.journalLine.deleteMany({});
        await prisma.journalEntry.deleteMany({});
        await prisma.transaction.deleteMany({});
        await prisma.customerTransaction.deleteMany({});
        await prisma.supplierPayment.deleteMany({});
        await prisma.saleItem.deleteMany({});
        await prisma.sale.deleteMany({});
        await prisma.purchaseItem.deleteMany({});
        await prisma.purchaseInvoice.deleteMany({});
        await prisma.expense.deleteMany({});
        await prisma.shiftAdjustment.deleteMany({});
        await prisma.shift.deleteMany({});

        // MODULE: Maintenance & Tickets
        await prisma.ticketPart.deleteMany({});
        await prisma.ticketCollaborator.deleteMany({});
        await prisma.ticket.deleteMany({});

        // MODULE: Inventory Movements
        await prisma.stockMovement.deleteMany({});
        await prisma.stockRequestItem.deleteMany({});
        await prisma.stockRequest.deleteMany({});
        await prisma.stockWastage.deleteMany({});
        await prisma.stock.deleteMany({});

        // CONDITIONAL MODULE: Products
        if (!options.keepProducts) {
            await prisma.bundleItem.deleteMany({});
            await prisma.product.deleteMany({});
            await prisma.model.deleteMany({});
            await prisma.category.deleteMany({});
            await prisma.attribute.deleteMany({});
            await prisma.unitOfMeasure.deleteMany({});
        }

        // CONDITIONAL MODULE: People (Customers/Suppliers)
        if (!options.keepCustomers) {
            await prisma.customer.deleteMany({});
            await prisma.supplier.deleteMany({});
        }

        // CONDITIONAL MODULE: Employees
        if (!options.keepEmployees) {
            await prisma.technician.deleteMany({});
            await prisma.dailyWorkLog.deleteMany({});
            await prisma.employeeTransaction.deleteMany({});
            await prisma.user.deleteMany({});
            await prisma.role.deleteMany({});
        }

        // CONDITIONAL MODULE: Infrastructure (Treasury/Warehouse/Branch)
        if (!options.keepTreasuryAndWarehouses) {
            await prisma.treasury.deleteMany({});
            await prisma.warehouse.deleteMany({});
            
            // Only wipe branch/settings if we are not keeping anything
            if (!options.keepSettings) {
                await prisma.branch.deleteMany({});
                await prisma.storeSettings.deleteMany({});
                await prisma.account.deleteMany({});
            }
        }

    } finally {
        if (isPostgres) {
            try {
                await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin';`);
            } catch {
                // Non-superuser in cloud/managed Postgres
            }
        } else {
            try {
                await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`);
            } catch {
                // SQLite foreign keys fallback
            }
        }
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
    },
    options?: ResetOptions
}) {
    try {
        // Perform selective reset
        await resetForSetup(data.options || {});

        // Ensure core settings exist (Upsert logic to avoid duplication if kept)
        await prisma.storeSettings.upsert({
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

        // We use a transaction for the core structural creation
        const result = await prisma.$transaction(async (tx) => {
            // 1. Branch (Upsert to prevent duplication)
            const branch = await tx.branch.upsert({
                where: { code: "MAIN" },
                update: {
                    name: data.branch.name,
                    type: data.branch.type,
                },
                create: {
                    name: data.branch.name,
                    code: "MAIN",
                    type: data.branch.type,
                }
            });

            // 2. Default Warehouse
            const existingWarehouse = await tx.warehouse.findFirst({
                where: { branchId: branch.id, isDefault: true }
            });
            if (!existingWarehouse) {
                await tx.warehouse.create({
                    data: {
                        name: data.branch.name,
                        branchId: branch.id,
                        isDefault: true,
                    }
                });
            }

            // 3. Default CASH Treasury (Self-heal to prevent P2002 on branchId + name)
            const existingTreasury = await tx.treasury.findFirst({
                where: {
                    branchId: branch.id,
                    OR: [
                        { paymentMethod: 'CASH' },
                        { name: 'الخزنة النقدية' },
                        { id: 'treasury-cash-main' }
                    ]
                }
            });
            if (existingTreasury) {
                await tx.treasury.update({
                    where: { id: existingTreasury.id },
                    data: {
                        name: 'الخزنة النقدية',
                        paymentMethod: 'CASH',
                        isDefault: true,
                        deletedAt: null,
                    }
                });
            } else {
                await tx.treasury.create({
                    data: {
                        id: 'treasury-cash-main',
                        name: 'الخزنة النقدية',
                        paymentMethod: 'CASH',
                        branchId: branch.id,
                        isDefault: true,
                        balance: 0,
                    }
                });
            }

            // 4. Admin User (Upsert)
            const hashedPassword = await bcrypt.hash(data.admin.password, 10);
            await tx.user.upsert({
                where: { username: data.admin.username },
                update: {
                    password: hashedPassword,
                    name: data.admin.name,
                    roleStr: "ADMIN",
                },
                create: {
                    username: data.admin.username,
                    password: hashedPassword,
                    name: data.admin.name,
                    roleStr: "ADMIN",
                    branchId: branch.id
                }
            });

            return { branchId: branch.id };
        });

        // Seed Chart of Accounts if missing
        const { seedAccounts } = await import('@/lib/accounting/seed-accounts');
        await seedAccounts();

        // Seed default units if missing
        const { seedUnits } = await import('@/lib/inventory/seed-units');
        await seedUnits();

        return { success: true };
    } catch (err: any) {
        console.error('[SETUP ERROR] Setup failed:', err);
        return { success: false, error: err?.message || 'Failed to complete system setup.' };
    }
}
