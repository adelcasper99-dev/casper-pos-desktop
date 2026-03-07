"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import GlassModal from "@/components/ui/GlassModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCategory, updateCategory } from "@/actions/inventory";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n-mock";

interface CategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    category?: { id: string; name: string; color: string } | null;
    csrfToken: string;
    onCategorySaved?: (category: { id: string; name: string; color: string }) => void;
}

const PRESET_COLORS = [
    "#06b6d4", "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#f97316", "#84cc16", "#14b8a6",
    "#6366f1", "#a855f7", "#d946ef", "#f43f5e", "#71717a",
    "#000000", "#ffffff", "#451a03", "#1e293b", "#115e59"
];

export default function CategoryModal({ isOpen, onClose, category, csrfToken, onCategorySaved }: CategoryModalProps) {
    const t = useTranslations("POS");
    const router = useRouter();
    const [name, setName] = useState("");
    const [color, setColor] = useState("#06b6d4");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (category) {
            setName(category.name);
            setColor(category.color || "#06b6d4");
        } else {
            setName("");
            setColor("#06b6d4");
        }
    }, [category, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (category) {
                // Edit existing category
                const result = await updateCategory({ id: category.id, name, color, csrfToken } as any);
                if (!result.success) {
                    toast.error(result.error || (t("categoryError") || "Failed to save category"));
                    return;
                }
                toast.success(t("categoryUpdated") || "Category updated successfully");
                onCategorySaved?.({ id: category.id, name, color });
            } else {
                // Create new category
                const result = await createCategory({ name, color, csrfToken } as any);
                if (!result.success) {
                    toast.error(result.error || (t("categoryError") || "Failed to save category"));
                    return;
                }
                toast.success(t("categoryCreated") || "Category created successfully");
                if (result.category) {
                    onCategorySaved?.({ id: result.category.id, name, color });
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
                        className="bg-zinc-900/50 border-white/10 text-white h-12 text-lg focus:ring-cyan-500/50"
                        required
                    />
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
                    <div className="flex items-center gap-3 mt-4">
                        <Input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            className="h-12 w-20 p-1 bg-zinc-900/50 border-white/10"
                        />
                        <span className="text-zinc-500 font-mono text-sm uppercase">{color}</span>
                    </div>
                </div>

                <div className="pt-4 flex gap-3">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        className="flex-1 text-zinc-400 hover:text-white hover:bg-white/5"
                    >
                        {t("cancel") || "Cancel"}
                    </Button>
                    <Button
                        type="submit"
                        disabled={loading}
                        className="flex-[2] bg-cyan-600 hover:bg-cyan-500 text-white font-bold h-12 shadow-lg shadow-cyan-500/20"
                    >
                        {loading ? (t("saving") || "Saving...") : (t("save") || "Save")}
                    </Button>
                </div>
            </form>
        </GlassModal>
    );
}
