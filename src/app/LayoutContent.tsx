"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import TitleBar from "@/components/TitleBar";
import SplashScreen from "@/components/SplashScreen";
import AutoUpdateListener from "@/components/layout/AutoUpdateListener";
import { LicenseProvider } from "@/contexts/LicenseContext";
import { CloudConfigManager } from "@/utils/cloudConfigManager";

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
    const isStandalonePage = pathname === "/" || pathname === "/login" || pathname === "/setup" || pathname === "/network-setup" || pathname === "/onboarding" || pathname === "/activate";

    // Show splash screen on Electron startup (client-side only, won't SSR)
    const [showSplash, setShowSplash] = useState(false);
    useEffect(() => {
        if (window.electronAPI?.isElectron) {
            setShowSplash(true);
        }
    }, []);

    // 🩹 Self-Healing: Re-derive cloud settings from license JWT if they are missing
    useEffect(() => {
        if (typeof window !== 'undefined' && settings?.licenseJwt) {
            CloudConfigManager.getCloudConfig().then((config) => {
                if (config.enabled && (!config.branchId || !config.syncSecret)) {
                    try {
                        const parts = settings.licenseJwt.split('.');
                        if (parts.length === 3) {
                            const payloadB64 = parts[1];
                            const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
                            const jsonPayload = decodeURIComponent(
                                window.atob(base64)
                                    .split('')
                                    .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                                    .join('')
                            );
                            const payload = JSON.parse(jsonPayload);
                            
                            if (payload.branch_id && payload.sync_secret) {
                                CloudConfigManager.saveCloudConfig({
                                    enabled: true,
                                    cloudUrl: config.cloudUrl || process.env.NEXT_PUBLIC_CLOUD_URL || 'https://api.casper-erp.com',
                                    branchId: payload.branch_id,
                                    syncSecret: payload.sync_secret
                                }).then((res) => {
                                    if (res.success) {
                                        console.log('[Self-Healing] Successfully restored cloud config from license JWT.');
                                    } else {
                                        console.warn('[Self-Healing] Failed to restore cloud config:', res.error);
                                    }
                                });
                            }
                        }
                    } catch (e) {
                        console.error('[Self-Healing] Error parsing license JWT:', e);
                    }
                }
            });
        }
    }, [settings]);

    const router = useRouter();
    useEffect(() => {
        // Allow cloud URL config pages through — user may need them to complete activation
        const activationAllowlist = ['/activate', '/login', '/setup', '/network-setup', '/onboarding'];
        if (licenseStatus?.status === 'MISSING' && !activationAllowlist.includes(pathname)) {
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
                <div className="flex-1 overflow-y-auto">
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
