'use server';

import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

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
        if (!machineId) {
            return { success: false, error: 'Could not determine machine ID.' };
        }
        if (!activationCode) {
            return { success: false, error: 'Activation code is required.' };
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
                return { success: false, error: 'Invalid or already-used activation code.' };
            }
            throw txError;
        }

        // Sign JWT
        const payload = {
            tenant_id: updatedTenant.id,
            status: updatedTenant.status,
            trial_ends_at: updatedTenant.trialEndsAt.toISOString(),
            server_now: new Date().toISOString(),
            machine_id: machineId,
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

        return { success: true };

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[activateLicense]', msg);
        return { success: false, error: msg };
    }
}
