import { PrismaClient } from '@prisma/client';
import path from 'path';
import { app } from 'electron';

const getDatabaseUrl = () => {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

    // In Electron renderer or main process, we need to handle pathing
    // However, this file might be imported in Next.js (server-side)
    // If we're in Next.js production standalone, app.getPath might not be available directly
    // Ideally we pass this via ENV in main.js, which we already do.
    // This fallback is for safety.
    return process.env.DATABASE_URL;
};

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: ['query', 'error', 'warn'],
        datasources: {
            db: {
                url: process.env.DATABASE_URL,
            },
        },
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
