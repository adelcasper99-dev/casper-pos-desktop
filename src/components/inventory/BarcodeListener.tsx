"use client";

import { useEffect, useRef } from "react";

interface BarcodeListenerProps {
    onScan: (barcode: string) => void;
    onError?: (error: string) => void;
    disabled?: boolean;
}

/**
 * Global Barcode Listener
 * Detects rapid keyboard input typical of HID scanners.
 * 
 * Rules:
 * - Scanners send characters very fast (<50ms per char typically)
 * - End with 'Enter'
 */
export default function BarcodeListener({ onScan, disabled = false }: BarcodeListenerProps) {
    const buffer = useRef<string>("");
    const lastKeyTime = useRef<number>(0);
    const THRESHOLD = 50; // ms between keys

    useEffect(() => {
        if (disabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const now = Date.now();
            const char = e.key;

            // Ignore modifiers
            if (e.ctrlKey || e.altKey || e.metaKey) return;

            // If Enter, check buffer
            if (char === "Enter") {
                if (buffer.current.length > 2) { // Allow short codes, but >2 prevents accidental enters
                    const code = buffer.current;
                    // Reset buffer immediately to prevent duplicate processing
                    buffer.current = "";
                     // Dispatch
                    onScan(code);
                    
                    // Prevent default form submission if it was focused on a button etc
                    // But allow if it was focused on a textarea? 
                    // Usually we want to stop default Enter behavior if it WAS a scan.
                    // But if buffer was empty (manual enter), we let it pass.
                    
                    // We only stop propagation if we successfully detected a scan sequence
                     // But we can't easily prevent default here if we want to support mixed use.
                    // For now, we just fire onScan.
                } else {
                    buffer.current = "";
                }
                return;
            }

            // If time gap is large, reset (Human typing)
            if (now - lastKeyTime.current > THRESHOLD) {
                // If the user was typing slowly, we clear the buffer.
                // UNLESS the buffer was empty, then we start a new one.
                buffer.current = "";
            }

            // Printable characters only (approximate)
            if (char.length === 1) {
                buffer.current += char;
                lastKeyTime.current = now;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onScan, disabled]);

    return null; // Invisible component
}
