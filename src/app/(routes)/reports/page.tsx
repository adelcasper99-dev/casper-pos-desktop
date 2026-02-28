import { getReportData, getBranchesForFilter, getSalesByProductAndCategory, getCategoriesForFilter, getProductsForFilter } from "@/actions/reports-actions";
import { getShiftHistory } from "@/actions/shift-management-actions";
import ReportPage from "@/components/reports/ReportPage";

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
    searchParams,
}: {
    searchParams: { startDate?: string; endDate?: string; branchId?: string; categoryId?: string; productId?: string };
}) {
    const params = await searchParams;

    const [reportRes, branchesRes, categoriesRes, productsRes, shiftsRes, salesByProductRes] = await Promise.all([
        getReportData({ startDate: params.startDate, endDate: params.endDate, branchId: params.branchId }),
        getBranchesForFilter(),
        getCategoriesForFilter(),
        getProductsForFilter(),
        getShiftHistory({ startDate: params.startDate, endDate: params.endDate, limit: 100 }),
        getSalesByProductAndCategory({ startDate: params.startDate, endDate: params.endDate, branchId: params.branchId, categoryId: params.categoryId, productId: params.productId }),
    ]);

    return (
        <ReportPage
            initialData={reportRes.success ? reportRes.data : null}
            branches={branchesRes.success ? branchesRes.branches : []}
            categories={categoriesRes.success ? categoriesRes.categories : []}
            products={productsRes.success ? productsRes.products : []}
            shifts={shiftsRes.success ? shiftsRes.shifts : []}
            salesByProduct={salesByProductRes.success ? (salesByProductRes.byProduct ?? []) : []}
            salesByCategory={salesByProductRes.success ? (salesByProductRes.byCategory ?? []) : []}
            filters={{
                startDate: params.startDate,
                endDate: params.endDate,
                branchId: params.branchId,
                categoryId: params.categoryId,
                productId: params.productId,
            }}
        />
    );
}
