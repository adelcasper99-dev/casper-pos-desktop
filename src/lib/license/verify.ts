import { TrueTime } from './true-time';
import { Hardware } from './hardware';
import { AsarIntegrity } from './asar-integrity';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

export type LicenseStatus = 
    | 'VALID'
    | 'EXPIRED'
    | 'HARDWARE_INVALIDATED'
    | 'TAMPERED'
    | 'MISSING'
    | 'ERROR'; // Server-side catch-all for verification exceptions

/** Shape of the RS256 JWT payload signed by the cloud backend */
interface LicensePayload {
    tenant_id: string;
    status: string;
    trial_ends_at: string;
    server_now: string;
    machine_id: string;
    iat?: number;
    exp?: number;
}

export interface LicenseCheckResult {
    status: LicenseStatus;
    errorCode?: string;
    message?: string;
    expiresAt?: Date | null;
}

export class LicenseVerifier {
    static async verify(): Promise<LicenseCheckResult> {
        // 1. ASAR Integrity Check
        const isIntact = await AsarIntegrity.checkIntegrity();
        if (!isIntact) {
            return {
                status: 'TAMPERED',
                errorCode: 'ASAR-01',
                message: 'System integrity compromised. Reinstall required.'
            };
        }

        // 2. Fetch License JWT from Server Database (Prisma)
        // Since LicenseVerifier runs server-side during SSR, it must query the SQLite/Postgres DB.
        const settings = await prisma.storeSettings.findUnique({
            where: { id: 'settings' }
        });
        const token = settings?.licenseJwt;

        if (!token) {
            return {
                status: 'MISSING',
                errorCode: 'LIC-01',
                message: 'No license installed.'
            };
        }

        // 3. Signature Verification
        const publicKey = process.env.VITE_LICENSE_PUBLIC_KEY || process.env.LICENSE_PUBLIC_KEY;
        if (!publicKey) {
            return {
                status: 'TAMPERED',
                errorCode: 'KEY-01',
                message: 'Public key missing from build environment.'
            };
        }

        let decoded: LicensePayload;
        try {
            decoded = jwt.verify(token, publicKey.replace(/\\n/g, '\n'), { algorithms: ['RS256'] }) as LicensePayload;
        } catch (error) {
            return {
                status: 'TAMPERED',
                errorCode: 'SIG-01',
                message: 'Invalid license signature.'
            };
        }

        // 3.5. Seed TrueTime from license signature if local DB is behind or empty
        try {
            if (decoded.server_now) {
                const serverTimeFromLicense = new Date(decoded.server_now).getTime();
                if (!settings?.lastServerNow || settings.lastServerNow < serverTimeFromLicense) {
                    await TrueTime.updateServerTime(serverTimeFromLicense);
                }
            }
        } catch (err) {
            // Ignore to prevent blocking on write errors
        }

        // 4. Hardware Verification
        try {
            const actualMachineId = await Hardware.getMachineId();
            if (actualMachineId !== decoded.machine_id) {
                return {
                    status: 'HARDWARE_INVALIDATED',
                    errorCode: 'HWD-01',
                    message: 'Hardware change detected. License bound to a different machine.'
                };
            }
        } catch (error) {
            return {
                status: 'HARDWARE_INVALIDATED',
                errorCode: 'HWD-02',
                message: 'Failed to verify hardware identity.'
            };
        }

        // 5. True Time Verification
        let nowMs: number;
        try {
            await TrueTime.initialize(); // Ensure time is synced
            nowMs = await TrueTime.getNow();
        } catch (error: any) {
            return {
                status: 'TAMPERED',
                errorCode: 'TIME-01',
                message: error.message || 'Failed to establish secure time baseline.'
            };
        }
        const trialEndsAtMs = new Date(decoded.trial_ends_at).getTime();

        if (nowMs > trialEndsAtMs) {
            return {
                status: 'EXPIRED',
                errorCode: 'EXP-01',
                message: 'License expired.',
                expiresAt: new Date(trialEndsAtMs)
            };
        }

        return {
            status: 'VALID',
            expiresAt: new Date(trialEndsAtMs)
        };
    }
}
