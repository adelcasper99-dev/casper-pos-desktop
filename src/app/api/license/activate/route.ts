import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { activationCode, machineId } = body;

        if (!activationCode || !machineId) {
            return NextResponse.json({ error: "Missing activation code or machine ID" }, { status: 400 });
        }

        // 🛡️ P0-2: Guard env var BEFORE any DB mutation — a missing key must not burn the activation code
        const privateKey = process.env.LICENSE_PRIVATE_KEY;
        if (!privateKey) {
            logger.error("[LICENSE_ACTIVATE] Missing LICENSE_PRIVATE_KEY in environment");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        // 🛡️ P0-1: Atomic transaction — findUnique + update in a single TX prevents double-spend
        // The @unique constraint on activationCode means concurrent requests race on the UPDATE;
        // only one succeeds in setting activationCode=null, the other gets a record-not-found on the
        // optimistic where clause.
        let updatedTenant;
        try {
            updatedTenant = await prisma.$transaction(async (tx) => {
                // Re-fetch inside transaction with a pessimistic select
                const tenant = await tx.tenant.findUnique({
                    where: { activationCode }
                });

                if (!tenant || tenant.status !== 'active') {
                    throw new Error('INVALID_CODE');
                }

                // Atomically nullify code (single-use) and bind machineId
                return tx.tenant.update({
                    where: {
                        id: tenant.id,
                        activationCode: activationCode // optimistic guard: only matches if not yet nullified
                    },
                    data: {
                        activationCode: null,
                        machineId: machineId,
                    }
                });
            });
        } catch (txError: any) {
            if (txError.message === 'INVALID_CODE' || txError.code === 'P2025') {
                // P2025 = record not found on update (concurrent activation beat us)
                return NextResponse.json({ error: "Invalid or expired activation code" }, { status: 400 });
            }
            throw txError; // re-throw unexpected errors
        }

        // Sign JWT
        const payload = {
            tenant_id: updatedTenant.id,
            status: updatedTenant.status,
            trial_ends_at: updatedTenant.trialEndsAt.toISOString(),
            server_now: new Date().toISOString(),
            machine_id: machineId
        };

        const token = jwt.sign(payload, privateKey.replace(/\\n/g, '\n'), { algorithm: 'RS256' });

        return NextResponse.json({
            success: true,
            token
        });

    } catch (error: any) {
        logger.error("[LICENSE_ACTIVATE] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
