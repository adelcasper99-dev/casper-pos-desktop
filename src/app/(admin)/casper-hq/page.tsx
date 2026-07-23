import { prisma, isPostgres } from "@/lib/prisma";
import { HQDashboardClient } from "@/components/hq/HQDashboardClient";

export default async function HQDashboard() {
  if (!isPostgres) {
    return (
      <div className="p-6 bg-amber-50 dark:bg-zinc-900 text-amber-800 dark:text-amber-500 rounded-2xl border border-amber-200 dark:border-white/10 space-y-2" dir="rtl">
        <h2 className="text-xl font-black">لوحة تحكم كاسبر غير متاحة في النمط أوفلاين</h2>
        <p className="text-sm">
          لوحة تحكم كاسبر الرئيسية (HQ Dashboard) تختص بإدارة عملاء وتراخيص الـ SaaS وتتطلب الاتصال بنواة السيرفر السحابي (PostgreSQL).
        </p>
        <p className="text-xs opacity-75">
          الأجهزة المحلية (SQLite) تعمل في وضع التشغيل المحلي وتوفر أداءً مستقلاً دون الحاجة للتحكم السحابي.
        </p>
      </div>
    );
  }

  const [tenants, primaryUsers] = await Promise.all([
    prisma.tenant.findMany({
      include: {
        licenses: true
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.user.findMany({
      select: {
        tenantId: true,
        username: true,
        roleStr: true
      },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  const adminMap = new Map<string, { username: string, roleStr: string }>();
  primaryUsers.forEach(u => {
    if (u.tenantId && u.username && !adminMap.has(u.tenantId)) {
      adminMap.set(u.tenantId, { username: u.username, roleStr: u.roleStr || "ADMIN" });
    }
  });

  return <HQDashboardClient tenants={tenants} adminMap={adminMap} />;
}
