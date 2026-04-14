import CashFlowDashboard from "@/features/reports/ui/CashFlowDashboard";

export const metadata = {
    title: "Casper POS | Cash Flow & Profit",
    description: "Financial performance dashboard",
};

export default function Page() {
    return (
        <div className="max-w-[2400px] mx-auto p-4 md:p-8">
            <CashFlowDashboard />
        </div>
    );
}
