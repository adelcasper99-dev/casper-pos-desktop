import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizePhone, verifyOtpHash, createVerificationToken, MAX_OTP_ATTEMPTS } from "@/lib/otp-service";
import { logger } from "@/lib/logger";

const verifyOtpSchema = z.object({
    phone: z.string().min(8, "رقم الهاتف غير صحيح"),
    otp: z.string().length(6, "رمز التحقق يجب أن يتكون من 6 أرقام")
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const parsed = verifyOtpSchema.parse(body);
        const normalizedPhone = normalizePhone(parsed.phone);

        // 1. Fetch latest active OTP record for this phone
        const otpRecord = await prisma.signupOtp.findFirst({
            where: {
                phone: normalizedPhone,
                verified: false
            },
            orderBy: { createdAt: "desc" }
        });

        if (!otpRecord) {
            return NextResponse.json(
                { error: "لم يتم العثور على رمز تحقق نشط لهذا الرقم. يرجى طلب رمز جديد." },
                { status: 404 }
            );
        }

        // 2. Check Expiration
        if (new Date() > otpRecord.expiresAt) {
            await prisma.signupOtp.delete({ where: { id: otpRecord.id } });
            return NextResponse.json(
                { error: "انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد." },
                { status: 400 }
            );
        }

        // 3. Brute-Force Lock Check
        if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
            await prisma.signupOtp.delete({ where: { id: otpRecord.id } });
            return NextResponse.json(
                { error: `تم تجاوز الحد الأقصى للمحاولات الخاطئة (${MAX_OTP_ATTEMPTS} محاولات). يرجى طلب رمز جديد.` },
                { status: 429 }
            );
        }

        // 4. Verify Hash
        const isMatch = await verifyOtpHash(parsed.otp, otpRecord.otpHash);

        if (!isMatch) {
            const nextAttempts = otpRecord.attempts + 1;
            await prisma.signupOtp.update({
                where: { id: otpRecord.id },
                data: { attempts: nextAttempts }
            });

            const remaining = MAX_OTP_ATTEMPTS - nextAttempts;
            if (remaining <= 0) {
                await prisma.signupOtp.delete({ where: { id: otpRecord.id } });
                return NextResponse.json(
                    { error: "رمز التحقق غير صحيح. تم قفل المحاولات لهذا الرمز، يرجى طلب رمز جديد." },
                    { status: 400 }
                );
            }

            return NextResponse.json(
                { error: `رمز التحقق غير صحيح. متبقي لديك ${remaining} محاولات.` },
                { status: 400 }
            );
        }

        // 5. Success: Mark OTP Verified and Issue Proof Token
        await prisma.signupOtp.update({
            where: { id: otpRecord.id },
            data: { verified: true }
        });

        const verificationToken = createVerificationToken(normalizedPhone);

        logger.info(`[API verify-otp] Phone ${normalizedPhone} verified successfully`);

        return NextResponse.json({
            success: true,
            message: "تم التحقق من رقم الهاتف بنجاح",
            verificationToken
        });

    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: error.issues[0]?.message || "بيانات التحقق غير صحيحة" },
                { status: 400 }
            );
        }

        const msg = error instanceof Error ? error.message : "حدث خطأ أثناء التحقق من الرمز";
        logger.error("[API verify-otp] Error:", error);
        return NextResponse.json(
            { error: msg },
            { status: 500 }
        );
    }
}
