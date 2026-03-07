import { getCurrentUser } from "@/actions/auth";
import { MaintenanceDashboardClient } from "@/components/hq-dashboard/MaintenanceDashboardClient";
import { getHQMaintenanceStats } from "@/actions/hq-maintenance-actions";
import { getVisibleBranches } from "@/actions/branch-actions";
import { redirect } from "next/navigation";
import { subDays } from "date-fns";

export default async function MaintenanceDashboardPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");

    // Fetch initial data for SSR
    const statsResult = await getHQMaintenanceStats({
        dateRange: {
            from: subDays(new Date(), 30),
            to: new Date()
        }
    });

    const branchesResult = await getVisibleBranches();

    // Fallback simple branch list if getVisibleBranches returns refined object
    const branches = (branchesResult.success && branchesResult.data) ? branchesResult.data.map((b: any) => ({
        id: b.id,
        name: b.name
    })) : [];

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="flex flex-col gap-1 mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                    Maintenance HQ Dashboard
                </h1>
                <p className="text-slate-500 text-sm">
                    Real-time specialized analytics for repairs, success ratios, and technician performance.
                </p>
            </div>

            <MaintenanceDashboardClient
                initialData={statsResult.success ? statsResult : null}
                branches={branches}
            />
        </div>
    );
}
