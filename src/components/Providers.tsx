"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, useEffect } from "react";
import { SyncWorker } from "@/lib/sync-worker";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { CSRFProvider } from "@/contexts/CSRFContext";

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

    // Initialize Background Sync & Mirroring
    useEffect(() => {
        SyncWorker.start(30000); // Check every 30s
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <CSRFProvider initialToken={initialToken}>
                <SettingsProvider>
                    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                        {children}
                    </ThemeProvider>
                </SettingsProvider>
            </CSRFProvider>
        </QueryClientProvider>
    );
}
