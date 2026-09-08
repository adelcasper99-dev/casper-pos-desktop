import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformHqAdmin } from "@/lib/hq-auth-guard";

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const { session, errorResponse } = await requirePlatformHqAdmin(req);
        if (errorResponse) return errorResponse;

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

        // Audit log in ActionLog
        try {
            await (prisma as unknown as { actionLog?: { create: (arg: unknown) => Promise<unknown> } }).actionLog?.create({
                data: {
                    tenantId: 'casper-hq',
                    action: 'HQ_LICENSE_REVOKED',
                    details: `Tenant license revoked for tenantId=${tenantId} (${tenant.name}) by HQ User: ${session.user.id}`,
                    userId: session.user.id
                }
            });
        } catch (e) {}

        return NextResponse.json({ success: true, message: "License revoked successfully." });

    } catch (error: unknown) {
        console.error("[ADMIN_LICENSE_REVOKE] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

