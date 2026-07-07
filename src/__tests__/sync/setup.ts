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

// Extract absolute path for cleanup
const dbAbsPath = process.env.DATABASE_URL!.replace('file:', '');

export async function resetTestDB() {
    // Faster truncation reset
    const tables = [
        'SaleItem', 'Sale', 'Branch', 'Ticket', 'TicketNote', 'StockMovement', 
        'Stock', 'Warehouse', 'Customer', 'Sequence', 'RepairPayment', 
        'Tenant', 'StaffOverrideLog'
    ];
    
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
    
    const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
    
    try {
        // Initial schema push (skip-generate because globalSetup already generated the sqlite client)
        execSync(`npx prisma db push --schema=prisma/schema.test.prisma --skip-generate --accept-data-loss --force-reset`, {
            env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
            stdio: 'inherit'
        });
    } catch (error) {
        console.error('Error during prisma db push:', error);
        throw error;
    }
});

afterAll(async () => {
    server.close();
    
    // Restore original schema.prisma and generation is handled by globalSetup

    // Cleanup the unique test DB
    try {
        await prisma.$disconnect();
        if (fs.existsSync(dbAbsPath)) fs.unlinkSync(dbAbsPath);
        if (fs.existsSync(`${dbAbsPath}-journal` )) fs.unlinkSync(`${dbAbsPath}-journal`);
        if (fs.existsSync(`${dbAbsPath}-wal` )) fs.unlinkSync(`${dbAbsPath}-wal`);
        if (fs.existsSync(`${dbAbsPath}-shm` )) fs.unlinkSync(`${dbAbsPath}-shm`);
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
