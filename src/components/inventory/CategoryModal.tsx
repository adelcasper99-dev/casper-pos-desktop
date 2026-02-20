"use client";

import { useState, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import { createCategory, updateCategory } from "@/actions/inventory";
import GlassModal from "../ui/GlassModal";
import clsx from "clsx";
import { useTranslations } from "@/lib/i18n-mock";
import { useRouter } from "next/navigation";

const PRESET_COLORS = [
    "#06b6d4", // Cyan (Default)
    "#ef4444", // Red
    "#f59e0b", // Amber
    "#10b981", // Emerald
    "#3b82f6", // Blue
    "#8b5cf6", // Violet
    "#ec4899", // Pink
    "#6366f1", // Indigo
    "#84cc16", // Lime
    "#71717a", // Zinc
];

interface CategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    csrfToken?: string;
    initialData?: { id: string, name: string, color?: string } | null;
    onSuccess?: (category: any) => void;
}

export default function CategoryModal({
    isOpen,
    onClose,
    csrfToken,
    initialData,
    onSuccess
}: CategoryModalProps) {
    const t = useTranslations('Inventory.categories');
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // Form State
    const [name, setName] = useState("");
    const [color, setColor] = useState(PRESET_COLORS[0]);

    // Reset or Populate form on open/change
    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name);
                setColor(initialData.color || PRESET_COLORS[0]);
            } else {
                setName("");
                setColor(PRESET_COLORS[0]);
            }
        }
    }, [isOpen, initialData]);

    async function handleSave() {
        if (!name.trim()) return;
        setLoading(true);

        const result = initialData
            ? await updateCategory(initialData.id, { name, color })
            : await createCategory({ name, color });

        setLoading(false);

        if (result && (result as any).success === false) {
            alert((result as any).error || 'Failed to save category');
            return;
        }

        // Refresh data
        router.refresh();

        if (onSuccess && result) {
            onSuccess(result);
        }

        onClose();
    }

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData ? t('editCategory') : t('newCategory')}
        >
            <div className="space-y-6">
                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-2 block">{t('nameLabel')}</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="glass-input w-full"
                        placeholder={t('placeholder')}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave();
                        }}
                    />
                </div>

                <div>
                    <label className="text-xs text-muted-foreground uppercase font-bold mb-2 block">{t('colorLabel')}</label>
                    <div className="grid grid-cols-5 gap-3">
                        {PRESET_COLORS.map((c) => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                className={clsx(
                                    "h-10 rounded-lg transition-all border-2",
                                    color === c ? "border-foreground scale-110 shadow-lg" : "border-transparent opacity-70 hover:opacity-100"
                                )}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 bg-muted hover:bg-muted/80 text-muted-foreground font-bold py-3 rounded-xl transition-colors"
                    >
                        {t('cancel') || 'Cancel'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading || !name}
                        className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]"
                    >
                        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Check className="w-5 h-5" />}
                        {t('saveCategory')}
                    </button>
                </div>
            </div>
        </GlassModal>
    );
}
