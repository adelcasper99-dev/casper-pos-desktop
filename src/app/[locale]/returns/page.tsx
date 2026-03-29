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
        <div className="p-8 space-y-8 min-h-screen text-foreground transition-colors duration-500">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
                        <div className="w-2 h-10 bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary),0.5)]" />
                        مركز المرتجعات الموحد
                    </h1>
                    <p className="text-muted-foreground text-sm mt-2 font-medium">إدارة شاملة لمرتجعات المبيعات، المشتريات، وتذاكر الصيانة من منصة موحدة</p>
                </div>
            </div>

            <ReturnsCenterClient csrfToken={csrfToken || ""} features={features} />
        </div>
    );
}
