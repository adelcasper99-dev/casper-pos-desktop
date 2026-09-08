/**
 * Database Bootstrap — db-init.ts
 * Called once at server startup before any requests are served.
 *
 * Configures SQLite for production-grade reliability:
 *  - WAL mode:      prevents SQLITE_BUSY under Electron + Next.js concurrent writes
 *  - Foreign keys:  enforces relational integrity (off by default in SQLite)
 *  - synchronous:   NORMAL gives good durability without full fsync overhead
 *
 * Also seeds the Chart of Accounts if it's empty (moved from lazy transaction seeding - BL-09 fix).
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { runWithTenant } from './prisma-tenant-extension';

// ── V-05: Use globalThis to survive Next.js dev hot-reloads ────────────
const globalForDbInit = globalThis as unknown as { dbInitialized: boolean };

export async function initDatabase(): Promise<void> {
    if (globalForDbInit.dbInitialized) {
        // Skip heavy initialization if already done (crucial for dev hot-reloads)
        return;
    }

    // Set flag immediately to prevent concurrent requests from triggering multiple seeds
    globalForDbInit.dbInitialized = true;

    try {
        const isPostgres = process.env.DATABASE_URL?.startsWith('postgres');

        if (!isPostgres) {
            // ── WAL mode
            await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
            // ── Foreign key enforcement
            await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON;');
            // ── Synchronous: NORMAL
            await prisma.$executeRawUnsafe('PRAGMA synchronous=NORMAL;');

            logger.info('[DB] SQLite pragmas set: WAL mode, foreign_keys=ON, synchronous=NORMAL');
        } else {
            logger.info('[DB] PostgreSQL detected, skipping SQLite PRAGMA initialization.');
        }

        const { seedAccounts } = await import('./accounting/seed-accounts');
        const { seedCashCategories } = await import('./accounting/seed-cash-categories');
        const { ensureMainBranch } = await import('./ensure-main-branch');

        // Determine list of tenant IDs to seed
        let tenantIds = ['default'];
        if (isPostgres) {
            try {
                // Read distinct tenants from Tenant table using SYSTEM context
                const tenants = await runWithTenant('SYSTEM', async () => {
                    return await prisma.tenant.findMany({ select: { id: true, slug: true } });
                });
                if (tenants && tenants.length > 0) {
                    tenantIds = Array.from(new Set(['default', ...tenants.map(t => t.slug || t.id)]));
                }
            } catch (e) {
                logger.warn('[DB] Could not list tenants from Tenant table, defaulting to ["default"]', e);
            }
        }

        for (const tenantId of tenantIds) {
            await runWithTenant(tenantId, async () => {
                // ── Seed / Sync Chart of Accounts
                await seedAccounts();

                // ── Seed / Sync Cash Categories
                await seedCashCategories();

                // ── Ensure Store Settings
                let settings = await prisma.storeSettings.findFirst({});
                if (!settings) {
                    await prisma.storeSettings.create({
                        data: {
                            tenantId: tenantId,
                            name: "Casper Store",
                            currency: "EGP",
                            taxRate: 0.0
                        }
                    });
                }

                // ── Ensure Main Branch
                await ensureMainBranch();
            });
        }
        logger.info(`[DB] Initialization and GL account seeding completed for tenants: ${tenantIds.join(', ')}`);
    } catch (err) {
        logger.error('[DB] initDatabase failed', err);
    }
}
