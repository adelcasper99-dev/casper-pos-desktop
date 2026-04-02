import { getTreasuryData, getCashCategories } from "@/actions/treasury";
import { prisma } from "@/lib/prisma";
import TreasuryDashboard from "@/components/treasury/TreasuryDashboard";
import { Landmark } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { useTranslations } from "@/lib/i18n-mock";

export const dynamic = "force-dynamic";

export default async function TreasuryPage() {
    const t = useTranslations('Treasury');
    await requirePermission(PERMISSIONS.TREASURY_VIEW);

    const [dataResult, branches, categoriesResult] = await Promise.all([
        getTreasuryData(),
        prisma.branch.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
        getCashCategories(),
    ]);

    const data = dataResult.success && dataResult.data
        ? dataResult.data
        : { byMethod: { CASH: 0, VISA: 0, WALLET: 0, INSTAPAY: 0 }, transactions: [], treasuries: [] };

    return (
        <div className="p-6 space-y-6 min-h-screen font-cairo" dir="rtl">
            {/* Header */}
            <header className="flex flex-col gap-1">
                <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white uppercase flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                        <Landmark className="w-8 h-8" />
                    </div>
                    {t('title', "الخزينة المركزية")}
                </h1>
                <p className="text-muted-foreground font-bold text-sm ml-12">{t('subtitle', "إدارة الأرصدة والسيولة النقدية والحركات المالية")}</p>
            </header>

            <TreasuryDashboard 
                data={data as any} 
                branches={branches} 
                categories={categoriesResult.success ? categoriesResult.data : []}
            />
        </div>
    );
}
