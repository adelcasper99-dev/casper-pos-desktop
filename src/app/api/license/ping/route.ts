import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import jwt from "jsonwebtoken";

const pingSchema = z.object({
    machineId: z.string().min(1),
    branchId: z.string().optional(),
    licenseJwt: z.string().optional()
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const parsed = pingSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ valid: false, reason: "missing_machine_id" }, { status: 400 });
        }

        const { machineId, licenseJwt } = parsed.data;

        const license = await prisma.license.findFirst({
            where: { macAddress: machineId },
            include: { tenant: true }
        });

        if (!license || !license.tenant) {
            return NextResponse.json({ valid: false, reason: "not_found" });
        }

        if (!license.tenant.isActive || license.status === "REVOKED") {
            return NextResponse.json({ valid: false, reason: "suspended" });
        }

        if (license.expiresAt && new Date() > license.expiresAt) {
            return NextResponse.json({ valid: false, reason: "expired" });
        }

        let renewedJwt: string | null = null;

        if (licenseJwt) {
            try {
                const decoded = jwt.decode(licenseJwt) as { trial_ends_at?: string } | null;
                const clientTrialEndsMs = decoded?.trial_ends_at ? new Date(decoded.trial_ends_at).getTime() : 0;
                const cloudExpiresMs = license.expiresAt ? new Date(license.expiresAt).getTime() : new Date('2099-12-31').getTime();

                // If cloud expiration date is further in the future than client JWT
                if (cloudExpiresMs > clientTrialEndsMs + 60000) { // 1 min buffer
                    const privateKey = process.env.LICENSE_PRIVATE_KEY || process.env.VITE_LICENSE_PRIVATE_KEY;
                    if (privateKey) {
                        const payload = {
                            tenant_id: license.tenantId,
                            status: license.tenant.status || 'ACTIVE',
                            trial_ends_at: license.expiresAt ? license.expiresAt.toISOString() : new Date('2099-12-31').toISOString(),
                            server_now: new Date().toISOString(),
                            machine_id: machineId,
                            branch_id: license.tenant.branchId || undefined,
                        };
                        renewedJwt = jwt.sign(payload, privateKey.replace(/\\n/g, '\n'), { algorithm: 'RS256' });
                    } else {
                        console.warn("[LICENSE_PING] Renewal detected but LICENSE_PRIVATE_KEY environment variable is missing.");
                    }
                }
            } catch (err) {
                console.error("[LICENSE_PING] JWT decoding/signing warning:", err);
            }
        }

        return NextResponse.json({
            valid: true,
            renewedJwt,
            expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null
        });

    } catch (error: any) {
        console.error("[LICENSE_PING] Error:", error);
        return NextResponse.json({ valid: false, reason: "server_error" }, { status: 500 });
    }
}

