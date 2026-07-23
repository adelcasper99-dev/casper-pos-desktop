import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const renewSchema = z.object({
    durationDays: z.number().int().positive().max(3650)
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getSession();
        if (!session || !session.user || (session.user.role !== 'ADMIN' && session.user.role !== 'مدير النظام' && session.user.role !== 'المالك')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        return NextResponse.json({ error: "Deprecated. Please manage licenses from /casper-hq control plane." }, { status: 400 });

    } catch (error: any) {
        console.error("[ADMIN_LICENSE_RENEW] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
