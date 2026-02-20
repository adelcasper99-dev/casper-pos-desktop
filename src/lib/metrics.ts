// lib/metrics.ts
/**
 * In-memory metrics collection for production monitoring
 * Server-side only module - should never run in browser
 * Resets on server restart - use Redis for persistence if needed
 */

interface Metrics {
    requests: {
        total: number;
        lastHour: number;
        byPath: Record<string, number>;
    };
    cache: {
        hits: number;
        misses: number;
        hitRate: number;
    };
    database: {
        queries: number;
        slowQueries: number;
        avgDuration: number;
    };
    errors: {
        total: number;
        lastHour: number;
        byType: Record<string, number>;
    };
    redis: {
        commands: number;
        available: boolean;
    };
}

// Server-only check
const isServer = typeof window === 'undefined';

let metrics: Metrics = {
    requests: {
        total: 0,
        lastHour: 0,
        byPath: {},
    },
    cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
    },
    database: {
        queries: 0,
        slowQueries: 0,
        avgDuration: 0,
    },
    errors: {
        total: 0,
        lastHour: 0,
        byType: {},
    },
    redis: {
        commands: 0,
        available: true,
    },
};

// Reset hourly counters (server-only)
if (isServer) {
    setInterval(() => {
        metrics.requests.lastHour = 0;
        metrics.errors.lastHour = 0;
    }, 3600000); // 1 hour
}

export function trackRequest(path: string) {
    if (!isServer) return;
    metrics.requests.total++;
    metrics.requests.lastHour++;
    metrics.requests.byPath[path] = (metrics.requests.byPath[path] || 0) + 1;
}

export function trackCacheHit() {
    if (!isServer) return;
    metrics.cache.hits++;
    updateCacheHitRate();
}

export function trackCacheMiss() {
    if (!isServer) return;
    metrics.cache.misses++;
    updateCacheHitRate();
}

function updateCacheHitRate() {
    if (!isServer) return;
    const total = metrics.cache.hits + metrics.cache.misses;
    metrics.cache.hitRate = total > 0 
        ? Math.round((metrics.cache.hits / total) * 100) 
        : 0;
}

export function trackDatabaseQuery(duration: number) {
    if (!isServer) return;
    metrics.database.queries++;
    
    // Track slow queries (>100ms)
    if (duration > 100) {
        metrics.database.slowQueries++;
    }
    
    // Update rolling average
    const total = metrics.database.queries;
    const currentAvg = metrics.database.avgDuration;
    metrics.database.avgDuration = Math.round(
        ((currentAvg * (total - 1)) + duration) / total
    );
}

export function trackError(error: Error) {
    if (!isServer) return;
    metrics.errors.total++;
    metrics.errors.lastHour++;
    
    const errorType = error.name || 'Unknown';
    metrics.errors.byType[errorType] = (metrics.errors.byType[errorType] || 0) + 1;
}

export function trackRedisCommand() {
    if (!isServer) return;
    metrics.redis.commands++;
}

export function setRedisStatus(available: boolean) {
    if (!isServer) return;
    metrics.redis.available = available;
}

export async function getMetrics() {
    if (!isServer) {
        throw new Error('getMetrics can only be called on the server');
    }
    
    return {
        ...metrics,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            percentage: Math.round(
                (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100
            ),
        },
    };
}

export function resetMetrics() {
    if (!isServer) return;
    metrics = {
        requests: { total: 0, lastHour: 0, byPath: {} },
        cache: { hits: 0, misses: 0, hitRate: 0 },
        database: { queries: 0, slowQueries: 0, avgDuration: 0 },
        errors: { total: 0, lastHour: 0, byType: {} },
        redis: { commands: 0, available: true },
    };
}
