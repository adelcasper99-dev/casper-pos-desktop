import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { machineId, branchId } = body;

        if (!machineId) {
            return NextResponse.json({ valid: false, reason: "missing_machine_id" }, { status: 400 });
        }

        const tenant = await prisma.tenant.findFirst({
            where: { machineId }
        });

        if (!tenant) {
            return NextResponse.json({ valid: false, reason: "not_found" });
        }

        if (tenant.status === 'suspended') {
            return NextResponse.json({ valid: false, reason: "suspended" });
        }

        if (tenant.trialEndsAt && new Date() > tenant.trialEndsAt) {
            return NextResponse.json({ valid: false, reason: "expired" });
        }

        return NextResponse.json({ valid: true });

    } catch (error: any) {
        console.error("[LICENSE_PING] Error:", error);
        return NextResponse.json({ valid: false, reason: "server_error" }, { status: 500 });
    }
}
