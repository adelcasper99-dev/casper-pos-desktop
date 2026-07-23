import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { machineId, branchId } = body;

        if (!machineId) {
            return NextResponse.json({ valid: false, reason: "missing_machine_id" }, { status: 400 });
        }

        const license = await prisma.license.findFirst({
            where: { macAddress: machineId },
            include: { tenant: true }
        });

        if (!license || !license.tenant) {
            return NextResponse.json({ valid: false, reason: "not_found" });
        }

        if (!license.tenant.isActive) {
            return NextResponse.json({ valid: false, reason: "suspended" });
        }

        if (license.expiresAt && new Date() > license.expiresAt) {
            return NextResponse.json({ valid: false, reason: "expired" });
        }

        return NextResponse.json({ valid: true });

    } catch (error: any) {
        console.error("[LICENSE_PING] Error:", error);
        return NextResponse.json({ valid: false, reason: "server_error" }, { status: 500 });
    }
}
