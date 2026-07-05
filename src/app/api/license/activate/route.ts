import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { activationCode, machineId } = body;

        if (!activationCode || !machineId) {
            return NextResponse.json({ error: "Missing activation code or machine ID" }, { status: 400 });
        }

        // Find tenant by activation code
        const tenant = await prisma.tenant.findUnique({
            where: { activationCode }
        });

        if (!tenant || tenant.status !== 'active') {
            return NextResponse.json({ error: "Invalid or expired activation code" }, { status: 400 });
        }

        // Nullify activation code (single-use) and save machine ID
        const updatedTenant = await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
                activationCode: null,
                machineId: machineId,
            }
        });

        const privateKey = process.env.LICENSE_PRIVATE_KEY;
        if (!privateKey) {
            console.error("[LICENSE_ACTIVATE] Missing LICENSE_PRIVATE_KEY in environment");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Sign JWT
        const payload = {
            tenant_id: updatedTenant.id,
            status: updatedTenant.status,
            trial_ends_at: updatedTenant.trialEndsAt.toISOString(),
            server_now: new Date().toISOString(),
            machine_id: machineId
        };

        const token = jwt.sign(payload, privateKey.replace(/\\n/g, '\n'), { algorithm: 'RS256' });

        return NextResponse.json({
            success: true,
            token
        });

    } catch (error: any) {
        console.error("[LICENSE_ACTIVATE] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
