import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/inter/900.css";
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@/app/globals.css";
import { Toaster } from "@/components/ui/sonner";
import Providers from "@/components/Providers";
import { cookies } from "next/headers";
import Sidebar from "@/components/Sidebar";
import NavigationHotkeys from "@/components/NavigationHotkeys";
import { getCurrentUser } from "@/actions/auth";
import { getStoreSettings } from "@/actions/settings";
import { LicenseVerifier, LicenseCheckResult } from "@/lib/license/verify";
import { requireActiveTenant } from "@/lib/tenant-guard";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import LayoutContent from "./LayoutContent";
import { TimeSyncWarning } from "@/components/layout/TimeSyncWarning";
 
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Casper POS Desktop",
    description: "Offline POS System",
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Database and seeding are now handled by src/instrumentation.ts on server startup
    const reqHeaders = await headers();
    const tenantId = reqHeaders.get('x-tenant-id');
    
    if (tenantId && tenantId !== 'default' && tenantId !== 'SYSTEM') {
        try {
            await requireActiveTenant(tenantId);
        } catch (error: any) {
            if (error?.code === 'TENANT_SUSPENDED') {
                return (
                    <html lang="ar" dir="rtl">
                        <body className="flex items-center justify-center h-screen bg-slate-950 text-white font-sans">
                            <div className="text-center p-8 bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl max-w-md">
                                <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20 text-2xl">
                                    ⚠️
                                </div>
                                <h1 className="text-xl font-bold text-red-400 mb-1">الحساب معطل</h1>
                                <p className="text-xs text-red-500/80 font-mono mb-4">(Account Suspended)</p>
                                <p className="text-slate-400 text-sm mb-2">تم إيقاف حساب هذا العميل مؤقتاً.</p>
                                <p className="text-slate-500 text-xs">يُرجى التواصل مع الدعم الفني لإعادة التفعيل.</p>
                            </div>
                        </body>
                    </html>
                );
            }
            if (error?.code === 'TENANT_NOT_FOUND') {
                return (
                    <html lang="ar" dir="rtl">
                        <body className="flex items-center justify-center h-screen bg-slate-950 text-white font-sans">
                            <div className="text-center p-8 bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl max-w-md">
                                <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/20 text-2xl">
                                    🔍
                                </div>
                                <h1 className="text-xl font-bold text-amber-400 mb-1">النطاق غير موجود</h1>
                                <p className="text-xs text-amber-500/80 font-mono mb-4">(Tenant Not Found)</p>
                                <p className="text-slate-400 text-sm mb-2">هذا النطاق الفرعي غير مسجل في منظومة Casper ERP.</p>
                                <p className="text-slate-500 text-xs">تواصل مع الإدارة للتحقق من صحة الرابط.</p>
                            </div>
                        </body>
                    </html>
                );
            }
        }
    }

    const user = await getCurrentUser();
    const cookieStore = await cookies();
    const csrfToken = cookieStore.get('csrf-token')?.value || null;

    const settingsRes = await getStoreSettings();
    const settings = settingsRes?.data || {};

    let licenseStatus: LicenseCheckResult | null = null;
    try {
        licenseStatus = await LicenseVerifier.verify();
    } catch (error) {
        console.error("License verification error in layout:", error);
        licenseStatus = { status: 'ERROR', message: 'Failed to verify license' };
    }

    return (
        <html lang="ar" dir="rtl" suppressHydrationWarning>
            <body className="antialiased">
                <Providers initialToken={csrfToken} initialSettings={settings}>
                    <TimeSyncWarning />
                    <NavigationHotkeys />
                    <LayoutWrapper user={user} settings={settings} licenseStatus={licenseStatus} isHq={tenantId === 'SYSTEM'}>
                        {children}
                    </LayoutWrapper>
                    <Toaster richColors position="top-center" expand={true} style={{ zIndex: 10000 }} />
                </Providers>
            </body>
        </html>
    );
}

// Client-side wrapper to handle conditional sidebar

function LayoutWrapper({ children, user, settings, licenseStatus, isHq }: { children: React.ReactNode, user: any, settings: any, licenseStatus: any, isHq: boolean }) {
    return (
        <LayoutContent user={user} settings={settings} licenseStatus={licenseStatus} isHq={isHq}>
            {children}
        </LayoutContent>
    );
}
