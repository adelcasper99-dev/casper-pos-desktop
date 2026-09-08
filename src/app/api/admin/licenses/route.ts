import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformHqAdmin } from "@/lib/hq-auth-guard";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { errorResponse } = await requirePlatformHqAdmin(req);
        if (errorResponse) return errorResponse;

        const tenants = await prisma.tenant.findMany({
            include: { licenses: true },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, data: tenants });

    } catch (error: unknown) {
        console.error("[ADMIN_LICENSES_GET] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

