'use client';

import { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    loading?: boolean;
    variant?: 'danger' | 'warning' | 'info';
    children?: ReactNode;
    className?: string;
}

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'تأكيد',
    cancelText = 'إلغاء',
    loading = false,
    variant = 'danger',
    children,
    className
}: ConfirmationModalProps) {
    const variantStyles = {
        danger: {
            icon: <AlertTriangle className="w-8 h-8 text-rose-500" />,
            button: "bg-rose-600 hover:bg-rose-500 shadow-rose-900/20 text-white",
            bg: "bg-rose-500/10 border-rose-500/20"
        },
        warning: {
            icon: <AlertTriangle className="w-8 h-8 text-amber-500" />,
            button: "bg-amber-600 hover:bg-amber-500 shadow-amber-900/20 text-white",
            bg: "bg-amber-500/10 border-amber-500/20"
        },
        info: {
            icon: <AlertTriangle className="w-8 h-8 text-cyan-500" />,
            button: "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/20 text-white",
            bg: "bg-cyan-500/10 border-cyan-500/20"
        }
    };

    const currentVariant = variantStyles[variant];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={cn("max-w-md p-0 overflow-hidden border-border bg-background shadow-2xl animate-in zoom-in-95 duration-200 z-[200]", className)} dir="rtl">
                <DialogHeader className="p-6 border-b border-border bg-muted/30">
                    <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                        <span className="p-2 bg-background rounded-lg border border-border shadow-sm">
                           {currentVariant.icon}
                        </span>
                        {title}
                    </DialogTitle>
                </DialogHeader>

                <div className="p-6 space-y-6">
                    <div className={cn("flex items-center gap-4 p-4 rounded-xl border transition-all", currentVariant.bg)}>
                        <DialogDescription className="text-foreground text-sm leading-relaxed font-bold m-0">
                            {message}
                        </DialogDescription>
                    </div>

                    {children && (
                        <div className="px-1">
                            {children}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 py-3 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground transition-all border border-border disabled:opacity-50 font-bold text-sm"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={loading}
                            className={cn(
                                "flex-1 py-3 rounded-xl font-black transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg",
                                currentVariant.button
                            )}
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : confirmText}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
