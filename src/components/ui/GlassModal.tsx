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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
                className={cn(
                    "glass-card w-full max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar p-6 relative shadow-2xl bg-card border border-border animate-in zoom-in-95 duration-300",
                    className
                )}
            >
                {/* Gloss Effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none opacity-30" />

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
