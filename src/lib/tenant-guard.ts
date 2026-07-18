import { prisma } from '@/lib/prisma';
import Redis from 'ioredis';
import { AsyncLocalStorage } from 'async_hooks';

// AsyncLocalStorage for passing tenant context
export const tenantContext = new AsyncLocalStorage<{ tenantId: string }>();

// Lazy init Redis
let redis: Redis;
function getRedis() {
    if (!redis) {
        redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    }
    return redis;
}

export async function requireActiveTenant(tenantId: string) {
    if (!tenantId || tenantId === 'default') return;

    const cacheKey = `tenant:active:${tenantId}`;
    const r = getRedis();
    
    try {
        const cached = await r.get(cacheKey);
        if (cached === 'false') {
            const err = new Error('TENANT_SUSPENDED');
            (err as any).code = 'TENANT_SUSPENDED';
            throw err;
        } else if (cached === 'true') {
            return;
        }

        const tenantRecord = await prisma.tenant.findFirst({
            where: {
                OR: [
                    { id: tenantId },
                    { slug: tenantId }
                ]
            }
        });

        if (!tenantRecord) {
            const err = new Error('TENANT_NOT_FOUND');
            (err as any).code = 'TENANT_NOT_FOUND';
            throw err;
        }

        if (!tenantRecord.isActive) {
            await r.setex(cacheKey, 60, 'false');
            const err = new Error('TENANT_SUSPENDED');
            (err as any).code = 'TENANT_SUSPENDED';
            throw err;
        }

        await r.setex(cacheKey, 60, 'true');
    } catch (error) {
        if (error instanceof Error && ((error as any).code === 'TENANT_SUSPENDED' || (error as any).code === 'TENANT_NOT_FOUND')) {
            throw error;
        }
        // Fallback if Redis fails
        const tenantRecord = await prisma.tenant.findFirst({
            where: {
                OR: [
                    { id: tenantId },
                    { slug: tenantId }
                ]
            }
        });
        if (!tenantRecord || !tenantRecord.isActive) {
            const err = new Error('TENANT_SUSPENDED');
            (err as any).code = 'TENANT_SUSPENDED';
            throw err;
        }
    }
}
