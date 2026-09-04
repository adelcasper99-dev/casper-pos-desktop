"use client";

import { useState, useEffect } from "react";
import { Check, Loader2, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { createCategory, updateCategory, getAllCategories, deleteCategory } from "@/actions/inventory";
import GlassModal from "../ui/GlassModal";
import ConfirmationModal from "../ui/ConfirmationModal";
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
    onAddSubCategory?: (parentId: string) => void;
}

export default function CategoryModal({
    isOpen,
    onClose,
    csrfToken,
    initialData,
    onSuccess,
    onAddSubCategory
}: CategoryModalProps) {
    const t = useTranslations('Inventory.categories');
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // Form State
    const [name, setName] = useState("");
    const [color, setColor] = useState(PRESET_COLORS[0]);
    const [isHidden, setIsHidden] = useState(false);
    const [parentId, setParentId] = useState<string | null>(null);
    const [allCategories, setAllCategories] = useState<any[]>([]);
    const [loadingQuickAdd, setLoadingQuickAdd] = useState(false);
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

    // Reset or Populate form on open/change
    useEffect(() => {
        if (isOpen) {
            const fetchCats = async () => {
                const res = await getAllCategories();
                if (res.success) setAllCategories(res.categories || []);
            };
            fetchCats();

            if (initialData) {
                setName(initialData.name);
                setColor(initialData.color || PRESET_COLORS[0]);
                setIsHidden((initialData as any).isHidden || false);
                setParentId((initialData as any).parentId || null);
            } else {
                setName("");
                setColor(PRESET_COLORS[0]);
                setIsHidden(false);
                setParentId(null);
            }
        }
    }, [isOpen, initialData]);

    async function handleSave() {
        if (!name.trim()) return;
        setLoading(true);

        const result = initialData
            ? await updateCategory({ id: initialData.id, name, color, isHidden, parentId, csrfToken } as any)
            : await createCategory({ name, color, parentId, csrfToken } as any);

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

    async function handleDelete() {
        setIsConfirmDeleteOpen(true);
    }

    async function confirmDeleteAction() {
        if (!initialData) return;
        setLoading(true);
        try {
            const result = await deleteCategory({ id: initialData.id, csrfToken });
            if (result && (result as any).success) {
                router.refresh();
                if (onSuccess) onSuccess(null);
                onClose();
            } else {
                alert((result as any)?.error || "Failed to delete category");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setIsConfirmDeleteOpen(false);
        }
    }

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData ? t('editCategory') : t('newCategory')}
            className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[92dvh] p-4"
        >
            <div className="space-y-3">
                <div>
                    <label className="text-[10px] text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('nameLabel')}</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="glass-input w-full h-8.5 text-xs font-black text-slate-900 dark:text-white"
                        placeholder={t('placeholder')}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave();
                        }}
                    />
                </div>

                <div>
                    <label className="text-[10px] text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('colorLabel')}</label>
                    <div className="grid grid-cols-5 gap-2">
                        {PRESET_COLORS.map((c) => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                className={clsx(
                                    "h-7 rounded-lg transition-all border-2 active:scale-90",
                                    color === c ? "border-slate-900 dark:border-white scale-105 shadow-md" : "border-transparent opacity-70 hover:opacity-100"
                                )}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('parentLabel') || "Parent Category"}</label>
                        <select
                            value={parentId || ""}
                            onChange={(e) => setParentId(e.target.value || null)}
                            className="glass-input w-full h-8.5 text-xs font-black text-slate-900 dark:text-white [&>option]:text-black"
                        >
                            <option value="">{t('none') || "None (Top Level)"}</option>
                            {allCategories.filter(c => c.id !== initialData?.id).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] text-slate-500 dark:text-muted-foreground uppercase font-black mb-1 block tracking-widest">{t('visibilityLabel') || "Visibility"}</label>
                        <button
                            type="button"
                            onClick={() => setIsHidden(!isHidden)}
                            className={clsx(
                                "flex items-center justify-center gap-1.5 px-3 h-8.5 w-full rounded-xl font-black text-xs transition-all border shadow-sm",
                                isHidden ? "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/50 text-rose-600 dark:text-rose-400" : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
                            )}
                        >
                            {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            {isHidden ? (t("hidden") || "Hidden") : (t("visible") || "Visible")}
                        </button>
                    </div>
                </div>

                {initialData && (
                    <div className="pt-3 border-t border-slate-100 dark:border-white/5 space-y-2">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-slate-500 dark:text-zinc-500 uppercase text-[10px] font-black tracking-widest flex items-center gap-1.5">
                                <Plus className="w-3 h-3" />
                                {t('subCategories') || "Sub-Categories"}
                            </label>
                            {loadingQuickAdd && <Loader2 className="w-3 h-3 text-cyan-500 animate-spin" />}
                        </div>
                        
                        <div className="space-y-2">
                             {/* Inline Quick Add */}
                             <div className="relative group">
                                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 bg-cyan-500/10 rounded-md">
                                    <Plus className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
                                </div>
                                <input
                                    placeholder={t("quickAddPlaceholder") || "QUICKADD + (Press Enter)"}
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                            const subName = (e.target as HTMLInputElement).value.trim();
                                            setLoadingQuickAdd(true);
                                            try {
                                                const res = await createCategory({ 
                                                    name: subName, 
                                                    parentId: initialData.id,
                                                    csrfToken 
                                                } as any);
                                                if (res && (res as any).success) {
                                                    (e.target as HTMLInputElement).value = '';
                                                    const updated = await getAllCategories();
                                                    if (updated.success) setAllCategories(updated.categories || []);
                                                }
                                            } catch (err) {
                                                console.error(err);
                                            } finally {
                                                setLoadingQuickAdd(false);
                                            }
                                        }
                                    }}
                                    className="glass-input w-full h-8 text-xs font-black pl-9 text-slate-900 dark:text-white"
                                />
                            </div>

                            {/* Subcategories pill list */}
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                                {allCategories.filter(c => c.parentId === initialData.id).map(sub => (
                                    <span key={sub.id} className="inline-flex items-center gap-1 text-[11px] font-bold bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2 py-0.5 rounded-lg">
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sub.color || '#06b6d4' }} />
                                        {sub.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex gap-2 items-center pt-2 border-t border-slate-100 dark:border-white/5">
                    {initialData?.id && (
                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="mr-auto text-rose-500 hover:text-white hover:bg-rose-500 gap-1.5 px-3 py-1.5 rounded-xl transition-all flex items-center text-xs font-black shadow-sm active:scale-95"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('delete') || "Delete"}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className={clsx("bg-slate-100 dark:bg-muted hover:bg-slate-200 dark:hover:bg-muted/80 text-slate-500 dark:text-muted-foreground font-black py-1.5 rounded-xl text-xs transition-all active:scale-95", !initialData?.id ? "flex-1" : "px-4")}
                    >
                        {t('cancel') || 'Cancel'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading || !name}
                        className={clsx("bg-cyan-500 hover:bg-cyan-400 text-black font-black py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-cyan-500/20 active:scale-95", !initialData?.id ? "flex-1" : "px-6")}
                    >
                        {loading ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        {t('saveCategory')}
                    </button>
                </div>
            </div>

            <ConfirmationModal
                isOpen={isConfirmDeleteOpen}
                onClose={() => setIsConfirmDeleteOpen(false)}
                onConfirm={confirmDeleteAction}
                title={t('delete') || "Delete Category"}
                message={t('confirmDelete') || "Are you sure you want to delete this category? Sub-categories will be moved to top-level."}
                confirmText={t('delete') || "Delete"}
                cancelText={t('cancel') || "Cancel"}
                loading={loading}
                variant="danger"
            />
        </GlassModal>
    );
}
