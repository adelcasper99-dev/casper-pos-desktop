"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, useEffect } from "react";
import { SyncWorker } from "@/lib/sync-worker";
import { SettingsProvider } from "@/contexts/SettingsContext";

export default function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000,
            },
        },
    }));

    // Initialize Background Sync & Mirroring
    useEffect(() => {
        SyncWorker.start(30000); // Check every 30s
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <SettingsProvider>
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                    {children}
                </ThemeProvider>
            </SettingsProvider>
        </QueryClientProvider>
    );
}
