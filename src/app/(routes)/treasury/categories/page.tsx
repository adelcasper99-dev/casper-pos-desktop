import CashCategoriesManager from "@/components/treasury/CashCategoriesManager";
import { Landmark } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { useTranslations } from "@/lib/i18n-mock";

export const dynamic = "force-dynamic";

export default async function CashCategoriesPage() {
    const t = useTranslations('Treasury');
    await requirePermission(PERMISSIONS.TREASURY_VIEW);

    return (
        <div className="p-6 space-y-6 min-h-screen font-cairo" dir="rtl">
            <header className="flex flex-col gap-1">
                <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white uppercase flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                        <Landmark className="w-8 h-8" />
                    </div>
                    {t('categories', "تصنيفات النقدية")}
                </h1>
                <p className="text-muted-foreground font-bold text-sm ml-12">إدارة تصنفيات حركات الإيداع والسحب من الخزن</p>
            </header>

            <CashCategoriesManager />
        </div>
    );
}