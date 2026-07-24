import { NextResponse } from "next/server";
import { z } from "zod";
import { provisionTenantCore } from "@/actions/hq-tenant-actions";
import { rateLimit } from "@/lib/rate-limit";
import { createUserSession } from "@/lib/auth";

const signupSchema = z.object({
  storeName: z.string().min(2, "اسم المتجر يجب أن يكون حرفين على الأقل"),
  slug: z.string().min(3, "رابط المعرف قصير جداً").max(30),
  adminUsername: z.string().min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"),
  adminPassword: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
  email: z.string().email("البريد الإلكتروني غير صحيح").optional().or(z.literal("")),
  phone: z.string().optional()
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

    // 3. Provision Tenant Core (Turnkey Seeding)
    const result = await provisionTenantCore({
      name: parsed.storeName,
      domain: parsed.slug,
      adminUsername: parsed.adminUsername,
      adminPassword: parsed.adminPassword,
      adminRole: "ADMIN",
      duration: "14_DAYS",
      email: parsed.email || undefined,
      phone: parsed.phone || undefined
    });

    // 4. Create Session for new Admin User
    await createUserSession({
      id: result.user.id,
      username: result.user.username,
      name: result.user.name,
      role: "ADMIN",
      tenantId: result.tenant.id,
      branchId: result.branchId,
      permissions: ["*"]
    });

    return NextResponse.json({
      success: true,
      message: "تم إنشاء حسابك وتفعيل الفترة التجريبية (14 يوماً) بنجاح!",
      subdomain: result.tenant.slug,
      redirectUrl: "/dashboard"
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "بيانات الإدخال غير صحيحة" },
        { status: 400 }
      );
    }

    if (error?.code === "P2002" || error?.message?.includes("مستخدم بالفعل")) {
      return NextResponse.json(
        { error: "هذا المعرف الفرعي (Subdomain) مستخدم بالفعل، يرجى اختيار اسم آخر." },
        { status: 409 }
      );
    }

    console.error("Signup error:", error);
    return NextResponse.json(
      { error: error.message || "حدث خطأ غير متوقع أثناء إنشاء الحساب" },
      { status: 500 }
    );
  }
}
