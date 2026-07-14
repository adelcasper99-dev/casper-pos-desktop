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

    // Default to the local SQLite database
    let fallbackUrl = process.env.DATABASE_URL || 'file:./local.db';
    
    // Append busy_timeout for SQLite WAL mode concurrency
    if (fallbackUrl.startsWith('file:') && !fallbackUrl.includes('busy_timeout')) {
        fallbackUrl += fallbackUrl.includes('?') ? '&busy_timeout=10000' : '?busy_timeout=10000';
    }
    
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
