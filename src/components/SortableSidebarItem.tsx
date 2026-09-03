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
            className="touch-none flex justify-center"
        >
            <Link
                href={href.startsWith('/maintenance') || href.startsWith('/returns') ? `/${locale}${href}` : href}
                title={!isExpanded ? label : undefined}
                className={cn(
                    "relative flex items-center rounded-xl transition-all duration-200 group overflow-hidden",
                    isExpanded ? "w-full gap-3 px-3 py-2 h-10" : "w-10 h-10 justify-center p-0",
                    isActive
                        ? "bg-slate-900 text-white shadow-sm dark:bg-cyan-500 dark:text-black dark:shadow-[0_0_15px_rgba(6,182,212,0.35)]"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                )}
            >
                {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-pink-400 dark:hidden" />
                )}
                <Icon strokeWidth={1.5} className={cn("w-5 h-5 shrink-0 relative z-10 transition-transform duration-200 group-hover:scale-105")} />
                <span className={cn(
                    "text-xs font-bold transition-all duration-200 whitespace-nowrap relative z-10 tracking-tight",
                    isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 w-0 hidden"
                )}>
                    {label}
                </span>
            </Link>
        </div>
    );
}
