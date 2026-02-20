import { Suspense } from 'react';
import { useTranslations } from '@/lib/i18n-mock';
import CustomerAccountsTab from '@/components/customers/CustomerAccountsTab';
import { CasperLoader } from '@/components/ui/CasperLoader';

export default function CustomersPage() {
    const t = useTranslations('Customers');

    return (
        <div className="p-6 space-y-6 min-h-screen bg-transparent">
            <header className="flex flex-col gap-1">
                <h1 className="text-3xl font-black tracking-tight text-foreground">{t('title')}</h1>
                <p className="text-muted-foreground">{t('subtitle')}</p>
            </header>

            <Suspense fallback={<div className="h-[60vh] flex items-center justify-center"><CasperLoader width={80} /></div>}>
                <CustomerAccountsTab />
            </Suspense>
        </div>
    );
}
