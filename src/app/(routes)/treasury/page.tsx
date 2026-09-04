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
        <div className="p-2.5 sm:p-3.5 space-y-2.5 min-h-screen font-cairo max-w-[2400px] mx-auto" dir="rtl">
            {/* Header */}
            <div className="flex items-center gap-2.5 bg-zinc-50/80 dark:bg-zinc-900/40 p-2 px-3.5 rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-xs">
                <div className="p-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs">
                    <Landmark className="w-4 h-4" />
                </div>
                <div>
                    <h1 className="text-sm sm:text-base font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                        {t('title', "الخزينة المركزية")}
                        <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">({t('subtitle', "إدارة الأرصدة والسيولة النقدية والحركات المالية")})</span>
                    </h1>
                </div>
            </div>

            <TreasuryDashboard 
                data={data as any} 
                branches={branches} 
                categories={categoriesResult.success ? categoriesResult.data : []}
            />
        </div>
    );
}
