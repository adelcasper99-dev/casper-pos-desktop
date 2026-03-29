"use client";

import React from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface SortableSidebarItemProps {
    id: string;
    href: string;
    icon: LucideIcon;
    label: string;
    isActive: boolean;
    isExpanded: boolean;
    locale: string;
}

export function SortableSidebarItem({
    id,
    href,
    icon: Icon,
    label,
    isActive,
    isExpanded,
    locale
}: SortableSidebarItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 60 : undefined,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="touch-none"
        >
            <Link
                href={href.startsWith('/maintenance') || href.startsWith('/returns') ? `/${locale}${href}` : href}
                className={cn(
                    "relative flex items-center gap-4 p-3 rounded-lg transition-all duration-200 group overflow-hidden",
                    isActive
                        ? "bg-slate-900 text-white shadow-sm dark:bg-cyan-500 dark:text-black dark:shadow-[0_0_15px_rgba(6,182,212,0.4)] dark:scale-[1.02]"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-white"
                )}
            >
                {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-pink-400 dark:hidden" />
                )}
                <Icon strokeWidth={1.25} className={cn("w-6 h-6 shrink-0 relative z-10")} />
                <span className={cn(
                    "text-sm font-semibold transition-opacity duration-200 whitespace-nowrap relative z-10 tracking-wide",
                    isExpanded ? "opacity-100" : "opacity-0 w-0"
                )}>
                    {label}
                </span>
            </Link>
        </div>
    );
}
