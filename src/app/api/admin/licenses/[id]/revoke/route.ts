import { NextResponse } from "next/server";
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
