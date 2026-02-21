"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import TitleBar from "@/components/TitleBar";
import SplashScreen from "@/components/SplashScreen";

export default function LayoutContent({
    children,
    user
}: {
    children: React.ReactNode;
    user: any;
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
                <TitleBar />
                <div className="flex-1 overflow-hidden">
                    {children}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
            {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
            <TitleBar />
            <div className="flex flex-1 overflow-hidden">
                {user && <Sidebar user={user} />}
                <main className="flex-1 overflow-y-auto custom-scrollbar relative">
                    {children}
                </main>
            </div>
        </div>
    );
}
