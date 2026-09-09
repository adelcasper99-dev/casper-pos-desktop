import nodemailer from "nodemailer";
import { logger } from "./logger";

export interface SendEmailOtpOptions {
    to: string;
    otpCode: string;
    storeName?: string;
    expiresMinutes?: number;
}

export interface EmailServiceResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Creates a reusable Nodemailer transport using environment configuration
 */
function createSmtpTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === "true" || port === 465;

    if (!host || !user || !pass) {
        return null;
    }

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
            user,
            pass
        },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 8000
    });
}

/**
 * Sends a localized OTP verification email
 */
export async function sendEmailOtp(options: SendEmailOtpOptions): Promise<EmailServiceResult> {
    const { to, otpCode, storeName, expiresMinutes = 5 } = options;

    if (!to || !to.includes("@")) {
        return { success: false, error: "INVALID_EMAIL_ADDRESS" };
    }

    const transporter = createSmtpTransporter();
    if (!transporter) {
        logger.warn("[Email Service] SMTP configuration missing (SMTP_HOST, SMTP_USER, or SMTP_PASS not set)");
        return { success: false, error: "SMTP_CONFIG_MISSING" };
    }

    const fromAddress = process.env.SMTP_FROM || `"Casper ERP" <${process.env.SMTP_USER}>`;
    const subject = `رمز التحقق الخاص بك في Casper ERP: [ ${otpCode} ]`;

    const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="utf-8">
    <title>${subject}</title>
    <style>
        body { font-family: 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; direction: rtl; }
        .container { max-width: 520px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .header { text-align: center; margin-bottom: 24px; }
        .logo { font-size: 24px; font-weight: 900; color: #10b981; letter-spacing: 1px; }
        .title { font-size: 18px; font-weight: bold; margin-top: 12px; color: #ffffff; }
        .otp-box { background: linear-gradient(135deg, #064e3b 0%, #0f172a 100%); border: 2px dashed #10b981; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
        .otp-code { font-family: monospace; font-size: 36px; font-weight: 900; color: #34d399; letter-spacing: 8px; }
        .warning { font-size: 13px; color: #94a3b8; text-align: center; line-height: 1.6; }
        .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #64748b; border-top: 1px solid #334155; pt-4; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">⚡ CASPER ERP</div>
            <div class="title">رمز التحقق لتسجيل النشاط التجاري</div>
            ${storeName ? `<p style="color: #94a3b8; font-size: 14px; margin-top: 4px;">النشاط: <b>${storeName}</b></p>` : ""}
        </div>
        <p style="font-size: 14px; color: #e2e8f0; text-align: center;">
            استخدم رمز التحقق التالي لإتمام تسجيل حسابك وتأكيد هويتك:
        </p>
        <div class="otp-box">
            <div class="otp-code">${otpCode}</div>
        </div>
        <div class="warning">
            ⏳ هذا الرمز صالح لمدة <b>${expiresMinutes} دقائق</b> فقط.<br>
            🔒 لأمان حسابك، لا تشارك هذا الرمز مع أي شخص.
        </div>
        <div class="footer">
            تم إرسال هذا البريد تلقائياً من منصة Casper ERP لحماية وتأكيد حسابك.
        </div>
    </div>
</body>
</html>
    `.trim();

    const textContent = `رمز التحقق الخاص بك في Casper ERP هو: [ ${otpCode} ]\nصالح لمدة ${expiresMinutes} دقائق.\nلا تشارك هذا الرمز مع أي شخص.`;

    try {
        const info = await transporter.sendMail({
            from: fromAddress,
            to,
            subject,
            text: textContent,
            html: htmlContent
        });

        logger.info(`[Email Service] OTP successfully delivered to ${to} (MessageId: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[Email Service] Failed to deliver OTP to ${to}: ${msg}`);
        return { success: false, error: msg };
    }
}

/**
 * Validates SMTP configuration
 */
export async function testSmtpConnection(): Promise<{ success: boolean; error?: string }> {
    const transporter = createSmtpTransporter();
    if (!transporter) {
        return { success: false, error: "SMTP_CONFIG_MISSING" };
    }

    try {
        await transporter.verify();
        return { success: true };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
    }
}
