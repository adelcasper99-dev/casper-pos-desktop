"use client";
import { X } from "lucide-react";
import { ReactNode, useEffect } from 'react';

import { cn } from "@/lib/utils";

interface GlassModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string | ReactNode; // Allow ReactNode for title (TransferConsole passes null but might want flexibility)
    children: ReactNode;
    className?: string;
}

export default function GlassModal({ isOpen, onClose, title, children, className }: GlassModalProps) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className={cn(
                    "w-full max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar p-6 relative animate-in zoom-in-95 duration-300 bg-white dark:bg-zinc-900/95 dark:backdrop-blur-2xl rounded-2xl shadow-[0_20px_60px_rgb(0,0,0,0.12)] dark:shadow-[0_25px_80px_rgba(0,0,0,0.6)] border border-slate-100 dark:border-white/10",
                    className
                )}
                onClick={(e) => e.stopPropagation()}
            >

                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-foreground tracking-tight">{title}</h2>
                        <button
                            onClick={onClose}
                            className="p-3 hover:bg-muted rounded-full transition-all duration-200 text-muted-foreground hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px] min-w-[44px]"
                            aria-label="Close modal"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {children}
                </div>
            </div>
        </div>
    );
}
