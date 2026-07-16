/**
 * Browser stub for @/lib/prisma.
 *
 * Webpack substitutes this file for client-side bundles via resolve.alias in
 * next.config.js. This prevents Prisma (a Node.js-only library) from being
 * included in the client chunk.
 *
 * All actual database calls happen server-side through Server Actions.
 * No code in this file is ever executed — it only satisfies the module graph.
 */
export const prisma = null as any;
export const isPostgres = false;

export async function secureTransaction<T>(
    _fn: (tx: any) => Promise<T>,
    _options?: { maxWait?: number; timeout?: number }
): Promise<T> {
    throw new Error('[FATAL] secureTransaction cannot be called in a browser context.');
}

export async function secureRawQuery<T>(
    _fn: (tx: any) => Promise<T>
): Promise<T> {
    throw new Error('[FATAL] secureRawQuery cannot be called in a browser context.');
}
