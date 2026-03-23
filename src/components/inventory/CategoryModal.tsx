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

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-2 block">{t('parentLabel') || "Parent Category"}</label>
                        <select
                            value={parentId || ""}
                            onChange={(e) => setParentId(e.target.value || null)}
                            className="glass-input w-full"
                        >
                            <option value="">{t('none') || "None (Top Level)"}</option>
                            {allCategories.filter(c => c.id !== initialData?.id).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-2 block">{t('visibilityLabel') || "Visibility"}</label>
                        <button
                            type="button"
                            onClick={() => setIsHidden(!isHidden)}
                            className={clsx(
                                "flex items-center gap-2 px-4 h-10 w-full rounded-lg font-bold text-sm transition-all border",
                                isHidden ? "bg-red-500/10 border-red-500/50 text-red-400" : "bg-green-500/10 border-green-500/50 text-green-400"
                            )}
                        >
                            {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            {isHidden ? (t("hidden") || "Hidden") : (t("visible") || "Visible")}
                        </button>
                    </div>
                </div>

                {initialData && (
                    <div className="pt-2 border-t border-white/5 mt-4 space-y-3">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-zinc-500 uppercase text-[10px] font-black tracking-widest">{t('subCategories') || "Sub-Categories"}</label>
                            {loadingQuickAdd && <Loader2 className="w-3 h-3 text-cyan-500 animate-spin" />}
                        </div>
                        
                        <div className="space-y-2">
                             {/* Inline Quick Add */}
                             <div className="relative group">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 bg-cyan-500/10 rounded-md">
                                    <Plus className="w-5 h-5 text-cyan-400" />
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
                                                    color: color, // Inherit current parent color
                                                    parentId: initialData.id, 
                                                    csrfToken 
                                                } as any);
                                                if (res.success && res.category) {
                                                    // toast (using alert for simple admin UI as sonner might not be imported here)
                                                    (e.target as HTMLInputElement).value = "";
                                                    // Update local state directly to avoid race conditions
                                                    setAllCategories(prev => [...prev, res.category].sort((a, b) => a.name.localeCompare(b.name)));
                                                    // Notify parent if needed (onSuccess is the prop in Admin version)
                                                    if (onSuccess) onSuccess(res.category);
                                                    router.refresh();
                                                }
                                            } catch (err) {
                                                console.error(err);
                                            } finally {
                                                setLoadingQuickAdd(false);
                                            }
                                        }
                                    }}
                                    className="h-12 w-full pl-12 bg-white/5 border border-white/5 focus:border-cyan-500/30 text-sm text-white placeholder:text-zinc-600 rounded-lg transition-all outline-none shadow-inner"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto no-scrollbar pr-1">
                                {allCategories.filter(c => c.parentId === initialData.id).map(c => (
                                    <div 
                                        key={c.id} 
                                        className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-lg p-2 text-xs text-zinc-300 group hover:border-white/20 transition-all font-bold"
                                    >
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                                        <span className="truncate flex-1">{c.name}</span>
                                        {c.isHidden && <EyeOff className="w-3 h-3 text-zinc-600 shrink-0" />}
                                    </div>
                                ))}
                                {allCategories.filter(c => c.parentId === initialData.id).length === 0 && (
                                    <div className="col-span-2 py-3 text-center text-zinc-600 text-[10px] uppercase font-bold italic tracking-wider">
                                        {t("noSubCategories") || "No sub-categories yet"}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex gap-2 items-center">
                    {initialData?.id && (
                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="mr-auto text-red-500 hover:text-red-400 hover:bg-red-500/10 gap-2 px-4 py-3 rounded-xl transition-all flex items-center text-xs font-bold"
                        >
                            <Trash2 className="w-4 h-4" />
                            {t('delete') || "Delete"}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className={clsx("bg-muted hover:bg-muted/80 text-muted-foreground font-bold py-3 rounded-xl transition-colors", !initialData?.id ? "flex-1" : "px-6")}
                    >
                        {t('cancel') || 'Cancel'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading || !name}
                        className={clsx("bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]", !initialData?.id ? "flex-1" : "px-10")}
                    >
                        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Check className="w-5 h-5" />}
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
