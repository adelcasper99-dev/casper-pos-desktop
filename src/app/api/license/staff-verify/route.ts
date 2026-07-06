import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import crypto from "crypto";

export async function POST(request: Request) {
    try {
        const { responseCode, machineId, challenge } = await request.json();

        if (!responseCode || !machineId || !challenge) {
            return NextResponse.json({ success: false, error: "Missing required parameters" }, { status: 400 });
        }

        // 1. Verify Local Challenge is valid (within time window)
        const timeBucket = Math.floor(Date.now() / 300000); // 5 min buckets
        const expectedChallenges: string[] = [];
        
        // Allow +-1 bucket drift (15 mins total window)
        for (let offset = -1; offset <= 1; offset++) {
            const rawMessage = `${machineId}_${timeBucket + offset}`;
            const hash = crypto.createHash("sha256").update(rawMessage).digest("hex");
            const formatted = (hash.substring(0, 4) + "-" + hash.substring(4, 8)).toUpperCase();
            expectedChallenges.push(formatted);
        }

        if (!expectedChallenges.includes(challenge)) {
            return NextResponse.json({ success: false, error: "Challenge has expired or is invalid. Refresh and try again." }, { status: 400 });
        }

        // 2. Decode and verify JWT
        const publicKey = process.env.LICENSE_PUBLIC_KEY || process.env.VITE_LICENSE_PUBLIC_KEY;
        if (!publicKey) {
            return NextResponse.json({ success: false, error: "Public verification key missing on local system." }, { status: 500 });
        }

        let decoded: any;
        try {
            decoded = jwt.verify(responseCode, publicKey.replace(/\\n/g, "\n"), { algorithms: ["RS256"] });
        } catch (err: any) {
            return NextResponse.json({ success: false, error: `Invalid key signature: ${err.message}` }, { status: 401 });
        }

        // 3. Verify JWT Claims
        if (decoded.machine_id !== machineId) {
            return NextResponse.json({ success: false, error: "Authorization key is bound to a different machine." }, { status: 403 });
        }

        if (decoded.challenge !== challenge) {
            return NextResponse.json({ success: false, error: "Authorization key does not match this session challenge." }, { status: 403 });
        }

        // 4. Replay Attack Guard (jti check)
        const jti = decoded.jti;
        if (!jti) {
            return NextResponse.json({ success: false, error: "Authorization key is missing unique tracking ID (jti)." }, { status: 400 });
        }

        const existingLog = await prisma.staffOverrideLog.findUnique({
            where: { jti }
        });

        if (existingLog) {
            return NextResponse.json({ success: false, error: "This authorization key has already been used." }, { status: 409 });
        }

        // Log the usage
        await prisma.staffOverrideLog.create({
            data: {
                jti,
                machineId
            }
        });

        // 5. Store License JWT in Settings (The responseCode is itself a valid 10-year License JWT)
        await prisma.storeSettings.upsert({
            where: { id: "settings" },
            create: {
                id: "settings",
                name: "Casper Store",
                licenseJwt: responseCode,
                lastServerNow: Date.now()
            },
            update: {
                licenseJwt: responseCode,
                lastServerNow: Date.now()
            }
        });

        return NextResponse.json({ success: true, message: "Staff override successful" });

    } catch (error: any) {
        console.error("[STAFF_VERIFY] Error:", error);
        return NextResponse.json({ success: false, error: error.message || "Override verification failed" }, { status: 500 });
    }
}
