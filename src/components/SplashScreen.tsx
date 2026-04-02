"use client";

import { useEffect, useState } from "react";

/**
 * SplashScreen – Shown while the app is initializing.
 * Fades out automatically after `duration` ms (default 1800ms).
 * Pass `onDone` to be notified when the animation completes.
 */
export default function SplashScreen({
    duration = 1800,
    onDone,
}: {
    duration?: number;
    onDone?: () => void;
}) {
    const [visible, setVisible] = useState(true);
    const [fading, setFading] = useState(false);

    useEffect(() => {
        const fadeTimer = setTimeout(() => setFading(true), duration - 400);
        const doneTimer = setTimeout(() => {
            setVisible(false);
            onDone?.();
        }, duration);

        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(doneTimer);
        };
    }, [duration, onDone]);

    if (!visible) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
            style={{
                transition: "opacity 0.4s ease",
                opacity: fading ? 0 : 1,
                pointerEvents: fading ? "none" : "all",
            }}
        >
            {/* ── Animated glow orb behind logo ─────────────────────── */}
            <div
                className="absolute w-80 h-80 rounded-full pointer-events-none"
                style={{
                    background: "radial-gradient(circle, rgba(59,105,120,0.12) 0%, rgba(34,34,34,0.05) 60%, transparent 80%)",
                    animation: "splash-pulse 2s ease-in-out infinite",
                }}
            />

            {/* ── Logo ──────────────────────────────────────────────── */}
            <div
                className="relative flex flex-col items-center gap-6"
                style={{ animation: "splash-rise 0.6s cubic-bezier(0.23,1,0.32,1) forwards" }}
            >
                {/* Icon — circular container */}
                <div
                    className="flex items-center justify-center rounded-full bg-background shadow-2xl"
                    style={{
                        width: 200,
                        height: 200,
                        border: "3px solid rgba(59,105,120,0.15)",
                        boxShadow: "0 0 48px rgba(59,105,120,0.18), 0 8px 32px rgba(0,0,0,0.08)",
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/assets/casper-light.png"
                        alt="Casper ERP"
                        style={{ width: "78%", height: "78%", objectFit: "contain" }}
                    />
                </div>

                {/* Wordmark */}
                <div className="flex flex-col items-center gap-1">
                    <span
                        className="text-4xl font-black tracking-widest text-foreground uppercase"
                        style={{ letterSpacing: "0.18em" }}
                    >
                        CASPER
                    </span>
                    <div className="w-full h-px bg-foreground/10" />
                    <span
                        className="text-sm font-semibold tracking-[0.4em] uppercase"
                        style={{ color: "rgba(34,34,34,0.45)" }}
                    >
                        ERP
                    </span>
                </div>
            </div>

            {/* ── Loading bar ───────────────────────────────────────── */}
            <div className="absolute bottom-16 w-48 h-0.5 bg-foreground/10 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full"
                    style={{
                        background: "linear-gradient(90deg, var(--primary), var(--sidebar-bg))",
                        animation: `splash-bar ${duration}ms ease-out forwards`,
                    }}
                />
            </div>

            {/* ── Keyframes (injected inline via style tag) ─────────── */}
            <style>{`
                @keyframes splash-pulse {
                    0%, 100% { transform: scale(1);   opacity: 1; }
                    50%       { transform: scale(1.08); opacity: 0.7; }
                }
                @keyframes splash-rise {
                    from { opacity: 0; transform: translateY(20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes splash-bar {
                    from { width: 0%; }
                    to   { width: 100%; }
                }
            `}</style>
        </div>
    );
}
