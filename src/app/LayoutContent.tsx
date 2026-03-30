"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import TitleBar from "@/components/TitleBar";
import SplashScreen from "@/components/SplashScreen";

const TrainingModal = dynamic(() => import("@/components/ui/TrainingModal"), { ssr: false });

export default function LayoutContent({
    children,
    user,
    settings
}: {
    children: React.ReactNode;
    user: any;
    settings: any;
}) {
    const pathname = usePathname();
    const isLoginPage = pathname === "/";

    // Show splash screen on Electron startup (client-side only, won't SSR)
    const [showSplash, setShowSplash] = useState(false);
    useEffect(() => {
        if (window.electronAPI?.isElectron) {
            setShowSplash(true);
        }
    }, []);

    if (isLoginPage) {
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
                <main className="flex-1 overflow-y-auto custom-scrollbar relative">
                    {children}
                </main>
            </div>
            <TrainingModal />
        </div>
    );
}
