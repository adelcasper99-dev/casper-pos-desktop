import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SignJWT, importPKCS8 } from 'jose';

export const dynamic = 'force-dynamic';


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

export async function POST(request: Request) {
    try {
        const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';
        if (!checkRateLimit(ip)) {
            return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
        }

        const body = await request.json();
        const { licenseKey, macAddress } = body;

        if (!licenseKey || !macAddress) {
            return NextResponse.json({ error: 'Missing licenseKey or macAddress' }, { status: 400 });
        }

        // Verify License exists and belongs to an active tenant
        // Since prisma extension injects tenantId automatically, and this is a public API route,
        // we might not have tenantId set in context. But License lookup by unique key works
        // if we bypass RLS or if we just do a raw query/findUnique. 
        // Wait, the prisma extension bypasses RLS if `tenantId` is missing (i.e. public endpoint).
        const license = await prisma.license.findUnique({
            where: { key: licenseKey },
            include: { tenant: true }
        });

        if (!license) {
            return NextResponse.json({ error: 'Invalid license key' }, { status: 401 });
        }

        if (!license.tenant.isActive) {
            return NextResponse.json({ error: 'Tenant account is suspended' }, { status: 403 });
        }

        let tokenExpiration = license.expiresAt;
        let isEmergency = false;

        // Check if MAC is bound, if not bind it. If bound, verify it.
        if (!license.macAddress) {
            if (macAddress.length <= 10) {
                return NextResponse.json({ error: 'Invalid hardware signature' }, { status: 400 });
            }
            await prisma.license.update({
                where: { id: license.id },
                data: { macAddress }
            });
        } else if (license.macAddress !== macAddress) {
            if (macAddress.length <= 10) {
                return NextResponse.json({ error: 'Invalid hardware signature' }, { status: 400 });
            }

            const now = new Date();
            if (license.status === "ACTIVE") {
                const emergencyModeAt = now;
                await prisma.license.update({
                    where: { id: license.id },
                    data: {
                        status: "EMERGENCY_MODE",
                        emergencyModeAt
                    }
                });
                isEmergency = true;
                tokenExpiration = new Date(emergencyModeAt.getTime() + 24 * 60 * 60 * 1000);
            } else if (license.status === "EMERGENCY_MODE") {
                const emergencyModeAt = license.emergencyModeAt || now;
                const expirationTime = new Date(emergencyModeAt.getTime() + 24 * 60 * 60 * 1000);
                if (now > expirationTime) {
                    return NextResponse.json({ error: 'Grace period has expired. Hardware swap requires approval.' }, { status: 403 });
                }
                isEmergency = true;
                tokenExpiration = expirationTime;
            } else {
                return NextResponse.json({ error: 'License is bound to another device' }, { status: 403 });
            }
        }

        // Check expiration
        if (license.expiresAt < new Date()) {
            return NextResponse.json({ error: 'License expired' }, { status: 403 });
        }

        // Generate signed JWT
        const privateKeyEnv = process.env.LICENSE_PRIVATE_KEY;
        if (!privateKeyEnv) {
            console.error('Missing LICENSE_PRIVATE_KEY');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const formattedKey = privateKeyEnv.replace(/\\n/g, '\n');
        const privateKey = await importPKCS8(formattedKey, 'RS256');

        const token = await new SignJWT({ 
            tenant_id: license.tenantId,
            status: license.tenant.isActive ? 'active' : 'inactive',
            trial_ends_at: license.expiresAt.toISOString(),
            server_now: new Date().toISOString(),
            machine_id: macAddress,
            emergencyMode: isEmergency
        })
            .setProtectedHeader({ alg: 'RS256' })
            .setIssuedAt()
            .setExpirationTime(tokenExpiration)
            .sign(privateKey);

        return NextResponse.json({ 
            token,
            tenantId: license.tenantId,
            expiresAt: tokenExpiration,
            emergencyMode: isEmergency
        });

    } catch (e) {
        console.error('License activation error:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
