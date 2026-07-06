const baseDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/casper_pos';
const testDbUrl = baseDbUrl.endsWith('_test') ? baseDbUrl : `${baseDbUrl}_test`;
process.env.DATABASE_URL = testDbUrl;

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

const dbPath = path.resolve(
    process.cwd(),
    'prisma',
    process.env.DATABASE_URL!.replace('file:', '').split('/').pop()!
);

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

let originalSchema = '';

beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'warn' });
    
    const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
    
    if (fs.existsSync(schemaPath)) {
        originalSchema = fs.readFileSync(schemaPath, 'utf8');
        // Temporarily rewrite provider = "postgresql" to provider = "sqlite"
        const patchedSchema = originalSchema.replace(
            /provider\s*=\s*"postgresql"/g,
            'provider = "sqlite"'
        );
        fs.writeFileSync(schemaPath, patchedSchema, 'utf8');
    }
    
    try {
        // Initial schema push
        execSync(`npx prisma db push --skip-generate --accept-data-loss --force-reset`, {
            env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
            stdio: 'inherit'
        });
    } catch (error) {
        console.error('Error during prisma db push:', error);
        throw error;
    }
});

afterAll(async () => {
    server.close();
    
    // Restore original schema.prisma
    if (originalSchema) {
        const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
        fs.writeFileSync(schemaPath, originalSchema, 'utf8');
    }

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
