import { Suspense } from 'react';
import { useTranslations } from '@/lib/i18n-mock';
import CustomerAccountsTab from '@/components/customers/CustomerAccountsTab';
import { CasperLoader } from '@/components/ui/CasperLoader';
import { Users } from 'lucide-react';

export default function CustomersPage() {
    const t = useTranslations('Customers');

    return (
        <div className="p-2.5 sm:p-3.5 space-y-2.5 min-h-screen bg-transparent font-cairo max-w-[2400px] mx-auto">
            <div className="flex items-center gap-2.5 bg-zinc-50/80 dark:bg-zinc-900/40 p-2 px-3.5 rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-xs">
                <div className="p-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs">
                    <Users className="w-4 h-4" />
                </div>
                <div>
                    <h1 className="text-sm sm:text-base font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                        {t('title')}
                        <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">({t('subtitle')})</span>
                    </h1>
                </div>
            </div>

            <Suspense fallback={<div className="h-[60vh] flex items-center justify-center"><CasperLoader width={80} /></div>}>
                <CustomerAccountsTab />
            </Suspense>
        </div>
    );
}
