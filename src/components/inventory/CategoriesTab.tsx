"use client";

import { useState } from "react";
import { Plus, Edit2, Trash2, Palette } from "lucide-react";
import { deleteCategory } from "@/actions/inventory";
import CategoryModal from "./CategoryModal";
import { useTranslations } from "@/lib/i18n-mock";

export default function CategoriesTab({ categories, csrfToken }: { categories: any[], csrfToken?: string }) {
    const t = useTranslations('Inventory.categories');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<any>(null);

    async function handleDelete(id: string) {
        if (confirm(t('deleteConfirm'))) {
            await deleteCategory({ id, csrfToken });
        }
    }

    function startEdit(c: any) {
        setEditingCategory(c);
        setIsModalOpen(true);
    }

    function handleAddNew() {
        setEditingCategory(null);
        setIsModalOpen(true);
    }

    return (
        <div className="space-y-4 animate-fly-in">
            {/* Header / Add Button */}
            <div className="flex justify-between items-center bg-muted/50 p-4 rounded-xl border border-border">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Palette className="w-5 h-5 text-purple-400" />
                        {t('title')}
                    </h2>
                    <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
                </div>
                <button
                    onClick={handleAddNew}
                    className="bg-cyan-500 text-black font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-cyan-400"
                >
                    <Plus className="w-4 h-4" />
                    {t('newCategory')}
                </button>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {categories.map((c) => (
                    <div key={c.id} className="glass-card p-4 flex justify-between items-center group bg-card">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-lg shadow-lg flex items-center justify-center font-bold text-white text-xs border border-border"
                                style={{ backgroundColor: c.color || "#06b6d4" }}
                            >
                                {c.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <div className="font-bold text-foreground">{c.name}</div>
                                <div className="text-xs text-muted-foreground font-mono uppercase">{c.color}</div>
                            </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEdit(c)} className="p-2 hover:bg-muted rounded-lg text-cyan-500">
                                <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(c.id)} className="p-2 hover:bg-muted rounded-lg text-red-500">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Reusable Modal */}
            <CategoryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                csrfToken={csrfToken}
                initialData={editingCategory}
            />
        </div>
    );
}

