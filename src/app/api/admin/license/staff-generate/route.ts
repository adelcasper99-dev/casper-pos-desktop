import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import jwt from "jsonwebtoken";
import crypto from "crypto";

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session || !session.user || (session.user.role !== 'ADMIN' && session.user.role !== 'مدير النظام' && session.user.role !== 'المالك')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { challenge, machineId } = body;

        if (!challenge || !machineId) {
            return NextResponse.json({ error: "Missing challenge or machineId" }, { status: 400 });
        }

        const privateKey = process.env.LICENSE_PRIVATE_KEY;
        if (!privateKey) {
            return NextResponse.json({ error: "LICENSE_PRIVATE_KEY is not configured on this server." }, { status: 500 });
        }

        const jti = crypto.randomUUID();
        const exp = Math.floor(Date.now() / 1000) + 300; // 5 min expiry

        const payload = {
            tenant_id: "staff-override",
            status: "active",
            trial_ends_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(), // 10 years
            server_now: new Date().toISOString(),
            machine_id: machineId.toUpperCase(),
            challenge: challenge.toUpperCase(),
            jti: jti,
            exp: exp
        };

        const token = jwt.sign(payload, privateKey.replace(/\\n/g, '\n'), { algorithm: 'RS256' });

        console.info("[STAFF_OVERRIDE_ISSUED]", {
            adminId: session.user.id,
            adminUsername: session.user.username,
            machineId: machineId.toUpperCase(),
            challenge: challenge.toUpperCase(),
            jti,
            issuedAt: new Date().toISOString()
        });

        return NextResponse.json({
            success: true,
            token,
            jti,
            exp
        });

    } catch (error: any) {
        console.error("[ADMIN_STAFF_GENERATE] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
