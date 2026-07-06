"use client";

import { useEffect, useState, useCallback } from "react";
import { CasperLogo } from "@/components/ui/CasperLogo";
import { Minus, Square, Copy, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { extractIpcData } from "@/lib/ipc-utils";
import SyncStatusBar from "@/components/SyncStatusBar";
import PrinterStatusBadge from "@/components/layout/PrinterStatusBadge";

/**
 * TitleBar – Custom frameless window chrome replacement.
 *
 * Renders a 36px draggable strip at the top of the app with:
 *  - App branding (left)
 *  - Zoom controls (center-right)
 *  - Minimize / Maximize-Restore / Close controls (right, always LTR)
 *
 * Falls back gracefully to a no-op when running outside Electron
 * (e.g. in a browser tab).
 */

export default function TitleBar() {
    const [mounted, setMounted] = useState(false);
    const [isMaximized, setIsMaximized] = useState(true);

    // ── After mount: detect Electron & subscribe to maximize events ──────
    useEffect(() => {
        setMounted(true);

        const controls = window.electronAPI?.windowControls;
        if (!controls) return;

        controls.isMaximized().then(res => {
            const val = extractIpcData(res, 'window:isMaximized');
            if (typeof val === 'boolean') setIsMaximized(val);
        }).catch((err) => { 
            console.warn('[TitleBar] Failed to get initial maximize state:', err); 
        });

        const unsub = controls.onMaximizeChange((val: boolean) => setIsMaximized(val));
        return unsub;
    }, []);

    const controls = mounted ? window.electronAPI?.windowControls : undefined;
    const isElectron = mounted && !!window.electronAPI?.isElectron;

    const handleMinimize = useCallback(() => controls?.minimize(), [controls]);
    const handleMaximize = useCallback(() => controls?.maximize(), [controls]);
    const handleClose = useCallback(() => controls?.close(), [controls]);

    const handleZoomIn = useCallback(() => controls?.zoomIn(), [controls]);

    const handleZoomOut = useCallback(() => controls?.zoomOut(), [controls]);

    const handleZoomReset = useCallback(() => controls?.zoomReset(), [controls]);


    // ── Always render a consistent placeholder until mounted ─────────────
    // This ensures SSR HTML === first client render (no hydration mismatch)
    if (!mounted || !isElectron) {
        return <div className="h-0 w-full shrink-0" aria-hidden />;
    }

    return (
        // Outer strip: draggable. dir="ltr" forces controls to the right even
        // in RTL (Arabic) layout — matching Windows native behaviour.
        <div
            className="drag-region flex items-center justify-between w-full shrink-0 select-none bg-white dark:bg-zinc-900/80 dark:backdrop-blur-md border-b border-slate-100 dark:border-white/5"
            style={{ height: 36, direction: "ltr", zIndex: 9999 }}
            aria-label="Title bar"
        >
            {/* ── Branding ─────────────────────────────────────────────── */}
            <div className="no-drag flex items-center gap-2 px-3 pointer-events-none">
                <CasperLogo width={28} height={28} />
                <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
                    Casper ERP
                </span>
            </div>

            {/* ── Sync Status & Printer Health (Center) ───────────────── */}
            <div className="flex-1 flex justify-center gap-3 no-drag" style={{ pointerEvents: "auto" }}>
                <SyncStatusBar />
                <PrinterStatusBadge />
            </div>

            {/* ── Controls Group ───────────────────────────────────────── */}
            <div className="flex h-full no-drag" style={{ pointerEvents: "auto" }}>
                {/* ── Zoom Controls ── */}
                <div className="no-drag flex items-center gap-0.5 px-3 border-r border-slate-100 dark:border-white/5 mr-1" style={{ pointerEvents: "auto", WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
                        className="no-drag p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-slate-400 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white"
                        style={{ pointerEvents: "auto", WebkitAppRegion: "no-drag" } as React.CSSProperties}
                        title="Zoom Out (−)"
                    >
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleZoomReset(); }}
                        className="no-drag p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-slate-400 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white"
                        style={{ pointerEvents: "auto", WebkitAppRegion: "no-drag" } as React.CSSProperties}
                        title="Reset Zoom"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
                        className="no-drag p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-slate-400 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white"
                        style={{ pointerEvents: "auto", WebkitAppRegion: "no-drag" } as React.CSSProperties}
                        title="Zoom In (+)"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* ── Window Window Controls ── */}
                <button
                    onClick={handleMinimize}
                    className="flex items-center justify-center w-12 h-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group"
                    title="Minimize"
                >
                    <Minus className="w-4 h-4 text-slate-400 dark:text-zinc-400 group-hover:text-slate-700 dark:group-hover:text-white" />
                </button>
                <button
                    onClick={handleMaximize}
                    className="flex items-center justify-center w-12 h-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group"
                    title={isMaximized ? "Restore" : "Maximize"}
                >
                    {isMaximized ? (
                        <Copy className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 group-hover:text-slate-700 dark:group-hover:text-white" />
                    ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 group-hover:text-slate-700 dark:group-hover:text-white" />
                    )}
                </button>
                <button
                    onClick={handleClose}
                    className="flex items-center justify-center w-12 h-full hover:bg-red-500 transition-colors group"
                    title="Close"
                >
                    <X className="w-4 h-4 text-slate-400 dark:text-zinc-400 group-hover:text-white" />
                </button>
            </div>
        </div>
    );
}

