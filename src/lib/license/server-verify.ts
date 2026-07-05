import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { logger } from '@/lib/logger';

export function verifyServerLicense(licenseJwt: string | null) {
    if (!licenseJwt) {
        return { valid: false, response: NextResponse.json({ success: false, error: 'Missing license token' }, { status: 401 }) };
    }
    
    const publicKey = process.env.LICENSE_PUBLIC_KEY || process.env.VITE_LICENSE_PUBLIC_KEY;
    if (!publicKey) {
        logger.error("[LICENSE_VERIFY] LICENSE_PUBLIC_KEY is not configured on the server.");
        return { valid: false, response: NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 }) };
    }

    try {
        jwt.verify(licenseJwt, publicKey.replace(/\\n/g, '\n'), { algorithms: ['RS256'], ignoreExpiration: true });
        return { valid: true };
    } catch (e) {
        return { valid: false, response: NextResponse.json({ success: false, error: 'Invalid license signature' }, { status: 401 }) };
    }
}
