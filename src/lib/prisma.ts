import { PrismaClient } from '@prisma/client';
import path from 'path';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Utility to read dynamic database path from Electron's config if it exists.
// Uses dynamic require so Next.js never statically bundles 'fs' into the client chunk.
function getDynamicDbUrl() {
    if (typeof window !== 'undefined') {
        // Running in the browser bundle — no filesystem access available.
        return process.env.DATABASE_URL;
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
                const config = JSON.parse(rawConfig) as { dbPath?: string };
                if (config.dbPath) {
                    const normalizedDbPath = path.join(config.dbPath, 'local.db').replace(/\\/g, '/');
                    return `file:${normalizedDbPath}`;
                }
            } catch (jsonError) {
                console.warn('Malformed casper-config.json:', jsonError);
            }
        }
    } catch (error) {
        console.warn('Could not read casper-config.json for dynamic DB path, falling back to process.env:', error);
    }
    return process.env.DATABASE_URL;
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
