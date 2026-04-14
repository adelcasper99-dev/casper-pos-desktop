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
import { initDatabase } from "@/lib/db-init";
import { getStoreSettings } from "@/actions/settings";
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
    await initDatabase(); // Phase 2: WAL mode + FK enforcement + CoA seed on cold start
    const user = await getCurrentUser();
    const cookieStore = await cookies();
    const csrfToken = cookieStore.get('csrf-token')?.value || null;

    const settingsRes = await getStoreSettings();
    const settings = settingsRes?.data || {};

    return (
        <html lang="ar" dir="rtl" suppressHydrationWarning>
            <body className="antialiased">
                <Providers initialToken={csrfToken}>
                    <TimeSyncWarning />
                    <NavigationHotkeys />
                    <LayoutWrapper user={user} settings={settings}>
                        {children}
                    </LayoutWrapper>
                    <Toaster />
                </Providers>
            </body>
        </html>
    );
}

// Client-side wrapper to handle conditional sidebar

function LayoutWrapper({ children, user, settings }: { children: React.ReactNode, user: any, settings: any }) {
    return (
        <LayoutContent user={user} settings={settings}>
            {children}
        </LayoutContent>
    );
}
