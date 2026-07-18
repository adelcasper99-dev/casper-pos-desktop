'use server';

import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { headers } from 'next/headers';
import { z } from 'zod';

// In-process rate limiter (5 attempts / 15 minutes per IP)
const attemptMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const WINDOW_MS = 15 * 60 * 1000;
    const entry = attemptMap.get(ip);
    
    if (!entry || now > entry.resetAt) {
        attemptMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return true;
    }
    
    if (entry.count >= 5) {
        return false;
    }
    
    entry.count++;
    return true;
}

const activateSchema = z.object({
    activationCode: z.string().regex(/^CASPER-[A-Z0-9]{6}$/),
    machineId: z.string().min(1).max(512),
});

interface DBTenant {
    id: string;
    status: string;
    trialEndsAt: Date;
    branchId?: string | null;
    syncSecret?: string | null;
}

/**
 * Server action: performs license activation directly via Prisma.
 *
 * Inlines the /api/license/activate logic to avoid a self-HTTP-call
 * that would fail when cloudUrl is not yet configured (bootstrap scenario).
 *
 * machineId is fetched client-side (Electron IPC or server IP for cloud mode)
 * so it identifies the correct machine, not the Next.js process.
 */
export async function activateLicense(activationCode: string, machineId: string) {
    try {
        // 1. Rate Limiting Check
        let ip = 'unknown';
        try {
            const reqHeaders = await headers();
            ip = reqHeaders.get('x-forwarded-for') ?? reqHeaders.get('x-real-ip') ?? 'unknown';
        } catch (e) {
            // fallback if headers() cannot be called
        }

        if (!checkRateLimit(ip)) {
            return { success: false, error: 'RATE_LIMITED' };
        }

        // 2. Zod Validation
        const validation = activateSchema.safeParse({ activationCode, machineId });
        if (!validation.success) {
            return { success: false, error: 'INVALID_FORMAT' };
        }

        const privateKey = process.env.LICENSE_PRIVATE_KEY;
        if (!privateKey) {
            return { success: false, error: 'Server configuration error: missing LICENSE_PRIVATE_KEY.' };
        }

        // Atomic single-use activation — prevents double-spend
        let updatedTenant;
        try {
            updatedTenant = await prisma.$transaction(async (tx) => {
                const tenant = await tx.tenant.findUnique({
                    where: { activationCode }
                });

                if (!tenant || tenant.status !== 'active') {
                    throw new Error('INVALID_CODE');
                }

                return tx.tenant.update({
                    where: {
                        id: tenant.id,
                        activationCode: activationCode // optimistic guard
                    },
                    data: {
                        activationCode: null, // single-use: burn the code
                        machineId: machineId,
                    }
                });
            });
        } catch (txError: unknown) {
            const err = txError as { message?: string; code?: string };
            if (err.message === 'INVALID_CODE' || err.code === 'P2025') {
                return { success: false, error: 'INVALID_CODE' };
            }
            throw txError;
        }

        const tenantObj = updatedTenant as DBTenant;

        if (!tenantObj.branchId || !tenantObj.syncSecret) {
            return { success: false, error: 'SCHEMA_ERROR' };
        }

        // Sign JWT
        const payload = {
            tenant_id: tenantObj.id,
            status: tenantObj.status,
            trial_ends_at: tenantObj.trialEndsAt.toISOString(),
            server_now: new Date().toISOString(),
            machine_id: machineId,
            branch_id: tenantObj.branchId,
            sync_secret: tenantObj.syncSecret,
        };

        const token = jwt.sign(payload, privateKey.replace(/\\n/g, '\n'), { algorithm: 'RS256' });

        // Persist JWT so middleware can verify on every request
        await prisma.storeSettings.upsert({
            where:  { id: 'settings' },
            create: {
                id:            'settings',
                name:          'Casper Store',
                licenseJwt:    token,
                lastServerNow: Date.now(),
            },
            update: {
                licenseJwt:    token,
                lastServerNow: Date.now(),
            },
        });

        return { 
            success: true,
            branchId: tenantObj.branchId,
            syncSecret: tenantObj.syncSecret,
            cloudUrl: process.env.NEXT_PUBLIC_CLOUD_URL ?? 'https://api.casper-erp.com'
        };

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[activateLicense]', msg);
        return { success: false, error: msg };
    }
}
