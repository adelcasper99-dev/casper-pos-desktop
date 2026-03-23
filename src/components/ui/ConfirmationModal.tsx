'use client';

import { ReactNode } from 'react';
import GlassModal from './GlassModal';
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
    children
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
        <GlassModal isOpen={isOpen} onClose={onClose} title={title} className="max-w-md">
            <div className="space-y-6">
                <div className={cn("flex items-center gap-4 p-4 rounded-xl border", currentVariant.bg)}>
                    <div className="shrink-0 p-2 bg-black/20 rounded-lg">
                        {currentVariant.icon}
                    </div>
                    <p className="text-zinc-200 text-sm leading-relaxed">
                        {message}
                    </p>
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
                        className="flex-1 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-all border border-white/10 disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className={cn(
                            "flex-1 py-3 rounded-lg font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg",
                            currentVariant.button
                        )}
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : confirmText}
                    </button>
                </div>
            </div>
        </GlassModal>
    );
}
