"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, useEffect } from "react";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { CSRFProvider } from "@/contexts/CSRFContext";

export default function Providers({
    children,
    initialToken,
    initialSettings
}: {
    children: React.ReactNode,
    initialToken: string | null,
    initialSettings?: any
}) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000,
            },
        },
    }));



    return (
        <QueryClientProvider client={queryClient}>
            <CSRFProvider initialToken={initialToken}>
                <SettingsProvider initialSettings={initialSettings}>
                    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                        {children}
                    </ThemeProvider>
                </SettingsProvider>
            </CSRFProvider>
        </QueryClientProvider>
    );
}
