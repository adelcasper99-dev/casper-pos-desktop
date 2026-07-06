const fs = require('fs');

fs.mkdirSync('src/app/api/admin/licenses/[id]/revoke', {recursive: true});
fs.writeFileSync('src/app/api/admin/licenses/[id]/revoke/route.ts', `import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getSession();
        if (!session || !session.user || (session.user.role !== 'ADMIN' && session.user.role !== 'مدير النظام' && session.user.role !== 'المالك')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tenantId = params.id;
        
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
        }

        await prisma.tenant.update({
            where: { id: tenantId },
            data: { 
                status: 'suspended',
                activationCode: null 
            }
        });

        return NextResponse.json({ success: true, message: "License revoked successfully." });

    } catch (error: any) {
        console.error("[ADMIN_LICENSE_REVOKE] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
`);

fs.mkdirSync('src/app/api/admin/licenses/[id]/renew', {recursive: true});
fs.writeFileSync('src/app/api/admin/licenses/[id]/renew/route.ts', `import { NextResponse } from "next/server";
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
`);

fs.mkdirSync('src/app/api/license/ping', {recursive: true});
fs.writeFileSync('src/app/api/license/ping/route.ts', `import { NextResponse } from "next/server";
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
`);

console.log('✅ API Routes created successfully!');
