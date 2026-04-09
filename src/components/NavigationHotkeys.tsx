"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Sequential Back Navigation Component
 * Handles 'Backspace' and 'Escape' to close windows or go back globally.
 */
export default function NavigationHotkeys() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // 1. Identification: Backspace or Escape?
            const isBackspace = event.key === "Backspace";
            const isEscape = event.key === "Escape";

            if (!isBackspace && !isEscape) return;

            // 2. Safety Guard: Is the user currently typing?
            const activeElement = document.activeElement;
            const isTyping = 
                activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement instanceof HTMLSelectElement ||
                (activeElement as HTMLElement)?.isContentEditable ||
                activeElement?.getAttribute("role") === "textbox";

            // If user is typing, Backspace must behave normally
            if (isTyping && isBackspace) return;

            // Optional: If Escape is pressed in an input, we might still want to close the modal
            // But usually, it's safer to only navigate if nothing is focused or if it's Escape.

            // 3. Prevent default browser behavior if we are navigating
            // (e.g., prevent backspace from occasionally navigating the browser itself in older envs)
            
            // 4. Sequential Navigation Logic
            const didCloseOverlay = attemptToCloseTopOverlay();

            if (didCloseOverlay) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            // 5. Page History Fallback
            // Don't navigate back if we are already at the main dashboard
            if (pathname !== "/" && pathname !== "/dashboard") {
                event.preventDefault();
                router.back();
            }
        };

        window.addEventListener("keydown", handleKeyDown, true); // Use capture to trigger before other listeners
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [router, pathname]);

    return null;
}

/**
 * Strategy: Find the top-most visible overlay and trigger its close action.
 */
function attemptToCloseTopOverlay(): boolean {
    const overlays = Array.from(document.querySelectorAll('.fixed.inset-0, [role="dialog"]')) as HTMLElement[];
    
    if (overlays.length === 0) return false;

    // Sort by z-index to find the truly "top" window
    const topOverlay = overlays
        .filter(el => window.getComputedStyle(el).display !== 'none')
        .sort((a, b) => {
            const zA = parseInt(window.getComputedStyle(a).zIndex) || 0;
            const zB = parseInt(window.getComputedStyle(b).zIndex) || 0;
            return zB - zA;
        })[0];

    if (!topOverlay) return false;

    // Attempt to find a "Close" button inside the top overlay
    // Patterns: aria-label="Close", buttons with X icons, or buttons with "Close" text
    const closeButton = topOverlay.querySelector<HTMLButtonElement>(
        'button[aria-label*="Close"], button[aria-label*="إغلاق"], button:has(svg.lucide-x), button:has(svg.lucide-x-circle)'
    );

    if (closeButton) {
        closeButton.click();
        return true;
    }

    // Fallback: If no dedicated button found, try clicking the overlay backdrop if it has a listener
    // But clicking the center of the overlay is safer as a generic trigger for onClose props mapping to backdrops
    // However, many overlays stopPropagation, so a direct click on a button is preferred.
    
    return false;
}
