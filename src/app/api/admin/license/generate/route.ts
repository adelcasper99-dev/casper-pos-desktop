import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformHqAdmin } from "@/lib/hq-auth-guard";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { errorResponse } = await requirePlatformHqAdmin(req);
        if (errorResponse) return errorResponse;

        return NextResponse.json({ error: "Deprecated. Use /api/hq/provision-tenant instead." }, { status: 400 });

    } catch (error: unknown) {
        console.error("[ADMIN_LICENSE_GENERATE] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

