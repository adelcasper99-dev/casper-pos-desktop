import { getReportData, getBranchesForFilter } from "@/actions/reports-actions";
import ReportPage from "@/components/reports/ReportPage";

export default async function ReportsPage({
    searchParams,
}: {
    searchParams: { startDate?: string; endDate?: string; branchId?: string };
}) {
    const params = await searchParams;
    const reportRes = await getReportData({
        startDate: params.startDate,
        endDate: params.endDate,
        branchId: params.branchId,
    });

    const branchesRes = await getBranchesForFilter();

    return (
        <ReportPage
            initialData={reportRes.success ? reportRes.data : null}
            branches={branchesRes.success ? branchesRes.branches : []}
            filters={{
                startDate: params.startDate,
                endDate: params.endDate,
                branchId: params.branchId,
            }}
        />
    );
}
