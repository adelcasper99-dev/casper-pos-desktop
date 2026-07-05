"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import TitleBar from "@/components/TitleBar";
import SplashScreen from "@/components/SplashScreen";
import AutoUpdateListener from "@/components/layout/AutoUpdateListener";
import { LicenseProvider } from "@/contexts/LicenseContext";

const TrainingModal = dynamic(() => import("@/components/ui/TrainingModal"), { ssr: false });

export default function LayoutContent({
    children,
    user,
    settings,
    licenseStatus
}: {
    children: React.ReactNode;
    user: any;
    settings: any;
    licenseStatus?: any;
}) {
    const pathname = usePathname();
    const isStandalonePage = pathname === "/" || pathname === "/login" || pathname === "/setup" || pathname === "/network-setup";

    // Show splash screen on Electron startup (client-side only, won't SSR)
    const [showSplash, setShowSplash] = useState(false);
    useEffect(() => {
        if (window.electronAPI?.isElectron) {
            setShowSplash(true);
        }
    }, []);

    const router = useRouter();
    useEffect(() => {
        if (licenseStatus?.status === 'MISSING' && pathname !== '/activate' && pathname !== '/login') {
            router.push('/activate');
        }
    }, [licenseStatus, pathname, router]);

    const isReadOnly = licenseStatus?.status !== 'VALID' && licenseStatus?.status !== 'MISSING';

    if (isStandalonePage) {
        return (
            <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
                {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
                <div className="print:hidden">
                    <TitleBar />
                </div>
                <div className="flex-1 overflow-hidden">
                    {children}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
            {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
            <div className="print:hidden">
                <TitleBar />
            </div>
            <div className="flex flex-1 overflow-hidden">
                {user && <Sidebar user={user} settings={settings} />}
                <main className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col">
                    {isReadOnly && (
                        <div className="bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-semibold flex items-center justify-center gap-2">
                            <span>License Issue: {licenseStatus?.message} (Code: {licenseStatus?.errorCode})</span>
                            <span className="opacity-80 font-normal">System is in Read-Only Mode. Please contact support.</span>
                        </div>
                    )}
                    <LicenseProvider isReadOnly={isReadOnly}>
                        <div className="flex-1 relative">
                            {children}
                        </div>
                    </LicenseProvider>
                </main>
            </div>
            <TrainingModal />
            <AutoUpdateListener />
        </div>
    );
}
