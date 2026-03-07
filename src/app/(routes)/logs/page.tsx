import { getSalesHistory } from '@/actions/sales-actions';
import { getPurchasesHistory } from '@/actions/purchase-actions';
import { getCSRFToken } from '@/lib/csrf';
import LogsPageClient from './LogsPageClient';
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
    await requirePermission(PERMISSIONS.LOGS_VIEW);

    const [salesRes, purchasesRes, csrfToken] = await Promise.all([
        getSalesHistory(),
        getPurchasesHistory(),
        getCSRFToken()
    ]);

    return (
        <LogsPageClient
            sales={(salesRes.success ? salesRes.sales : []) as any[]}
            purchases={(purchasesRes.success ? purchasesRes.purchases : []) as any[]}
            csrfToken={csrfToken ?? undefined}
        />
    );
}
