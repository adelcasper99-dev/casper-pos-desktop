"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ModeToggleProps {
    compact?: boolean;
    className?: string;
}

export function ModeToggle({ compact = false, className }: ModeToggleProps) {
    const { theme, setTheme } = useTheme()

    const toggleTheme = () => {
        setTheme(theme === "dark" ? "light" : "dark")
    }

    return (
        <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "Light Mode" : "Dark Mode"}
            className={cn(
                "flex items-center justify-center rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 shrink-0",
                compact ? "h-6 w-6 p-0" : "h-8 w-8 p-0",
                className
            )}
        >
            <div className="relative w-3.5 h-3.5">
                <Sun className="absolute h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </div>
        </button>
    )
}
