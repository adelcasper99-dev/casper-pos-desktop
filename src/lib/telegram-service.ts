import { logger } from "./logger";

export interface SendTelegramMessageOptions {
    text: string;
    chatId?: string;
    botToken?: string;
    parseMode?: "HTML" | "MarkdownV2" | "Markdown";
}

export async function sendTelegramMessage(options: SendTelegramMessageOptions): Promise<{ success: boolean; messageId?: number; error?: string }> {
    const token = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = options.chatId || process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!token || !chatId) {
        return {
            success: false,
            error: "TELEGRAM_CONFIG_MISSING: Bot Token and Chat ID are required"
        };
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: options.text,
                parse_mode: options.parseMode || "HTML"
            }),
            signal: AbortSignal.timeout(6000)
        });

        const data = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };
        if (!data.ok) {
            logger.warn(`[Telegram Service] Failed to send message: ${data.description}`);
            return { success: false, error: data.description || "Telegram API Error" };
        }

        logger.info(`[Telegram Service] Message delivered to Chat ID ${chatId} (Msg ID: ${data.result?.message_id})`);
        return { success: true, messageId: data.result?.message_id };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[Telegram Service] Exception while sending message: ${msg}`);
        return { success: false, error: msg };
    }
}

export async function testTelegramBot(botToken?: string): Promise<{ success: boolean; botName?: string; username?: string; error?: string }> {
    const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        return { success: false, error: "Bot Token is required" };
    }

    try {
        const url = `https://api.telegram.org/bot${token}/getMe`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await res.json() as { ok: boolean; result?: { first_name: string; username: string }; description?: string };
        if (!data.ok) {
            return { success: false, error: data.description || "Invalid Bot Token" };
        }
        return {
            success: true,
            botName: data.result?.first_name,
            username: data.result?.username
        };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
    }
}
