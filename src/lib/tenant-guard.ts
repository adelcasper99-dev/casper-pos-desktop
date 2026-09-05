import { prisma } from '@/lib/prisma';
import Redis from 'ioredis';
import { AsyncLocalStorage } from 'async_hooks';
import { domainToUnicode, domainToASCII } from 'url';

// AsyncLocalStorage for passing tenant context
export const tenantContext = new AsyncLocalStorage<{ tenantId: string }>();

// In-Memory Fast Cache (0ms overhead) with 60-second TTL
// Single-instance memory cache; scalable to Redis Pub/Sub if scaled out across multiple PM2 nodes
interface TenantCacheEntry {
    isActive: boolean;
    expiresAt: number;
}
const localTenantCache = new Map<string, TenantCacheEntry>();
const LOCAL_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const USE_LOCAL_CACHE = process.env.ENABLE_TENANT_IN_MEMORY_CACHE !== 'false';

interface TenantSuspendedError extends Error {
    code?: string;
}

// Lazy init Redis only if explicitly configured in environment
let redisClient: Redis | null = null;
let isRedisChecked = false;

function getRedis(): Redis | null {
    if (isRedisChecked) return redisClient;
    isRedisChecked = true;

    const redisUrl = process.env.REDIS_URL;
    if (redisUrl && redisUrl.trim() !== '') {
        try {
            redisClient = new Redis(redisUrl, {
                connectTimeout: 1000,
                maxRetriesPerRequest: 1,
                lazyConnect: true
            });
        } catch (e) {
            console.warn('[TenantGuard] Failed to initialize Redis client, falling back to in-memory cache:', e);
            redisClient = null;
        }
    }
    return redisClient;
}

export async function requireActiveTenant(rawTenantId: string) {
    if (!rawTenantId || rawTenantId === 'default' || rawTenantId === 'SYSTEM') return;

    let decodedTenantId = rawTenantId;
    try {
        decodedTenantId = decodeURIComponent(rawTenantId);
    } catch (e) {
        // fallback
    }

    const unicodeSlug = domainToUnicode(decodedTenantId);
    const asciiSlug = domainToASCII(unicodeSlug);
    const now = Date.now();

    // 1. Fast Path: In-Memory LRU Cache (0.001ms execution)
    if (USE_LOCAL_CACHE) {
        const cached = localTenantCache.get(unicodeSlug);
        if (cached && cached.expiresAt > now) {
            if (!cached.isActive) {
                const err = new Error('TENANT_SUSPENDED') as TenantSuspendedError;
                err.code = 'TENANT_SUSPENDED';
                throw err;
            }
            return;
        }
    }

    // 2. Secondary Path: Redis Cache (if explicitly configured)
    const r = getRedis();
    const cacheKey = `tenant:active:${unicodeSlug}`;
    if (r) {
        try {
            const cached = await r.get(cacheKey);
            if (cached === 'false') {
                if (USE_LOCAL_CACHE) localTenantCache.set(unicodeSlug, { isActive: false, expiresAt: now + LOCAL_CACHE_TTL_MS });
                const err = new Error('TENANT_SUSPENDED') as TenantSuspendedError;
                err.code = 'TENANT_SUSPENDED';
                throw err;
            } else if (cached === 'true') {
                if (USE_LOCAL_CACHE) localTenantCache.set(unicodeSlug, { isActive: true, expiresAt: now + LOCAL_CACHE_TTL_MS });
                return;
            }
        } catch (redisError) {
            // Non-blocking: continue to DB lookup
        }
    }

    // 3. Database Lookup (Executed only when cache misses or expires)
    const tenantRecord = await prisma.tenant.findFirst({
        where: {
            OR: [
                { id: rawTenantId },
                { id: decodedTenantId },
                { slug: rawTenantId },
                { slug: decodedTenantId },
                { slug: unicodeSlug },
                { slug: asciiSlug }
            ]
        }
    });

    if (!tenantRecord) {
        // Non-existent tenant or main domain host (e.g. ozza); allow graceful fallthrough
        return;
    }

    const isActive = !!tenantRecord.isActive;

    // Update In-Memory cache
    if (USE_LOCAL_CACHE) {
        localTenantCache.set(unicodeSlug, { isActive, expiresAt: now + LOCAL_CACHE_TTL_MS });
    }

    // Update Redis cache asynchronously if connected
    if (r) {
        r.setex(cacheKey, 60, isActive ? 'true' : 'false').catch(() => {});
    }

    if (!isActive) {
        const err = new Error('TENANT_SUSPENDED') as TenantSuspendedError;
        err.code = 'TENANT_SUSPENDED';
        throw err;
    }
}
