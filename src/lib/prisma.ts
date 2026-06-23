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

    // If we're booted by Electron, main.js passes NODE_ROLE and MASTER_IP
    if (process.env.NODE_ROLE) {
        if (process.env.NODE_ROLE === 'SUB_NODE' && process.env.MASTER_IP) {
            return `postgresql://postgres:postgres@${process.env.MASTER_IP}:5432/casper_pos`;
        }
        return 'postgresql://postgres:postgres@127.0.0.1:5432/casper_pos';
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
                if (config.nodeRole === 'SUB_NODE' && config.masterIp) {
                    return `postgresql://postgres:postgres@${config.masterIp}:5432/casper_pos`;
                }
                if (config.nodeRole === 'MASTER') {
                    return 'postgresql://postgres:postgres@127.0.0.1:5432/casper_pos';
                }
            } catch (jsonError) {
                console.warn('Malformed casper-config.json:', jsonError);
            }
        }
    } catch (error) {
        console.warn('Could not read casper-config.json for dynamic DB path, falling back to process.env:', error);
    }
    
    const fallbackUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/casper_pos';
    if (process.env.NODE_ENV === 'development') {
        console.log(`[PRISMA DEBUG] DB URL resolved to: ${fallbackUrl}`);
    }
    return fallbackUrl;
}

export const prisma =
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

globalForPrisma.prisma = prisma;
