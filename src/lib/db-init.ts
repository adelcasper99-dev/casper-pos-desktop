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

let initialized = false;

export async function initDatabase(): Promise<void> {
    if (initialized) return;
    initialized = true;

    try {
        // ── WAL mode (prevents SQLITE_BUSY under concurrent writes) ──────────
        await prisma.$executeRawUnsafe('PRAGMA journal_mode=WAL;');

        // ── Foreign key enforcement (off by default in SQLite) ────────────────
        await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON;');

        // ── Synchronous: NORMAL (fast + safe; FULL = fsync every write = slow) ─
        await prisma.$executeRawUnsafe('PRAGMA synchronous=NORMAL;');

        console.log('[DB] SQLite pragmas set: WAL mode, foreign_keys=ON, synchronous=NORMAL');

        // ── Seed Chart of Accounts if empty (BL-09 fix: moved out of transactions) ─
        const accountCount = await prisma.account.count();
        if (accountCount === 0) {
            console.log('[DB] Chart of Accounts empty — seeding...');
            const { seedAccounts } = await import('./accounting/seed-accounts');
            await seedAccounts();
            console.log('[DB] Chart of Accounts seeded successfully.');
        }
    } catch (err) {
        console.error('[DB] initDatabase failed:', err);
        // Non-fatal — app can still serve requests, just with reduced safety guarantees
    }
}
