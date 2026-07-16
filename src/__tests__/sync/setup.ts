const testDbUrl = process.env.DATABASE_URL!;

console.log(`\n[TEST SETUP] Running db push for test database: ${testDbUrl}`);

import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import 'fake-indexeddb/auto';
import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';

import { http, passthrough } from 'msw';

// Generate key pair for testing (RS256 requires min 2048 bits in newer Node/OpenSSL)
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
});

process.env.LICENSE_PUBLIC_KEY = publicKey;

// Sign a valid JWT for testing
export const testLicenseJwt = jwt.sign({
    tenant_id: 'test-tenant',
    status: 'active',
    trial_ends_at: new Date('2029-12-31').toISOString(),
    server_now: new Date().toISOString(),
    machine_id: 'test-machine'
}, privateKey, { algorithm: 'RS256' });

export const syncHeaders = {
    'Content-Type': 'application/json',
    'x-license-jwt': testLicenseJwt
};

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
    // Faster truncation reset
    const tables = [
        'SaleItem', 'Sale', 'Branch', 'Ticket', 'TicketNote', 
        'StockMovement', 'Stock', 'Warehouse', 'Customer', 'Sequence', 
        'RepairPayment', 'JournalLine', 'JournalEntry', 'Account', 'Treasury',
        'BundleItem', 'Product', 'Category'
    ];
    
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
