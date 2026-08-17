import { NextResponse } from "next/server";
import { consumeTelegramOtpSession } from "@/lib/telegram-otp-store";
import { sendTelegramMessage } from "@/lib/telegram-service";
import { logger } from "@/lib/logger";

interface TelegramUpdate {
    update_id: number;
    message?: {
        message_id: number;
        from?: {
            id: number;
            is_bot: boolean;
            first_name: string;
            username?: string;
        };
        chat: {
            id: number;
            type: string;
            title?: string;
            username?: string;
        };
        date: number;
        text?: string;
    };
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as TelegramUpdate;
        const message = body.message;

        if (!message || !message.text || !message.chat?.id) {
            return NextResponse.json({ ok: true });
        }

        const chatId = String(message.chat.id);
        const text = message.text.trim();

        // 1. Handle 1-Click Deep Link OTP: /start otp_<TOKEN>
        if (text.startsWith("/start otp_")) {
            const token = text.replace("/start otp_", "").trim();
            const session = consumeTelegramOtpSession(token);

            if (session) {
                const replyText = `🔐 <b>أهلاً بك في Casper ERP!</b>\n\nرمز التحقق الخاص بحسابك (<code>+${session.phone}</code>) هو:\n\n👉 <code>${session.otpCode}</code> 👈\n\n<i>(اضغط على الرمز لنسخه ثم ارجع للمتصفح لإتمام التسجيل)</i>\n⏳ <i>الرمز صالح لمدة 5 دقائق.</i>`;

                await sendTelegramMessage({
                    chatId,
                    text: replyText,
                    parseMode: "HTML"
                });

                logger.info(`[Telegram Webhook] OTP delivered to Telegram Chat ${chatId} for phone ${session.phone}`);
            } else {
                await sendTelegramMessage({
                    chatId,
                    text: `⚠️ <b>انتهت صلاحية رمز التحقق أو الرابط غير صالح.</b>\nيرجى العودة لصفحة التسجيل والنقر على "إعادة إرسال الرمز".`,
                    parseMode: "HTML"
                });
            }

            return NextResponse.json({ ok: true });
        }

        // 2. Handle general /start or info
        if (text.startsWith("/start")) {
            await sendTelegramMessage({
                chatId,
                text: `👋 <b>مرحباً بك في بوت الدعم والتحقق من Casper ERP!</b>\n\nمعرّف المحادثة الخاص بك (Chat ID) هو: <code>${chatId}</code>\n\nجاهز لاستلام أكواد التحقق وإشعارات النظام.`,
                parseMode: "HTML"
            });
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[Telegram Webhook Error] ${msg}`);
        return NextResponse.json({ ok: true });
    }
}
