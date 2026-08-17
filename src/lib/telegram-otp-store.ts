import crypto from "crypto";

interface PendingTelegramOtp {
    phone: string;
    otpCode: string;
    expiresAt: number;
}

// In-memory token store with auto-expiry (5 minutes)
const telegramOtpSessions = new Map<string, PendingTelegramOtp>();

export function registerTelegramOtpSession(phone: string, otpCode: string): { token: string; deepLink: string } {
    // Generate an 8-byte hex token (16 characters)
    const token = crypto.randomBytes(8).toString("hex");
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Clean expired entries
    const now = Date.now();
    telegramOtpSessions.forEach((val, key) => {
        if (val.expiresAt < now) {
            telegramOtpSessions.delete(key);
        }
    });

    telegramOtpSessions.set(token, { phone, otpCode, expiresAt });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || "casper_erp_bot";
    const deepLink = `https://t.me/${botUsername}?start=otp_${token}`;

    return { token, deepLink };
}

export function consumeTelegramOtpSession(token: string): PendingTelegramOtp | null {
    const session = telegramOtpSessions.get(token);
    if (!session) return null;

    if (session.expiresAt < Date.now()) {
        telegramOtpSessions.delete(token);
        return null;
    }

    // Return session but keep in memory briefly for repeat taps if needed
    return session;
}
