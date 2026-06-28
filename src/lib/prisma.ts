import { PrismaClient } from '@prisma/client';
import path from 'path';

// ---------------------------------------------------------------------------
// Browser / Electron-renderer guard
// ---------------------------------------------------------------------------
// Electron main process:  process.type === 'browser'  (counterintuitive naming)
// Electron renderer:      process.type === 'renderer'
// Next.js server / SSR:   typeof window === 'undefined'
//
// PrismaClient must NEVER be instantiated in the browser or Electron renderer.
// A naive `typeof window === 'undefined'` check can be bypassed by Web Workers.
// The safest check is verifying the presence of Node.js.
const isServerContext: boolean =
    typeof window === 'undefined' &&
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null &&
    (process as NodeJS.Process & { type?: string }).type !== 'renderer';

// ---------------------------------------------------------------------------
// URL resolver
// ---------------------------------------------------------------------------
function getDynamicDbUrl(): string | undefined {
    if (!isServerContext) {
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
        const homeDir =
            process.env.APPDATA ||
            (isWindows
                ? process.env.USERPROFILE + '\\AppData\\Roaming'
                : process.env.HOME + '/Library/Application Support');
        const configPath = path.join(homeDir!, 'casper-pos-desktop', 'casper-config.json');

        if (fs.existsSync(configPath)) {
            const rawConfig = fs.readFileSync(configPath, 'utf8');
            try {
                const config = JSON.parse(rawConfig) as { nodeRole?: string; masterIp?: string };
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

    const fallbackUrl =
        process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/casper_pos';
    if (process.env.NODE_ENV === 'development') {
        console.log(`[PRISMA DEBUG] DB URL resolved to: ${fallbackUrl}`);
    }
    return fallbackUrl;
}

// ---------------------------------------------------------------------------
// StockMovement warehouse guard (replaces deprecated $use middleware)
// ---------------------------------------------------------------------------
// Preserves exact semantics of the old $use guard:
//   • Both keys must be PRESENT in the payload ('in' check) before null test.
//     This avoids false positives on partial-update payloads where only one
//     warehouse key is supplied (e.g. adjustments touching only fromWarehouseId).
//   • Throws only when BOTH are explicitly null simultaneously.
function assertWarehouseIds(data: unknown): void {
    if (
        data !== null &&
        typeof data === 'object' &&
        'fromWarehouseId' in data &&
        'toWarehouseId' in data &&
        (data as Record<string, unknown>).fromWarehouseId === null &&
        (data as Record<string, unknown>).toWarehouseId === null
    ) {
        throw new Error(
            'P2010: StockMovement must have either fromWarehouseId or toWarehouseId (both cannot be null)'
        );
    }
}

// ---------------------------------------------------------------------------
// Singleton factory — only called in server context
// ---------------------------------------------------------------------------
function applyPrismaExtensions(base: PrismaClient) {
    // Migrate from deprecated $use to typed Prisma Client Extension ($extends).
    // $use is removed in Prisma 6; $extends is the stable successor in Prisma 5.
    return base.$extends({
        query: {
            stockMovement: {
                async create({ args, query }) {
                    assertWarehouseIds(args.data);
                    return query(args);
                },
                async update({ args, query }) {
                    assertWarehouseIds(args.data);
                    return query(args);
                },
                async createMany({ args, query }) {
                    const rows = Array.isArray(args.data) ? args.data : [args.data];
                    rows.forEach(assertWarehouseIds);
                    return query(args);
                },
                async updateMany({ args, query }) {
                    assertWarehouseIds(args.data);
                    return query(args);
                },
            },
        },
    });
}

type ExtendedPrismaClientType = ReturnType<typeof applyPrismaExtensions>;
export type { ExtendedPrismaClientType as ExtendedPrismaClient };

function buildPrismaClient(): ExtendedPrismaClientType {
    const base = new PrismaClient({
        log: ['error', 'warn'],
        datasources: {
            db: {
                url: getDynamicDbUrl(),
            },
        },
        // @ts-ignore — Transaction configuration for interactive transactions
        transactionOptions: {
            maxWait: 5000,  // 5 s to acquire a connection
            timeout: 60000, // 60 s for the transaction to complete
        },
    });

    try {
        // If Next.js compiles prisma.ts for a Client Component SSR pass, it may resolve
        // @prisma/client to the browser stub. The stub throws on any property access.
        typeof base.$extends;
    } catch (e: any) {
        if (e && e.message && e.message.includes('browser environment')) {
            console.warn('[Casper] Prisma browser stub detected in Node.js SSR. Returning safe proxy.');
            return makeBrowserStub();
        }
        throw e;
    }

    return applyPrismaExtensions(base);
}

// PrismaTransactionClient — use this instead of `Prisma.TransactionClient` for
// the `tx` parameter in `prisma.$transaction((tx) => ...)` callbacks.
// After $extends, the transaction client is the extended type, not the base one.
export type PrismaTransactionClient = Parameters<
    Parameters<ExtendedPrismaClientType['$transaction']>[0]
>[0];


// ---------------------------------------------------------------------------
// Global singleton (HMR-safe)
// ---------------------------------------------------------------------------
const globalForPrisma = global as unknown as { prisma: ExtendedPrismaClientType };

// ---------------------------------------------------------------------------
// Browser / renderer stub — replaces cryptic Prisma internals crash with a
// clear, actionable error that names the broken import chain.
// ---------------------------------------------------------------------------
function makeBrowserStub(): ExtendedPrismaClientType {
    return new Proxy({} as ExtendedPrismaClientType, {
        get(_target, prop: string | symbol) {
            throw new Error(
                `[Casper] prisma.${String(prop)} was called in a browser/renderer context. ` +
                `prisma.ts is a server-only module — trace your import chain for a ` +
                `client component that statically imports a server action or lib file.`
            );
        },
    });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export const prisma: ExtendedPrismaClientType = isServerContext
    ? (globalForPrisma.prisma ?? buildPrismaClient())
    : makeBrowserStub();

// Persist singleton for Next.js HMR (avoids "too many Prisma clients" warnings)
if (isServerContext) {
    globalForPrisma.prisma = prisma;
}
