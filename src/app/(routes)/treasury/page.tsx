import { getTreasuryData } from "@/actions/treasury";
import { prisma } from "@/lib/prisma";
import TreasuryDashboard from "@/components/treasury/TreasuryDashboard";
import { Landmark } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function TreasuryPage() {
    await requirePermission(PERMISSIONS.TREASURY_VIEW);

    const [dataResult, branches] = await Promise.all([
        getTreasuryData(),
        prisma.branch.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    ]);

    const data = dataResult.success && dataResult.data
        ? dataResult.data
        : { byMethod: { CASH: 0, VISA: 0, WALLET: 0, INSTAPAY: 0 }, transactions: [], treasuries: [] };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl">
                    <Landmark className="w-7 h-7 text-cyan-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">الخزينة</h1>
                    <p className="text-sm text-muted-foreground">إدارة الأرصدة والحركات المالية</p>
                </div>
            </div>

            <TreasuryDashboard data={data as any} branches={branches} />
        </div>
    );
}
