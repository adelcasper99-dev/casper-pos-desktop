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
        // ── WAL mode (returns 'wal' string, so use $queryRaw to avoid 'Execute returned results' error) ────
        await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');

        // ── Foreign key enforcement (doesn't return data) ────────────────
        await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON;');

        // ── Synchronous: NORMAL (doesn't return data) ─
        await prisma.$executeRawUnsafe('PRAGMA synchronous=NORMAL;');

        // ── Database Health Check ────────────────────────────────────────
        logger.info('[DB] Running health check...');
        const integrityCheck = await prisma.$queryRawUnsafe('PRAGMA integrity_check;');
        if (Array.isArray(integrityCheck) && integrityCheck[0]?.integrity_check !== 'ok') {
            logger.error('[DB] Integrity check failed', integrityCheck);
            // In a real desktop app, we might trigger a recovery or alert here
        } else {
            logger.info('[DB] Integrity check passed.');
        }

        logger.info('[DB] SQLite pragmas set: WAL mode, foreign_keys=ON, synchronous=NORMAL');

        // ── Seed / Sync Chart of Accounts (BL-09 fix: ensures system accounts exist on every startup)
        logger.info('[DB] Ensuring system accounts exist...');
        const { seedAccounts } = await import('./accounting/seed-accounts');
        await seedAccounts();
        logger.info('[DB] Chart of Accounts sync complete.');

        // ── Ensure Main Branch (V-05 fix: run once at startup, not on every login)
        const { ensureMainBranch } = await import('./ensure-main-branch');
        await ensureMainBranch();
    } catch (err) {
        logger.error('[DB] initDatabase failed', err);
        // Non-fatal — app can still serve requests, just with reduced safety guarantees
    }
}
