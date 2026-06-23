import { generateNextSku } from "../actions/inventory";
import { prisma } from "../lib/prisma";
import { describe, it, expect, beforeAll } from "vitest";

// Mock next/headers
import { vi } from "vitest";
vi.mock("next/headers", () => {
    return {
        cookies: () => ({
            get: (name: string) => {
                if (name === "session") return { value: "super-admin-token-test-1234" };
                return undefined;
            }
        })
    };
});

describe("generateNextSku", () => {
    it("should generate SKUs correctly", async () => {
        console.log("--- STARTING TEST ---");
        const res = await generateNextSku();
        console.log("generateNextSku() output:", JSON.stringify(res));

        const resWithCart = await generateNextSku({ existingSKUs: ["C-01", "C-02"] });
        console.log("generateNextSku({ existingSKUs }) output:", JSON.stringify(resWithCart));

        const resWithNumeric = await generateNextSku({ prefix: "" });
        console.log("generateNextSku({ prefix: '' }) output:", JSON.stringify(resWithNumeric));
        console.log("--- ENDING TEST ---");
    });
});
