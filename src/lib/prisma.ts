import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createAccountingMiddleware } from './prisma-accounting-middleware';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Utility to read dynamic database path from Electron's config if it exists
function getDynamicDbUrl() {
    try {
        const isWindows = process.platform === 'win32';
        const homeDir = process.env.APPDATA || (isWindows ? process.env.USERPROFILE + '\\AppData\\Roaming' : process.env.HOME + '/Library/Application Support');
        // Electron's default userData folder name is usually the app name from package.json ("casper-pos-desktop")
        // but we'll try to find it. Alternatively, since we know it's "casper-pos-desktop":
        const configPath = path.join(homeDir, 'casper-pos-desktop', 'casper-config.json');

        if (fs.existsSync(configPath)) {
            const rawConfig = fs.readFileSync(configPath, 'utf8');
            try {
                const config = JSON.parse(rawConfig);
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
            timeout: 30000, // 30s for the transaction to complete
        },
    });

// Register Odoo-style accounting middleware for automatic journal entries
// This creates journal entries automatically when CustomerTransaction, 
// SupplierPayment, or EmployeeTransaction are created
prisma.$use(createAccountingMiddleware());

globalForPrisma.prisma = prisma;
