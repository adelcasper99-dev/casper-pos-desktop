import { TrueTime } from './true-time';
import { Hardware } from './hardware';
import { AsarIntegrity } from './asar-integrity';
import { prisma, isPostgres } from '@/lib/prisma';
import { CloudConfigManager } from '@/utils/cloudConfigManager';
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
        const settings = await prisma.storeSettings.findFirst({});
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

        // 4. Hardware Verification & Watermark Validation
        try {
            // If the license was issued for a cloud/web deployment, bypass strict SMBIOS hardware checks
            if (!decoded.machine_id.startsWith('cloud-')) {
                const actualMachineId = await Hardware.getMachineId();
                if (!actualMachineId) {
                    return {
                        status: 'HARDWARE_INVALIDATED',
                        errorCode: 'HWD-03',
                        message: 'Hardware signature could not be resolved. Verification halted.'
                    };
                }

                if (actualMachineId !== decoded.machine_id) {
                    return {
                        status: 'HARDWARE_INVALIDATED',
                        errorCode: 'HWD-01',
                        message: 'Hardware change detected. License bound to a different machine.'
                    };
                }

                // Cryptographic Database Watermark Validation (only on SQLite local nodes)
                const config = await CloudConfigManager.getCloudConfig();
                const checkPostgres = typeof isPostgres !== 'undefined' ? isPostgres : false;
                if (!checkPostgres && config.enabled && config.syncSecret && prisma.$executeRawUnsafe && prisma.$queryRawUnsafe) {
                    const crypto = require('crypto') as typeof import('crypto');
                    const watermarkSource = `${decoded.tenant_id}:${config.syncSecret}:${actualMachineId}`;
                    const expectedWatermark = crypto.createHmac('sha256', config.syncSecret)
                        .update(watermarkSource)
                        .digest('hex');

                    // Create watermark table if it does not exist
                    await prisma.$executeRawUnsafe(`
                        CREATE TABLE IF NOT EXISTS "_SystemMetadata" (
                            "key" TEXT PRIMARY KEY,
                            "value" TEXT NOT NULL
                        );
                    `);

                    const metadata: any[] = await prisma.$queryRawUnsafe(`
                        SELECT "value" FROM "_SystemMetadata" WHERE "key" = 'watermark';
                    `);

                    const storedWatermark = metadata[0]?.value;

                    if (!storedWatermark) {
                        // First activation: write the watermark
                        await prisma.$executeRawUnsafe(`
                            INSERT INTO "_SystemMetadata" ("key", "value") VALUES ('watermark', '${expectedWatermark}');
                        `);
                    } else if (storedWatermark !== expectedWatermark) {
                        return {
                            status: 'HARDWARE_INVALIDATED',
                            errorCode: 'HWD-04',
                            message: 'Database security validation failed. Unauthorized machine copy detected.'
                        };
                    }
                }
            }
        } catch (error: any) {
            console.error('[Hardware verification error]', error);
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
