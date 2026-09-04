"use client";
import { X } from "lucide-react";
import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from "@/lib/utils";

interface GlassModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string | ReactNode; // Allow ReactNode for title (TransferConsole passes null but might want flexibility)
    children: ReactNode;
    className?: string;
}

export default function GlassModal({ isOpen, onClose, title, children, className }: GlassModalProps) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

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

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className={cn(
                    "w-full max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[92dvh] overflow-y-auto custom-scrollbar p-4 sm:p-5 relative animate-in zoom-in-95 duration-300 bg-background dark:bg-zinc-900/95 dark:backdrop-blur-2xl rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.1)] dark:shadow-[0_25px_80px_rgba(0,0,0,0.6)] border border-border dark:border-white/10",
                    className
                )}
                onClick={(e) => e.stopPropagation()}
            >

                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-3 sm:mb-4">
                        <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">{title}</h2>
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-muted rounded-full transition-all duration-200 text-muted-foreground hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                            aria-label="Close modal"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}
