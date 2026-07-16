import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session || !session.user || (session.user.role !== 'ADMIN' && session.user.role !== 'مدير النظام' && session.user.role !== 'المالك')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tenants = await prisma.tenant.findMany({
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, data: tenants });

    } catch (error: any) {
        console.error("[ADMIN_LICENSES_GET] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
