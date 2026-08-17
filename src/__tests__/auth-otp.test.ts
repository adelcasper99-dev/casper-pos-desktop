import { describe, it, expect } from "vitest";
import {
    normalizePhone,
    generateOtpCode,
    hashOtp,
    verifyOtpHash,
    createVerificationToken,
    verifyVerificationToken
} from "../lib/otp-service";

describe("OTP Verification Service Engine", () => {
    it("normalizes Egyptian local numbers correctly to international format", () => {
        expect(normalizePhone("01012345678")).toBe("201012345678");
        expect(normalizePhone("+201012345678")).toBe("201012345678");
        expect(normalizePhone("201012345678")).toBe("201012345678");
    });

    it("generates a valid 6-digit numeric OTP code", () => {
        const code = generateOtpCode(6);
        expect(code).toHaveLength(6);
        expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it("hashes and securely verifies OTP codes with bcrypt", async () => {
        const code = "982341";
        const hash = await hashOtp(code);
        expect(hash).not.toBe(code);

        const isMatch = await verifyOtpHash(code, hash);
        expect(isMatch).toBe(true);

        const isWrong = await verifyOtpHash("123456", hash);
        expect(isWrong).toBe(false);
    });

    it("signs and verifies JWT verification tokens bound to phone", () => {
        const phone = "201012345678";
        const token = createVerificationToken(phone);
        expect(typeof token).toBe("string");

        const verified = verifyVerificationToken(token);
        expect(verified).not.toBeNull();
        expect(verified?.phone).toBe(phone);
        expect(verified?.verified).toBe(true);
    });

    it("rejects invalid or forged verification tokens", () => {
        const verified = verifyVerificationToken("invalid-token-string");
        expect(verified).toBeNull();
    });
});
