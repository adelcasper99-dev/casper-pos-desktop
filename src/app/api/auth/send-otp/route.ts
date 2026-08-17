import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { generateOtpCode, hashOtp, normalizePhone, dispatchOtpWhatsApp } from "@/lib/otp-service";
import { logger } from "@/lib/logger";

const sendOtpSchema = z.object({
    phone: z.string().min(8, "رقم الهاتف غير صحيح").max(20, "رقم الهاتف غير صحيح")
});

export async function POST(request: Request) {
    try {
        const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "anonymous";

        // 1. IP Rate Limiting (Max 5 requests per 10 minutes)
        const ipLimit = await rateLimit(`ip:${ip}`, {
            keyPrefix: "send-otp-ip",
            limit: 5,
            windowSeconds: 600
        });

        if (!ipLimit.success) {
            const mins = Math.ceil((ipLimit.reset - Date.now()) / 60000);
            return NextResponse.json(
                { error: `لقد تجاوزت عدد المحاولات المسموحة لهذا الجهاز. يرجى الانتظار ${mins} دقيقة.` },
                { status: 429 }
            );
        }

        // 2. Validate Body
        const body = await request.json();
        const parsed = sendOtpSchema.parse(body);
        const normalizedPhone = normalizePhone(parsed.phone);

        if (!normalizedPhone || normalizedPhone.length < 8) {
            return NextResponse.json({ error: "رقم الهاتف غير صالح" }, { status: 400 });
        }

        // 3. Phone-level Rate Limiting (Max 3 OTP requests per 10 minutes)
        const phoneLimit = await rateLimit(`phone:${normalizedPhone}`, {
            keyPrefix: "send-otp-phone",
            limit: 3,
            windowSeconds: 600
        });

        if (!phoneLimit.success) {
            const mins = Math.ceil((phoneLimit.reset - Date.now()) / 60000);
            return NextResponse.json(
                { error: `تم إرسال عدة رموز لهذا الرقم مؤخراً. يرجى الانتظار ${mins} دقيقة للمحاولة مجدداً.` },
                { status: 429 }
            );
        }

        // 4. Generate and Hash OTP
        const otpCode = generateOtpCode(6);
        const hashedCode = await hashOtp(otpCode);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // 5. Atomic Storage: Invalidate existing unverified OTPs and create new one
        await prisma.$transaction(async (tx) => {
            await tx.signupOtp.deleteMany({
                where: {
                    phone: normalizedPhone,
                    verified: false
                }
            });

            await tx.signupOtp.create({
                data: {
                    phone: normalizedPhone,
                    otpHash: hashedCode,
                    expiresAt,
                    attempts: 0,
                    verified: false
                }
            });
        });

        // 6. Dispatch via WhatsApp Gateway (Non-blocking failure safety)
        const dispatchResult = await dispatchOtpWhatsApp(normalizedPhone, otpCode);

        logger.info(`[API send-otp] OTP generated for ${normalizedPhone} (Provider: ${dispatchResult.provider})`);

        return NextResponse.json({
            success: true,
            message: "تم إرسال رمز التحقق إلى رقم الواتساب بنجاح",
            expiresInSeconds: 300
        });

    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: error.issues[0]?.message || "بيانات الهاتف غير صحيحة" },
                { status: 400 }
            );
        }

        const msg = error instanceof Error ? error.message : "فشل إرسال رمز التحقق. يرجى المحاولة لاحقاً.";
        logger.error("[API send-otp] Error:", error);
        return NextResponse.json(
            { error: msg },
            { status: 500 }
        );
    }
}
