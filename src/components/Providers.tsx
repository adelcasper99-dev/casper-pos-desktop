"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, useEffect } from "react";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { CSRFProvider } from "@/contexts/CSRFContext";
import { LicenseProvider } from "@/components/providers/LicenseProvider";

export default function Providers({
    children,
    initialToken
}: {
    children: React.ReactNode,
    initialToken: string | null
}) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000,
            },
        },
    }));

    // Initialize Background Sync & Mirroring via dynamic import to prevent
    // Next.js from statically bundling Node.js dependencies (fs, prisma) into
    // the client chunk during SSR compilation.
    useEffect(() => {
        const initSync = async () => {
            const api = (window as any).electronAPI;
            if (api?.config?.getConfig) {
                try {
                    const config = await api.config.getConfig();
                    if (config?.nodeRole === 'SUB_NODE') {
                        console.log('[SyncWorker] Skipping background sync (Sub-Node)');
                        return;
                    }
                } catch (e) {
                    console.warn('Failed to read config for SyncWorker', e);
                }
            }
            
            import("@/lib/sync-worker").then(({ SyncWorker }) => {
                SyncWorker.start(30000); // Check every 30s
            });
        };
        
        initSync();
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <CSRFProvider initialToken={initialToken}>
                <LicenseProvider>
                    <SettingsProvider>
                        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                            {children}
                        </ThemeProvider>
                    </SettingsProvider>
                </LicenseProvider>
            </CSRFProvider>
        </QueryClientProvider>
    );
}
