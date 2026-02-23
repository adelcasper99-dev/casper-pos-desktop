import { getReportData, getBranchesForFilter } from "@/actions/reports-actions";
import { getShiftHistory } from "@/actions/shift-management-actions";
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

    const shiftsRes = await getShiftHistory({
        startDate: params.startDate,
        endDate: params.endDate,
        limit: 100 // Fetch a reasonable amount for initial load
    });

    return (
        <ReportPage
            initialData={reportRes.success ? reportRes.data : null}
            branches={branchesRes.success ? branchesRes.branches : []}
            shifts={shiftsRes.success ? shiftsRes.shifts : []}
            filters={{
                startDate: params.startDate,
                endDate: params.endDate,
                branchId: params.branchId,
            }}
        />
    );
}
