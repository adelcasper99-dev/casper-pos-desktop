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

        return NextResponse.json({ error: "Deprecated. Use /api/hq/provision-tenant instead." }, { status: 400 });

    } catch (error: any) {
        console.error("[ADMIN_LICENSE_GENERATE] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
