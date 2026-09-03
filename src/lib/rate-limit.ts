/**
 * Casper POS Rate Limiting Utility
 * Prevents brute-force and accidental rapid submissions in server actions.
 * Backed by Prisma Database to prevent loss across restarts.
 */
import { prisma } from "./prisma";

export interface RateLimitOptions {
    keyPrefix: string;
    limit: number;
    windowSeconds: number;
}

/**
 * Checks if an identifier has exceeded its rate limit.
 * Uses a probabilistic 5% cleanup job to prevent DB locks (Thundering Herd) during heavy load.
 * Returns { success: boolean, remaining: number, reset: number }
 */
export async function rateLimit(identifier: string, options: RateLimitOptions) {
    const now = new Date();
    const key = `${options.keyPrefix}:${identifier}`;
    const windowMs = options.windowSeconds * 1000;

    // Probabilistic Cleanup (5% chance on each call to purge expired limits globally)
    if (Math.random() < 0.05) {
        // Fire-and-forget — do not block the main execution path
        prisma.rateLimit
            .deleteMany({ where: { resetAt: { lt: now } } })
            .catch((err) =>
                console.warn("[RateLimit Cleanup] Table maybe missing, skipping:", err)
            );
    }

    try {
        const entry = await prisma.rateLimit.findUnique({ where: { key } });

        // Does not exist or is expired — start a fresh window
        if (!entry || entry.resetAt < now) {
            const resetTime = new Date(now.getTime() + windowMs);
            await prisma.rateLimit.upsert({
                where: { key },
                create: { key, count: 1, resetAt: resetTime },
                update: { count: 1, resetAt: resetTime },
            });
            return {
                success: true,
                limit: options.limit,
                remaining: options.limit - 1,
                reset: resetTime.getTime(),
            };
        }

        // Limit already reached
        if (entry.count >= options.limit) {
            return {
                success: false,
                limit: options.limit,
                remaining: 0,
                reset: entry.resetAt.getTime(),
            };
        }

        // Increment counter within current window
        await prisma.rateLimit.update({
            where: { key },
            data: { count: entry.count + 1 },
        });

        return {
            success: true,
            limit: options.limit,
            remaining: options.limit - (entry.count + 1),
            reset: entry.resetAt.getTime(),
        };
    } catch (error) {
        // Fallback: If DB is unreachable, fail open to prevent total system lockout
        console.error("[RateLimit] Database error, bypassing:", error);
        return {
            success: true,
            limit: options.limit,
            remaining: 1,
            reset: now.getTime() + windowMs,
        };
    }
}

/**
 * Resets or clears the rate limit entry for an identifier.
 * Used after successful authentication to clear failure streaks.
 */
export async function clearRateLimit(identifier: string, keyPrefix: string = 'login'): Promise<void> {
    const key = `${keyPrefix}:${identifier}`;
    try {
        await prisma.rateLimit.deleteMany({
            where: { key }
        });
    } catch (error) {
        console.warn("[RateLimit Clear] Error clearing key:", error);
    }
}

