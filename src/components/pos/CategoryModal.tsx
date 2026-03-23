"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import GlassModal from "@/components/ui/GlassModal";
import ConfirmationModal from "@/components/ui/ConfirmationModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCategory, updateCategory, getAllCategories, deleteCategory } from "@/actions/inventory";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n-mock";
import { ChevronRight, Eye, EyeOff, Plus, Loader2, Trash2 } from "lucide-react";
import clsx from "clsx";

interface CategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    category?: { id: string; name: string; color: string; isHidden?: boolean; parentId?: string | null } | null;
    csrfToken: string;
    onCategorySaved?: (category: any) => void;
    onAddSubCategory?: (parentId: string) => void;
}

const PRESET_COLORS = [
    "#06b6d4", "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#f97316", "#84cc16", "#14b8a6",
    "#6366f1", "#a855f7", "#d946ef", "#f43f5e", "#71717a",
    "#000000", "#ffffff", "#451a03", "#1e293b", "#115e59"
];

export default function CategoryModal({ isOpen, onClose, category, csrfToken, onCategorySaved, onAddSubCategory }: CategoryModalProps) {
    const t = useTranslations("Inventory.categories");
    const router = useRouter();
    const [name, setName] = useState("");
    const [color, setColor] = useState("#06b6d4");
    const [isHidden, setIsHidden] = useState(false);
    const [parentId, setParentId] = useState<string | null>(null);
    const [allCategories, setAllCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingQuickAdd, setLoadingQuickAdd] = useState(false);
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const fetchCats = async () => {
                const res = await getAllCategories();
                if (res.success) setAllCategories(res.categories || []);
            };
            fetchCats();
        }
    }, [isOpen]);

    useEffect(() => {
        if (category) {
            setName(category.name);
            setColor(category.color || "#06b6d4");
            setIsHidden(category.isHidden || false);
            setParentId(category.parentId || null);
        } else {
            setName("");
            setColor("#06b6d4");
            setIsHidden(false);
            setParentId(null);
        }
    }, [category, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (category?.id) {
                // Edit existing category
                const result = await updateCategory({ id: category.id, name, color, isHidden, parentId, csrfToken } as any);
                if (!result.success) {
                    toast.error(result.error || (t("categoryError") || "Failed to save category"));
                    return;
                }
                toast.success(t("categoryUpdated") || "Category updated successfully");
                onCategorySaved?.({ id: category.id, name, color, isHidden, parentId });
            } else {
                // Create new category
                const result = await createCategory({ name, color, parentId, csrfToken } as any);
                if (!result.success) {
                    toast.error(result.error || (t("categoryError") || "Failed to save category"));
                    return;
                }
                toast.success(t("categoryCreated") || "Category created successfully");
                if (result.category) {
                    onCategorySaved?.({ id: result.category.id, name, color, isHidden: false, parentId });
                }
            }
            router.refresh(); // 🔄 Force the server component to re-fetch categories
            onClose();
        } catch (error) {
            console.error(error);
            toast.error(t("categoryError") || "Failed to save category");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setIsConfirmDeleteOpen(true);
    };

    const confirmDeleteAction = async () => {
        if (!category) return;
        setLoading(true);
        try {
            const res = await deleteCategory({ id: category.id, csrfToken });
            if (res.success) {
                toast.success(t("categoryDeleted") || "Category deleted");
                onCategorySaved?.(null); // Pass null to indicate deletion
                onClose();
            } else {
                toast.error(res.error || "Failed to delete category");
            }
        } catch (err) {
            toast.error("Error deleting category");
        } finally {
            setLoading(false);
            setIsConfirmDeleteOpen(false);
        }
    };

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title={category ? (t("editCategory") || "Edit Category") : (t("addCategory") || "Add Category")}
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="category-name" className="text-zinc-400 uppercase text-xs font-black tracking-widest">
                        {t("categoryName") || "Category Name"}
                    </Label>
                    <Input
                        id="category-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("enterCategoryName") || "Enter category name..."}
                        className="glass-input bg-zinc-900/40 border-white/10 text-white h-12 text-lg focus:ring-cyan-500/50"
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-zinc-400 uppercase text-[10px] font-black tracking-widest">
                            {t("parentCategory") || "Parent Category"}
                        </Label>
                        <select
                            value={parentId || ""}
                            onChange={(e) => setParentId(e.target.value || null)}
                            className="w-full bg-zinc-900/40 border border-white/10 rounded-lg h-10 px-3 text-white text-sm focus:ring-cyan-500/50 outline-none"
                        >
                            <option value="">{t("none") || "None (Top Level)"}</option>
                            {allCategories.filter(c => c.id !== category?.id).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-zinc-400 uppercase text-[10px] font-black tracking-widest block">
                            {t("visibility") || "Visibility"}
                        </Label>
                        <button
                            type="button"
                            onClick={() => setIsHidden(!isHidden)}
                            className={clsx(
                                "flex items-center gap-2 px-4 h-10 rounded-lg font-bold text-sm transition-all border",
                                isHidden ? "bg-red-500/10 border-red-500/50 text-red-400" : "bg-green-500/10 border-green-500/50 text-green-400"
                            )}
                        >
                            {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            {isHidden ? (t("hidden") || "Hidden") : (t("visible") || "Visible")}
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    <Label className="text-zinc-400 uppercase text-xs font-black tracking-widest">
                        {t("categoryColor") || "Category Color"}
                    </Label>
                    <div className="grid grid-cols-5 gap-3">
                        {PRESET_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                className={`h-12 w-full rounded-xl border-2 transition-all ${color === c ? "border-white scale-110 shadow-lg shadow-white/20" : "border-transparent opacity-70 hover:opacity-100"
                                    }`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                </div>

                {category && (
                    <div className="pt-2 border-t border-white/5 mt-4 space-y-3">
                        <div className="flex justify-between items-center px-1">
                            <Label className="text-zinc-500 uppercase text-[10px] font-black tracking-widest">{t("subCategories") || "Sub-Categories"}</Label>
                            {loadingQuickAdd && <Loader2 className="w-3 h-3 text-cyan-500 animate-spin" />}
                        </div>
                        
                        <div className="space-y-2">
                             {/* Inline Quick Add */}
                             <div className="relative group">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 bg-cyan-500/10 rounded-md">
                                    <Plus className="w-5 h-5 text-cyan-400" />
                                </div>
                                <Input
                                    placeholder={t("quickAddPlaceholder") || "QUICKADD + (Press Enter)"}
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                            const subName = (e.target as HTMLInputElement).value.trim();
                                            setLoadingQuickAdd(true);
                                            try {
                                                const res = await createCategory({ 
                                                    name: subName, 
                                                    color: color, // Inherit current parent color
                                                    parentId: category.id, 
                                                    csrfToken 
                                                } as any);
                                                if (res.success && res.category) {
                                                    toast.success(`${subName} added`);
                                                    (e.target as HTMLInputElement).value = "";
                                                    // Update local state directly to avoid race conditions
                                                    setAllCategories(prev => [...prev, res.category].sort((a, b) => a.name.localeCompare(b.name)));
                                                    // Notify parent to update its localCategories state
                                                    if (onCategorySaved) onCategorySaved(res.category);
                                                    router.refresh();
                                                } else {
                                                    toast.error(res.error || "Failed to add sub-category");
                                                }
                                            } catch (err) {
                                                toast.error("Error adding sub-category");
                                            } finally {
                                                setLoadingQuickAdd(false);
                                            }
                                        }
                                    }}
                                    className="h-12 pl-12 bg-white/5 border-white/5 focus:border-cyan-500/30 text-sm text-white placeholder:text-zinc-600 rounded-lg transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto no-scrollbar pr-1">
                                {allCategories.filter(c => c.parentId === category.id).map(c => (
                                    <div 
                                        key={c.id} 
                                        className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-lg p-2 text-xs text-zinc-300 group hover:border-white/20 transition-all"
                                    >
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                                        <span className="truncate flex-1">{c.name}</span>
                                        {c.isHidden && <EyeOff className="w-3 h-3 text-zinc-600 shrink-0" />}
                                    </div>
                                ))}
                                {allCategories.filter(c => c.parentId === category.id).length === 0 && (
                                    <div className="col-span-2 py-3 text-center text-zinc-600 text-[10px] uppercase font-bold italic tracking-wider">
                                        {t("noSubCategories") || "No sub-categories yet"}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="pt-4 flex gap-3 items-center">
                    {category?.id && (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleDelete}
                            disabled={loading}
                            className="mr-auto text-red-500 hover:text-red-400 hover:bg-red-500/10 gap-2 uppercase font-black text-[10px]"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t("delete") || "Delete"}
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        className={clsx("text-zinc-400 hover:text-white hover:bg-white/5", !category?.id ? "flex-1" : "")}
                    >
                        {t("cancel") || "Cancel"}
                    </Button>
                    <Button
                        type="submit"
                        disabled={loading}
                        className={clsx("bg-cyan-600 hover:bg-cyan-500 text-white font-bold h-12 shadow-lg shadow-cyan-500/20", !category?.id ? "flex-[2]" : "px-8")}
                    >
                        {loading ? (t("saving") || "Saving...") : (t("save") || "Save")}
                    </Button>
                </div>
            </form>

            <ConfirmationModal
                isOpen={isConfirmDeleteOpen}
                onClose={() => setIsConfirmDeleteOpen(false)}
                onConfirm={confirmDeleteAction}
                title={t("delete") || "Delete Category"}
                message={t("confirmDelete") || "Are you sure you want to delete this category? Sub-categories will be moved to top-level."}
                confirmText={t("delete") || "Delete"}
                cancelText={t("cancel") || "Cancel"}
                loading={loading}
                variant="danger"
            />
        </GlassModal>
    );
}
