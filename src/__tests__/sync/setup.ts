import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import 'fake-indexeddb/auto';

import { http, passthrough } from 'msw';

// ── MSW SETUP ──────────────────────────────────────────────────────────────
export const server = setupServer(
    http.get('http://localhost:4040/*', () => passthrough()),
    http.post('http://localhost:4040/*', () => passthrough()),
    http.get('http://127.0.0.1:4040/*', () => passthrough()),
    http.post('http://127.0.0.1:4040/*', () => passthrough()),
    http.get('http://10.255.255.255:4040/*', () => passthrough())
);

// Use a dedicated local test database for Vitest
const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/casper_pos_test';

export async function resetTestDB() {
    // PostgreSQL truncation reset
    const tables = ['SaleItem', 'Sale', 'Branch', 'Ticket', 'TicketNote', 'StockMovement', 'Stock', 'Warehouse', 'Customer', 'Sequence', 'RepairPayment'];
    
    try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tables.join('", "')}" CASCADE;`);
    } catch (e) {
        console.error('Failed to truncate tables:', e);
    }
}

beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'warn' });
    process.env.DATABASE_URL = TEST_DB_URL;
    
    // Initial schema push
    execSync(`npx prisma db push --skip-generate --accept-data-loss --force-reset`, {
        env: { ...process.env, DATABASE_URL: TEST_DB_URL },
        stdio: 'inherit'
    });
});

afterAll(async () => {
    server.close();
    try {
        await prisma.$disconnect();
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
