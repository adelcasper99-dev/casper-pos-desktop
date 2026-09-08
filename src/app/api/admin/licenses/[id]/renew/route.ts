import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformHqAdmin } from "@/lib/hq-auth-guard";

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const { errorResponse } = await requirePlatformHqAdmin(req);
        if (errorResponse) return errorResponse;

        return NextResponse.json({ error: "Deprecated. Please manage licenses from /casper-hq control plane." }, { status: 400 });

    } catch (error: unknown) {
        console.error("[ADMIN_LICENSE_RENEW] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

