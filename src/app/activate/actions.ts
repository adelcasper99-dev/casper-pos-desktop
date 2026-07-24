'use server';

import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { headers } from 'next/headers';
import { z } from 'zod';
import { CloudConfigManager } from '@/utils/cloudConfigManager';

// In-process rate limiter (5 attempts / 15 minutes per IP)
const attemptMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const WINDOW_MS = 15 * 60 * 1000;

    if (attemptMap.size > 2048) {
        attemptMap.forEach((val, key) => {
            if (now > val.resetAt) attemptMap.delete(key);
        });
    }

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
    activationCode: z.string().transform(val => {
        const clean = val.trim().toUpperCase();
        return clean.startsWith("CASPER-") ? clean : `CASPER-${clean}`;
    }).pipe(
        z.string().min(6).max(64)
    ),
    machineId: z.string().min(1).max(512),
});

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

        // Atomic license activation — queries License table by key
        let tenantObj: any = null;
        let licenseRecord: any = null;

        try {
            // 1. Look up key in License table
            licenseRecord = await prisma.license.findUnique({
                where: { key: activationCode },
                include: { tenant: true }
            });

            if (licenseRecord && licenseRecord.tenant) {
                tenantObj = licenseRecord.tenant;
            } else {
                // 2. Fallback: check if tenant ID matches directly
                tenantObj = await prisma.tenant.findUnique({
                    where: { id: activationCode }
                });
            }

            if (!tenantObj || tenantObj.isActive === false) {
                return { success: false, error: 'INVALID_CODE' };
            }

            // Update License macAddress with machineId if found
            if (licenseRecord) {
                await prisma.license.update({
                    where: { id: licenseRecord.id },
                    data: { macAddress: machineId, status: 'ACTIVE' }
                });
            }
        } catch (dbError: any) {
            console.error('[Activate] DB lookup error:', dbError);
            return { success: false, error: 'INVALID_CODE' };
        }

        if (!tenantObj.branchId || !tenantObj.syncSecret) {
            return { success: false, error: 'SCHEMA_ERROR' };
        }

        // Sign JWT
        const payload = {
            tenant_id: tenantObj.id,
            status: tenantObj.status || 'ACTIVE',
            trial_ends_at: licenseRecord ? licenseRecord.expiresAt.toISOString() : new Date('2099-12-31').toISOString(),
            server_now: new Date().toISOString(),
            machine_id: machineId,
            branch_id: tenantObj.branchId,
        };

        const token = jwt.sign(payload, privateKey.replace(/\\n/g, '\n'), { algorithm: 'RS256' });

        // Persist JWT so middleware can verify on every request
        await prisma.storeSettings.upsert({
            where:  { id: 'settings' },
            create: {
                id:            'settings',
                name:          'Casper Store',
                licenseJwt:    token,
                licenseKey:    activationCode,
                lastServerNow: Date.now(),
            },
            update: {
                licenseJwt:    token,
                licenseKey:    activationCode,
                lastServerNow: Date.now(),
            },
        });

        // Compute and write local SQLite database watermark
        if (tenantObj.syncSecret && machineId) {
            const crypto = require('crypto');
            const watermarkSource = `${tenantObj.id}:${tenantObj.syncSecret}:${machineId}`;
            const watermark = crypto.createHmac('sha256', tenantObj.syncSecret)
                .update(watermarkSource)
                .digest('hex');

            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "_SystemMetadata" (
                    "key" TEXT PRIMARY KEY,
                    "value" TEXT NOT NULL
                );
            `);

            await prisma.$executeRawUnsafe(`
                INSERT INTO "_SystemMetadata" ("key", "value") 
                VALUES ('watermark', '${watermark}')
                ON CONFLICT("key") DO UPDATE SET "value" = excluded.value;
            `);
        }

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

export async function saveEmergencyLicense(token: string) {
    try {
        const publicKey = process.env.VITE_LICENSE_PUBLIC_KEY || process.env.LICENSE_PUBLIC_KEY;
        if (!publicKey) {
            return { success: false, error: 'KEY_MISSING' };
        }

        let decoded: any;
        try {
            decoded = jwt.verify(token, publicKey.replace(/\\n/g, '\n'), { algorithms: ['RS256'] });
        } catch (e) {
            return { success: false, error: 'INVALID_SIGNATURE' };
        }

        // Persist JWT to SQLite
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

        // Compute watermark with new MAC
        const config = await CloudConfigManager.getCloudConfig();
        if (config.enabled && config.syncSecret && decoded.machine_id) {
            const crypto = require('crypto');
            const watermarkSource = `${decoded.tenant_id}:${config.syncSecret}:${decoded.machine_id}`;
            const watermark = crypto.createHmac('sha256', config.syncSecret)
                .update(watermarkSource)
                .digest('hex');

            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "_SystemMetadata" (
                    "key" TEXT PRIMARY KEY,
                    "value" TEXT NOT NULL
                );
            `);

            await prisma.$executeRawUnsafe(`
                INSERT INTO "_SystemMetadata" ("key", "value") 
                VALUES ('watermark', '${watermark}')
                ON CONFLICT("key") DO UPDATE SET "value" = excluded.value;
            `);
        }

        return { success: true };
    } catch (error: any) {
        console.error('[saveEmergencyLicense]', error);
        return { success: false, error: error.message };
    }
}

/**
 * Server Action for One-Click Cloud Login Activation on Desktop Terminals.
 * Authenticates user credentials with Cloud HQ server, retrieves JWT license & syncSecret,
 * and initializes local SQLite settings.
 */
export async function activateByCloudLogin(cloudUrl: string, username: string, pass: string, machineId: string) {
    try {
        const cleanUrl = cloudUrl.replace(/\/$/, "");
        const response = await fetch(`${cleanUrl}/api/license/staff-verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, pass, machineId })
        });

        if (!response.ok) {
            const errText = await response.text();
            try {
                const parsedErr = JSON.parse(errText);
                return { success: false, error: parsedErr.error || "فشل التحقق من بيانات الكلاود" };
            } catch {
                return { success: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة على الكلاود" };
            }
        }

        const data = await response.json();
        const { licenseJwt, branchId, syncSecret, tenantId } = data;

        if (!licenseJwt || !branchId || !syncSecret) {
            return { success: false, error: "استجابة الكلاود غير مكتملة. تحقق من ترخيص الحساب." };
        }

        // Persist Settings locally
        await prisma.storeSettings.upsert({
            where: { id: "settings" },
            create: {
                id: "settings",
                name: "Casper POS Terminal",
                licenseJwt,
                lastServerNow: Date.now()
            },
            update: {
                licenseJwt,
                lastServerNow: Date.now()
            }
        });

        // Persist Cloud Configuration
        await CloudConfigManager.saveCloudConfig({
            enabled: true,
            cloudUrl: cleanUrl,
            syncSecret,
            branchId
        });

        // Write Watermark for Offline Safety
        if (syncSecret && machineId) {
            const crypto = require("crypto");
            const watermarkSource = `${tenantId}:${syncSecret}:${machineId}`;
            const watermark = crypto.createHmac("sha256", syncSecret).update(watermarkSource).digest("hex");

            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "_SystemMetadata" (
                    "key" TEXT PRIMARY KEY,
                    "value" TEXT NOT NULL
                );
            `);

            await prisma.$executeRawUnsafe(`
                INSERT INTO "_SystemMetadata" ("key", "value") 
                VALUES ('watermark', '${watermark}')
                ON CONFLICT("key") DO UPDATE SET "value" = excluded.value;
            `);
        }

        return {
            success: true,
            branchId,
            syncSecret,
            cloudUrl: cleanUrl
        };
    } catch (error: any) {
        console.error("[activateByCloudLogin]", error);
        return { success: false, error: error.message || "حدث خطأ أثناء الاتصال بسيرفر الكلاود" };
    }
}
