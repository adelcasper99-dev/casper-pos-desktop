import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import crypto from "crypto";

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session || !session.user || (session.user.role !== 'ADMIN' && session.user.role !== 'مدير النظام' && session.user.role !== 'المالك')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { clientName, durationDays = 14, planType = 'trial' } = body;

        // Generate cryptographically secure activation code (e.g., CASPER-XXXXXX)
        const randomString = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex chars = 48 bits entropy
        const activationCode = `CASPER-${randomString}`;

        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + durationDays);

        const tenant = await prisma.tenant.create({
            data: {
                planType,
                status: 'active',
                trialEndsAt,
                activationCode,
                clientName,
            }
        });

        return NextResponse.json({
            success: true,
            activationCode,
            tenantId: tenant.id,
            trialEndsAt
        });

    } catch (error: any) {
        console.error("[ADMIN_LICENSE_GENERATE] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
