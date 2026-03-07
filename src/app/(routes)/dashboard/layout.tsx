import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Protect the entire dashboard route and its sub-routes on the server
    await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

    return <>{children}</>;
}
