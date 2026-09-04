import ReturnsCenterClient from "./ReturnsCenterClient";
import { getCSRFToken } from "@/lib/csrf";
import { getStoreSettings } from "@/actions/settings";

export const dynamic = "force-dynamic";

export default async function ReturnsCenterPage() {
    const csrfToken = await getCSRFToken();
    const settingsRes = await getStoreSettings();
    const settings = (settingsRes?.data || {}) as { features?: string };

    let features: Record<string, boolean> = {};
    try {
        features = JSON.parse(typeof settings.features === "string" ? settings.features : "{}");
    } catch (e) {
        console.error("Failed to parse features", e);
    }

    return (
        <div className="p-2.5 sm:p-3.5 space-y-2 max-w-[2400px] mx-auto font-cairo text-foreground transition-colors duration-500">
            {/* Header Area */}
            <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-undo-2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm font-black tracking-tight text-foreground">مركز المرتجعات الموحد</h1>
                            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-md font-mono">Casper ERP</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">إدارة شاملة لمرتجعات المبيعات، المشتريات، وتذاكر الصيانة من منصة موحدة</p>
                    </div>
                </div>
            </div>

            <ReturnsCenterClient csrfToken={csrfToken || ""} features={features} />
        </div>
    );
}
