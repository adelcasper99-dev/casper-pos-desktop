import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as trialHandler } from "../app/api/license/trial/route";
import { prisma } from "@/lib/prisma";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
    prisma: {
        storeSettings: {
            findUnique: vi.fn(),
            upsert: vi.fn()
        }
    }
}));

describe("Trial Start Endpoint (api/license/trial)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("starts trial successfully if not already active", async () => {
        // Mock trialStartDate is null
        vi.mocked(prisma.storeSettings.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.storeSettings.upsert).mockResolvedValue({
            id: "settings",
            trialStartDate: new Date("2026-07-05T12:00:00.000Z")
        } as any);

        const res = await trialHandler();
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.trialStartDate).toBeDefined();
        expect(prisma.storeSettings.upsert).toHaveBeenCalled();
    });

    it("returns existing trial if trial already active", async () => {
        const existingDate = new Date("2026-07-01T12:00:00.000Z");
        vi.mocked(prisma.storeSettings.findUnique).mockResolvedValue({
            id: "settings",
            trialStartDate: existingDate
        } as any);

        const res = await trialHandler();
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.message).toContain("already active");
        expect(new Date(json.trialStartDate).getTime()).toBe(existingDate.getTime());
        expect(prisma.storeSettings.upsert).not.toHaveBeenCalled();
    });
});
