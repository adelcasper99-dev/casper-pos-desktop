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

        const body = await req.json();
        const parsed = renewSchema.safeParse(body);
        
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid duration provided." }, { status: 400 });
        }

        const { durationDays } = parsed.data;
        const tenantId = params.id;
        
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
        }

        const oldEndsAtTime = tenant.trialEndsAt ? tenant.trialEndsAt.getTime() : Date.now();
        const baseTime = Math.max(Date.now(), oldEndsAtTime);
        const newEndsAt = new Date(baseTime + durationDays * 86400000);

        await prisma.tenant.update({
            where: { id: tenantId },
            data: { 
                status: 'active',
                trialEndsAt: newEndsAt
            }
        });

        return NextResponse.json({ success: true, message: "License renewed successfully.", trialEndsAt: newEndsAt });

    } catch (error: any) {
        console.error("[ADMIN_LICENSE_RENEW] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
