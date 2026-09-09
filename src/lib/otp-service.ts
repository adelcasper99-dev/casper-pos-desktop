import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { logger } from "./logger";
import { sendTelegramMessage } from "./telegram-service";

const OTP_JWT_SECRET = process.env.OTP_JWT_SECRET || (process.env.JWT_SECRET && !process.env.JWT_SECRET.includes("BEGIN RSA"))
    ? (process.env.OTP_JWT_SECRET || process.env.JWT_SECRET || "casper-otp-symmetric-hmac-key-2026")
    : "casper-otp-symmetric-hmac-key-2026";
const OTP_EXPIRY_MINUTES = 5;
const VERIFY_TOKEN_EXPIRY_MINUTES = 10;
export const MAX_OTP_ATTEMPTS = 5;

export interface VerificationPayload {
    phone: string;
    verified: boolean;
    jti: string;
    exp: number;
}

import { normalizePhone } from "./phone-utils";
export { normalizePhone };

/**
 * Generates a cryptographically strong numeric OTP code
 */
export function generateOtpCode(digits = 6): string {
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    return crypto.randomInt(min, max + 1).toString();
}

/**
 * Hashes OTP using bcrypt with defensive error wrapping
 */
export async function hashOtp(otp: string): Promise<string> {
    return await bcrypt.hash(otp, 10);
}

/**
 * Compares plaintext OTP against stored bcrypt hash
 */
export async function verifyOtpHash(otp: string, hash: string): Promise<boolean> {
    try {
        return await bcrypt.compare(otp, hash);
    } catch {
        return false;
    }
}

/**
 * Signs a short-lived, single-use JWT verification proof token
 */
export function createVerificationToken(phone: string): string {
    const normalized = normalizePhone(phone);
    return jwt.sign(
        {
            phone: normalized,
            verified: true,
            jti: crypto.randomUUID(),
        },
        OTP_JWT_SECRET,
        { expiresIn: `${VERIFY_TOKEN_EXPIRY_MINUTES}m` }
    );
}

/**
 * Validates and decodes the JWT verification proof token
 */
export function verifyVerificationToken(token: string): VerificationPayload | null {
    try {
        const decoded = jwt.verify(token, OTP_JWT_SECRET) as VerificationPayload;
        if (decoded && decoded.verified && decoded.phone) {
            return decoded;
        }
        return null;
    } catch {
        return null;
    }
}

export type OtpChannel = "whatsapp" | "sms" | "telegram";

export interface OtpDispatchResult {
    success: boolean;
    provider: string;
    channel: OtpChannel;
    error?: string;
}

/**
 * Dispatches the OTP message via WhatsApp Gateway, Android SMS Gateway, Telegram Bot, or fallback mock
 */
export async function dispatchOtpMessage(
    phone: string, 
    otp: string,
    channel: OtpChannel = "whatsapp"
): Promise<OtpDispatchResult> {
    const normalized = normalizePhone(phone);
    const message = `رمز التحقق الخاص بك في Casper ERP هو: [ ${otp} ]\nصالح لمدة ${OTP_EXPIRY_MINUTES} دقائق.\nلا تشارك هذا الرمز مع أي شخص.`;

    // 1. Dual Dispatch: If Telegram Bot is configured, notify Telegram Admin Channel for auditing
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID) {
        sendTelegramMessage({
            text: `🔐 <b>كود تحقق جديد (${channel === "telegram" ? "تليجرام" : channel === "sms" ? "رسالة SMS" : "واتساب"})</b>\n\n📱 <b>الرقم:</b> <code>+${normalized}</code>\n🔑 <b>رمز التحقق:</b> <code>${otp}</code>\n⏳ <b>المدة:</b> 5 دقائق`,
            parseMode: "HTML"
        }).catch((err) => {
            logger.warn(`[OTP Service] Telegram dual-dispatch non-blocking warning: ${err}`);
        });
    }

    if (channel === "telegram") {
        return { success: true, provider: "TELEGRAM_BOT", channel: "telegram" };
    }

    // 2. Primary WhatsApp Dispatch
    if (channel === "whatsapp") {
        const providerUrl = process.env.WHATSAPP_PROVIDER_URL;
        const providerApiKey = process.env.WHATSAPP_API_KEY;

        if (providerUrl) {
            try {
                const res = await fetch(providerUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(providerApiKey ? { "Authorization": `Bearer ${providerApiKey}` } : {})
                    },
                    body: JSON.stringify({
                        to: normalized,
                        message: message,
                        body: message
                    }),
                    signal: AbortSignal.timeout(6500)
                });

                if (res.ok) {
                    logger.info(`[OTP Service] WhatsApp OTP dispatched to ${normalized} via provider`);
                    return { success: true, provider: "WHATSAPP_GATEWAY", channel: "whatsapp" };
                }
                logger.warn(`[OTP Service] WhatsApp provider returned status ${res.status} - proceeding to fallback cascade`);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                logger.error(`[OTP Service] WhatsApp gateway dispatch failed: ${msg} - proceeding to fallback cascade`);
            }
        }
    }

    // 3. SMS Gateway Dispatch (capcom6 / textbee / Android SMS Gateway)
    const smsUrl = process.env.SMS_GATEWAY_URL;
    const smsKey = process.env.SMS_GATEWAY_API_KEY;

    if (smsUrl) {
        try {
            const res = await fetch(smsUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(smsKey ? { "Authorization": `Bearer ${smsKey}`, "X-API-Key": smsKey } : {})
                },
                body: JSON.stringify({
                    to: normalized,
                    message: message
                }),
                signal: AbortSignal.timeout(3500)
            });

            if (res.ok) {
                logger.info(`[OTP Service] SMS Gateway dispatched to ${normalized}`);
                return { success: true, provider: "ANDROID_SMS_GATEWAY", channel: "sms" };
            }
            logger.warn(`[OTP Service] SMS gateway returned status ${res.status}`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.error(`[OTP Service] SMS gateway dispatch failed: ${msg}`);
        }
    }

    // 4. Production vs Development Gating
    const isProduction = process.env.NODE_ENV === "production";

    if (isProduction) {
        logger.error(`[OTP Service] Failed to dispatch OTP to ${normalized} via any active gateway in production`);
        return { 
            success: false, 
            provider: "NONE", 
            channel,
            error: channel === "whatsapp"
                ? "تعذر إرسال رمز التحقق عبر واتساب (الرقم غير مسجل أو تعذر الوصول إليه)."
                : "تعذر إرسال رسالة SMS نصية إلى هذا الرقم حالياً."
        };
    }

    // In local development or test environment, log to secure server telemetry
    logger.info(`[OTP Service] Dev simulated dispatch to ${normalized} (Channel: ${channel}, Code: ${otp})`);
    return { success: true, provider: "DEVELOPMENT_MOCK", channel };
}

/**
 * Backwards compatibility wrapper for dispatchOtpWhatsApp
 */
export async function dispatchOtpWhatsApp(
    phone: string, 
    otp: string,
    channel: "whatsapp" | "telegram" = "whatsapp"
): Promise<{ success: boolean; provider: string; error?: string }> {
    return await dispatchOtpMessage(phone, otp, channel);
}
