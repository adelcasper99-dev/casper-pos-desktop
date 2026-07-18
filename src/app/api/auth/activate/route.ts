import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SignJWT, importPKCS8 } from 'jose';

export async function POST(request: Request) {
    try {
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

        // Check if MAC is bound, if not bind it. If bound, verify it.
        if (!license.macAddress) {
            await prisma.license.update({
                where: { id: license.id },
                data: { macAddress }
            });
        } else if (license.macAddress !== macAddress) {
            return NextResponse.json({ error: 'License is bound to another device' }, { status: 403 });
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

        const token = await new SignJWT({ tenantId: license.tenantId })
            .setProtectedHeader({ alg: 'RS256' })
            .setIssuedAt()
            .setExpirationTime(license.expiresAt)
            .sign(privateKey);

        return NextResponse.json({ 
            token,
            tenantId: license.tenantId,
            expiresAt: license.expiresAt 
        });

    } catch (e) {
        console.error('License activation error:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
