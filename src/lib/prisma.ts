import { PrismaClient } from '@prisma/client';
import path from 'path';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Utility to read dynamic database path from Electron's config if it exists.
// Uses dynamic require so Next.js never statically bundles 'fs' into the client chunk.
function getDynamicDbUrl() {
    if (typeof window !== 'undefined') {
        // Running in the browser bundle
        return process.env.DATABASE_URL;
    }

    if (process.env.NODE_ENV === 'test') {
        return process.env.DATABASE_URL;
    }

    // If we're booted by Electron, main.js passes NODE_ROLE and MASTER_IP
    if (process.env.NODE_ROLE) {
        return process.env.DATABASE_URL || 'file:./local.db';
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs') as typeof import('fs');
        const isWindows = process.platform === 'win32';
        const homeDir = process.env.APPDATA || (isWindows ? process.env.USERPROFILE + '\\AppData\\Roaming' : process.env.HOME + '/Library/Application Support');
        const configPath = path.join(homeDir!, 'casper-pos-desktop', 'casper-config.json');

        if (fs.existsSync(configPath)) {
            const rawConfig = fs.readFileSync(configPath, 'utf8');
            try {
                const config = JSON.parse(rawConfig) as { nodeRole?: string, masterIp?: string };
                if (config.nodeRole) {
                    return process.env.DATABASE_URL || 'file:./local.db';
                }
            } catch (jsonError) {
                console.warn('Malformed casper-config.json:', jsonError);
            }
        }
    } catch (error) {
        console.warn('Could not read casper-config.json for dynamic DB path, falling back to process.env:', error);
    }
    
    const fallbackUrl = process.env.DATABASE_URL || 'file:./local.db';
    console.log(`[PRISMA DEBUG] PrismaClient getDynamicDbUrl returned: ${fallbackUrl}`);
    return fallbackUrl;
}

import { prismaTenantExtension, getTenantId } from './prisma-tenant-extension';

const basePrisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: ['error', 'warn'],
        datasources: {
            db: {
                url: getDynamicDbUrl(),
            },
        },
        // @ts-ignore - Transaction configuration for interactive transactions
        transactionOptions: {
            maxWait: 5000, // 5s to wait for a connection
            timeout: 60000, // 60s for the transaction to complete
        },
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = basePrisma;
}

export const prisma = basePrisma.$extends(prismaTenantExtension);

export const isPostgres = 
    process.env.DATABASE_URL?.startsWith('postgres') || 
    process.env.DATABASE_URL?.startsWith('postgresql');

/**
 * Execute a transaction setting the PostgreSQL RLS context first.
 */
export async function secureTransaction<T>(
    fn: (tx: Omit<typeof prisma, '$transaction' | '$extends'>) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
): Promise<T> {
    const tenantId = getTenantId();
    return await prisma.$transaction(async (tx) => {
        if (isPostgres && tenantId) {
            // @ts-ignore
            await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
        }
        return await fn(tx as any);
    }, options);
}

/**
 * Execute a raw query setting the PostgreSQL RLS context first.
 */
export async function secureRawQuery<T>(
    fn: (tx: Omit<typeof prisma, '$transaction' | '$extends'>) => Promise<T>
): Promise<T> {
    return await secureTransaction(fn);
}

