import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import 'fake-indexeddb/auto';

// ── MSW SETUP ──────────────────────────────────────────────────────────────
export const server = setupServer();

// Generate a unique ID for this test worker's database to prevent locking collisions
const suiteId = Math.random().toString(36).substring(7);
const dbPath = path.resolve(process.cwd(), 'prisma', `test-${suiteId}.db`);

export async function resetTestDB() {
    // Faster truncation reset
    const tables = ['SaleItem', 'Sale', 'Branch', 'Ticket', 'TicketNote', 'StockMovement', 'Stock', 'Warehouse', 'Customer', 'Sequence', 'RepairPayment', 'Account', 'Treasury', 'JournalEntry', 'JournalLine', 'Category', 'Product', 'BundleItem'];
    
    // Disable FK checks and delete all
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');
    for (const table of tables) {
        try {
            await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
        } catch (e) {}
    }
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
}

beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'warn' });
    process.env.DATABASE_URL = `file:${dbPath}`;
    
    // Initial schema push
    execSync(`npx prisma db push --skip-generate --accept-data-loss --force-reset`, {
        env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
        stdio: 'inherit'
    });
});

afterAll(async () => {
    server.close();
    // Cleanup the unique test DB
    try {
        await prisma.$disconnect();
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        if (fs.existsSync(`${dbPath}-journal` )) fs.unlinkSync(`${dbPath}-journal`);
        if (fs.existsSync(`${dbPath}-wal` )) fs.unlinkSync(`${dbPath}-wal`);
        if (fs.existsSync(`${dbPath}-shm` )) fs.unlinkSync(`${dbPath}-shm`);
    } catch (e) {}
});

beforeEach(async () => {
    server.resetHandlers();
    // We don't reset DB on EVERY test for speed, but only when explicitly called in test files
});

// Mock browser globals for node testing
if (typeof navigator === 'undefined') {
    (global as any).navigator = {
        onLine: true
    };
}
