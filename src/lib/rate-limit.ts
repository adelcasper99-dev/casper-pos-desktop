/**
 * Casper POS Rate Limiting Utility
 * Prevents brute-force and accidental rapid submissions in server actions.
 * NOTE: This is in-memory and scales per-instance.
 */

type RateLimitEntry = {
    count: number;
    resetAt: number;
};

const cache = new Map<string, RateLimitEntry>();

export interface RateLimitOptions {
    keyPrefix: string;
    limit: number;
    windowSeconds: number;
}

/**
 * Checks if an identifier has exceeded its rate limit.
 * Returns { success: boolean, remaining: number, resetAt: number }
 */
export async function rateLimit(identifier: string, options: RateLimitOptions) {
    const now = Date.now();
    const key = `${options.keyPrefix}:${identifier}`;
    const windowMs = options.windowSeconds * 1000;
    
    // Cleanup old entries periodically (every 1000 calls)
    if (cache.size > 1000) {
        // Fix for downlevel iteration error: Convert to array for iteration
        Array.from(cache.entries()).forEach(([k, v]) => {
            if (v.resetAt < now) cache.delete(k);
        });
    }

    let entry = cache.get(key);

    if (!entry || entry.resetAt < now) {
        entry = {
            count: 1,
            resetAt: now + windowMs
        };
        cache.set(key, entry);
        return { 
            success: true, 
            limit: options.limit, 
            remaining: options.limit - 1, 
            reset: entry.resetAt 
        };
    }

    if (entry.count >= options.limit) {
        return { 
            success: false, 
            limit: options.limit, 
            remaining: 0, 
            reset: entry.resetAt 
        };
    }

    entry.count += 1;
    return { 
        success: true, 
        limit: options.limit, 
        remaining: options.limit - entry.count, 
        reset: entry.resetAt 
    };
}
