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
                href={href.startsWith('/maintenance') ? `/${locale}${href}` : href}
                className={cn(
                    "relative flex items-center gap-4 p-4 rounded-xl transition-all duration-300 group overflow-hidden border border-border/50 shadow-md",
                    isActive
                        ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)] scale-[1.02] ring-1 ring-white/20"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-[1.02]"
                )}
            >
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none opacity-50" />
                <Icon className={cn("w-7 h-7 shrink-0 relative z-10", isActive && "text-black")} />
                <span className={cn(
                    "text-base font-bold transition-opacity duration-200 whitespace-nowrap relative z-10 uppercase tracking-wide",
                    isExpanded ? "opacity-100" : "opacity-0 w-0"
                )}>
                    {label}
                </span>
            </Link>
        </div>
    );
}
