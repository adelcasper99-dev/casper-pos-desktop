import { NextResponse } from "next/server";
import { z } from "zod";
import { provisionTenantCore } from "@/actions/hq-tenant-actions";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePhone, verifyVerificationToken } from "@/lib/otp-service";

const signupSchema = z.object({
  storeName: z.string().min(2, "اسم المتجر يجب أن يكون حرفين على الأقل"),
  slug: z.string().min(3, "رابط المعرف قصير جداً").max(30),
  adminUsername: z.string().min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"),
  adminPassword: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
  email: z.string().email("البريد الإلكتروني غير صحيح").optional().or(z.literal("")),
  phone: z.string().min(8, "رقم الهاتف إلزامي للتسجيل"),
  verificationToken: z.string().min(10, "رمز التحقق من الهاتف مفقود أو غير صالح")
});

export async function POST(request: Request) {
  try {
    // 1. IP Rate Limiting Guard
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "anonymous";
    const limit = await rateLimit(`signup:${ip}`, {
      keyPrefix: 'signup',
      limit: 3,
      windowSeconds: 600 // 3 signups per 10 minutes per IP
    });

    if (!limit.success) {
      const mins = Math.ceil((limit.reset - Date.now()) / 60000);
      return NextResponse.json(
        { error: `لقد تجاوزت عدد محاولات التسجيل المسموحة. يرجى الانتظار ${mins} دقيقة.` },
        { status: 429 }
      );
    }

    // 2. Validate Body
    const body = await request.json();
    const parsed = signupSchema.parse(body);
    const normalizedPhone = normalizePhone(parsed.phone);

    // 3. Verify OTP Proof Token
    const verifiedProof = verifyVerificationToken(parsed.verificationToken);
    if (!verifiedProof || verifiedProof.phone !== normalizedPhone) {
      return NextResponse.json(
        { error: "رمز توثيق الهاتف غير صالح أو منتهي الصلاحية. يرجى إعادة التحقق من هاتفك." },
        { status: 403 }
      );
    }

    // 4. Provision Tenant Core (Turnkey Seeding)
    const result = await provisionTenantCore({
      name: parsed.storeName,
      domain: parsed.slug,
      adminUsername: parsed.adminUsername,
      adminPassword: parsed.adminPassword,
      adminRole: "ADMIN",
      duration: "14_DAYS",
      email: parsed.email || undefined,
      phone: normalizedPhone
    });

    return NextResponse.json({
      success: true,
      message: "تم إنشاء متجرك وتفعيل الفترة التجريبية (14 يوماً) بنجاح! يرجى تسجيل الدخول للبدء.",
      subdomain: result.tenant.slug,
      redirectUrl: "/login"
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "بيانات الإدخال غير صحيحة" },
        { status: 400 }
      );
    }

    const errObj = error as { code?: string; message?: string; meta?: { target?: string[] | string } };
    if (errObj?.code === "P2002") {
      const rawTarget = errObj.meta?.target;
      const targets = Array.isArray(rawTarget)
        ? rawTarget.map((t) => String(t).toLowerCase())
        : [String(rawTarget || "").toLowerCase()];

      if (targets.some((t) => t.includes("phone"))) {
        return NextResponse.json(
          { error: "رقم الهاتف هذا مسجل بالفعل في النظام، يرجى استخدام رقم آخر أو تسجيل الدخول." },
          { status: 409 }
        );
      }
      if (targets.some((t) => t.includes("username"))) {
        return NextResponse.json(
          { error: "اسم المستخدم هذا مسجل بالفعل في هذا المتجر، يرجى اختيار اسم آخر." },
          { status: 409 }
        );
      }
      if (targets.some((t) => t.includes("slug") || t.includes("domain") || t === "id" || t.includes("tenant_pkey") || t.includes("tenant_slug_key") || t.includes("tenant_domain_key"))) {
        return NextResponse.json(
          { error: "هذا المعرف الفرعي (Subdomain) مستخدم بالفعل، يرجى اختيار اسم آخر." },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "توجد بيانات مسجلة مسبقاً تطابق البيانات المدخلة، يرجى المراجعة." },
        { status: 409 }
      );
    }

    if (errObj?.message?.includes("مستخدم بالفعل")) {
      return NextResponse.json(
        { error: errObj.message },
        { status: 409 }
      );
    }

    console.error("Signup error:", error);
    return NextResponse.json(
      { error: errObj?.message || "حدث خطأ غير متوقع أثناء إنشاء الحساب" },
      { status: 500 }
    );
  }
}
