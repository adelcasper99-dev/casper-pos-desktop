import { getSalesHistory } from '@/actions/sales-actions';
import { getPurchasesHistory } from '@/actions/purchase-actions';
import LogsPageClient from './LogsPageClient';

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
    const [salesRes, purchasesRes] = await Promise.all([
        getSalesHistory(),
        getPurchasesHistory()
    ]);

    return (
        <LogsPageClient
            sales={(salesRes.success ? salesRes.sales : []) as any[]}
            purchases={(purchasesRes.success ? purchasesRes.purchases : []) as any[]}
        />
    );
}
