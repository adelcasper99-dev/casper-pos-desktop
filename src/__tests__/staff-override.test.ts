import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { POST as staffVerifyHandler } from "../app/api/license/staff-verify/route";
import { prisma } from "@/lib/prisma";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
    prisma: {
        storeSettings: {
            findUnique: vi.fn(),
            upsert: vi.fn()
        },
        staffOverrideLog: {
            findUnique: vi.fn(),
            create: vi.fn()
        }
    }
}));

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" }
});

describe("Challenge-Response Staff Override Verification Route", () => {
    const mockMachineId = "TEST-HARDWARE-UUID-1234";

    beforeEach(() => {
        vi.resetAllMocks();
        process.env.LICENSE_PUBLIC_KEY = publicKey;
    });

    afterEach(() => {
        delete process.env.LICENSE_PUBLIC_KEY;
    });

    it("verifies a valid override response token successfully", async () => {
        const timeBucket = Math.floor(Date.now() / 300000);
        const rawMessage = `${mockMachineId}_${timeBucket}`;
        const hash = crypto.createHash("sha256").update(rawMessage).digest("hex");
        const challenge = (hash.substring(0, 4) + "-" + hash.substring(4, 8)).toUpperCase();

        const jti = "test-jti-uuid";
        const exp = Math.floor(Date.now() / 1000) + 300;

        const payload = {
            tenant_id: "staff-override",
            status: "active",
            trial_ends_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
            server_now: new Date().toISOString(),
            machine_id: mockMachineId,
            challenge,
            jti,
            exp
        };

        const responseCode = jwt.sign(payload, privateKey, { algorithm: "RS256" });

        // Mock database calls
        vi.mocked(prisma.staffOverrideLog.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.staffOverrideLog.create).mockResolvedValue({} as any);
        vi.mocked(prisma.storeSettings.upsert).mockResolvedValue({} as any);

        const request = new Request("http://localhost/api/license/staff-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ responseCode, machineId: mockMachineId, challenge })
        });

        const res = await staffVerifyHandler(request);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.success).toBe(true);
        expect(prisma.storeSettings.upsert).toHaveBeenCalled();
        expect(prisma.staffOverrideLog.create).toHaveBeenCalledWith({
            data: { jti, machineId: mockMachineId }
        });
    });

    it("rejects token signed with wrong key", async () => {
        const timeBucket = Math.floor(Date.now() / 300000);
        const rawMessage = `${mockMachineId}_${timeBucket}`;
        const hash = crypto.createHash("sha256").update(rawMessage).digest("hex");
        const challenge = (hash.substring(0, 4) + "-" + hash.substring(4, 8)).toUpperCase();

        const { privateKey: wrongPrivateKey } = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "pkcs1", format: "pem" },
            privateKeyEncoding: { type: "pkcs1", format: "pem" }
        });

        const payload = {
            tenant_id: "staff-override",
            status: "active",
            trial_ends_at: new Date().toISOString(),
            server_now: new Date().toISOString(),
            machine_id: mockMachineId,
            challenge,
            jti: "wrong-key-jti",
            exp: Math.floor(Date.now() / 1000) + 300
        };

        const responseCode = jwt.sign(payload, wrongPrivateKey, { algorithm: "RS256" });

        const request = new Request("http://localhost/api/license/staff-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ responseCode, machineId: mockMachineId, challenge })
        });

        const res = await staffVerifyHandler(request);
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error).toContain("Invalid key signature");
    });

    it("rejects token with wrong challenge", async () => {
        const timeBucket = Math.floor(Date.now() / 300000);
        const rawMessage = `${mockMachineId}_${timeBucket}`;
        const hash = crypto.createHash("sha256").update(rawMessage).digest("hex");
        const challenge = (hash.substring(0, 4) + "-" + hash.substring(4, 8)).toUpperCase();

        const payload = {
            tenant_id: "staff-override",
            status: "active",
            trial_ends_at: new Date().toISOString(),
            server_now: new Date().toISOString(),
            machine_id: mockMachineId,
            challenge: "WRONG-CHALLENGE",
            jti: "wrong-challenge-jti",
            exp: Math.floor(Date.now() / 1000) + 300
        };

        const responseCode = jwt.sign(payload, privateKey, { algorithm: "RS256" });

        const request = new Request("http://localhost/api/license/staff-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ responseCode, machineId: mockMachineId, challenge })
        });

        const res = await staffVerifyHandler(request);
        expect(res.status).toBe(403);
        const json = await res.json();
        expect(json.success).toBe(false);
    });

    it("rejects replayed jti", async () => {
        const timeBucket = Math.floor(Date.now() / 300000);
        const rawMessage = `${mockMachineId}_${timeBucket}`;
        const hash = crypto.createHash("sha256").update(rawMessage).digest("hex");
        const challenge = (hash.substring(0, 4) + "-" + hash.substring(4, 8)).toUpperCase();

        const jti = "replayed-jti";
        const payload = {
            tenant_id: "staff-override",
            status: "active",
            trial_ends_at: new Date().toISOString(),
            server_now: new Date().toISOString(),
            machine_id: mockMachineId,
            challenge,
            jti,
            exp: Math.floor(Date.now() / 1000) + 300
        };

        const responseCode = jwt.sign(payload, privateKey, { algorithm: "RS256" });

        // Mock jti found in DB (replay detected)
        vi.mocked(prisma.staffOverrideLog.findUnique).mockResolvedValue({ id: "1", jti, usedAt: new Date(), machineId: mockMachineId } as any);

        const request = new Request("http://localhost/api/license/staff-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ responseCode, machineId: mockMachineId, challenge })
        });

        const res = await staffVerifyHandler(request);
        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error).toContain("already been used");
    });
});
