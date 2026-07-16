import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { logger } from '@/lib/logger';

/** Shape of the RS256 JWT payload — mirrors LicensePayload in verify.ts */
interface ServerLicensePayload {
    tenant_id: string;
    status: string;
    trial_ends_at: string;
    server_now: string;
    machine_id: string;
    iat?: number;
    exp?: number;
}

export function verifyServerLicense(licenseJwt: string | null) {
    if (!licenseJwt) {
        return { valid: false, response: NextResponse.json({ success: false, error: 'Missing license token' }, { status: 401 }) };
    }
    
    const publicKey = process.env.VITE_LICENSE_PUBLIC_KEY || process.env.LICENSE_PUBLIC_KEY;
    if (!publicKey) {
        logger.error("[LICENSE_VERIFY] LICENSE_PUBLIC_KEY is not configured on the server.");
        return { valid: false, response: NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 }) };
    }

    let decoded: ServerLicensePayload;
    try {
        // 🛡️ P0-4: Do NOT ignore expiration — expired licenses must not sync data
        decoded = jwt.verify(licenseJwt, publicKey.replace(/\\n/g, '\n'), { algorithms: ['RS256'] }) as ServerLicensePayload;
    } catch (e: any) {
        if (e.name === 'TokenExpiredError') {
            return { valid: false, response: NextResponse.json({ success: false, error: 'License expired' }, { status: 403 }) };
        }
        return { valid: false, response: NextResponse.json({ success: false, error: 'Invalid license signature' }, { status: 401 }) };
    }

    // 🛡️ Secondary expiry guard: check trial_ends_at claim against server clock
    const trialEndsAt = new Date(decoded.trial_ends_at).getTime();
    if (Date.now() > trialEndsAt) {
        return { valid: false, response: NextResponse.json({ success: false, error: 'License trial period expired' }, { status: 403 }) };
    }

    return { valid: true, tenantId: decoded.tenant_id };
}

