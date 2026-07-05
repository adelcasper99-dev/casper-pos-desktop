import { TrueTime } from './true-time';
import { Hardware } from './hardware';
import { AsarIntegrity } from './asar-integrity';
import { offlineDB } from '@/lib/offline-db';
import jwt from 'jsonwebtoken';

export type LicenseStatus = 
    | 'VALID'
    | 'EXPIRED'
    | 'HARDWARE_INVALIDATED'
    | 'TAMPERED'
    | 'MISSING';

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

        // 2. Fetch License JWT
        const settings = await offlineDB.storeSettings.get('settings');
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

        let decoded: any;
        try {
            decoded = jwt.verify(token, publicKey.replace(/\\n/g, '\n'), { algorithms: ['RS256'] });
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
