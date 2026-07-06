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
import { LicenseVerifier } from "@/lib/license/verify";
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
    const user = await getCurrentUser();
    const cookieStore = await cookies();
    const csrfToken = cookieStore.get('csrf-token')?.value || null;

    const settingsRes = await getStoreSettings();
    const settings = settingsRes?.data || {};

    let licenseStatus = null;
    try {
        licenseStatus = await LicenseVerifier.verify();
    } catch (error) {
        console.error("License verification error in layout:", error);
        licenseStatus = { status: 'ERROR', message: 'Failed to verify license' };
    }

    return (
        <html lang="ar" dir="rtl" suppressHydrationWarning>
            <body className="antialiased">
                <Providers initialToken={csrfToken}>
                    <TimeSyncWarning />
                    <NavigationHotkeys />
                    <LayoutWrapper user={user} settings={settings} licenseStatus={licenseStatus}>
                        {children}
                    </LayoutWrapper>
                    <Toaster richColors position="top-center" expand={true} style={{ zIndex: 10000 }} />
                </Providers>
            </body>
        </html>
    );
}

// Client-side wrapper to handle conditional sidebar

function LayoutWrapper({ children, user, settings, licenseStatus }: { children: React.ReactNode, user: any, settings: any, licenseStatus: any }) {
    return (
        <LayoutContent user={user} settings={settings} licenseStatus={licenseStatus}>
            {children}
        </LayoutContent>
    );
}
