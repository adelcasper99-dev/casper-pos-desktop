"use client";

import { useState, useMemo } from "react";
import { Plus, Edit2, Trash2, Palette, ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { deleteCategory } from "@/actions/inventory";
import CategoryModal from "./CategoryModal";
import ConfirmationModal from "../ui/ConfirmationModal";
import { useTranslations } from "@/lib/i18n-mock";

export default function CategoriesTab({ categories, csrfToken }: { categories: any[], csrfToken?: string }) {
    const t = useTranslations('Inventory.categories');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<any>(null);
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [expandedIds, setExpandedIds] = useState<string[]>([]);

    const arrangedCategories = useMemo(() => {
        const parents = categories.filter(c => !c.parentId);
        return parents.map(p => ({
            ...p,
            children: categories.filter(c => c.parentId === p.id).sort((a, b) => a.name.localeCompare(b.name))
        })).sort((a, b) => a.name.localeCompare(b.name));
    }, [categories]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    async function handleDelete(id: string) {
        setDeletingId(id);
        setIsConfirmDeleteOpen(true);
    }

    async function confirmDeleteAction() {
        if (!deletingId) return;
        setDeleting(true);
        try {
            await deleteCategory({ id: deletingId, csrfToken });
        } catch (err) {
            console.error(err);
        } finally {
            setDeleting(false);
            setIsConfirmDeleteOpen(false);
            setDeletingId(null);
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

    function handleAddNewSub(parentId: string) {
        setEditingCategory({ id: "", name: "", color: "#06b6d4", parentId } as any);
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

            {/* Hierarchical List */}
            <div className="space-y-3">
                {arrangedCategories.map((parent: any) => (
                    <div key={parent.id} className="glass-card overflow-hidden border border-white/5 rounde-xl">
                        {/* Parent Row */}
                        <div className="p-4 flex justify-between items-center group hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-3">
                                {parent.children.length > 0 ? (
                                    <button 
                                        onClick={() => toggleExpand(parent.id)}
                                        className="p-1 hover:bg-white/10 rounded text-cyan-500 transition-transform"
                                    >
                                        {expandedIds.includes(parent.id) ? (
                                            <ChevronDown className="w-5 h-5" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5" />
                                        )}
                                    </button>
                                ) : (
                                    <div className="w-7" /> /* Spacer */
                                )}
                                <div
                                    className="w-10 h-10 rounded-lg shadow-lg flex items-center justify-center font-bold text-white text-xs border border-border shrink-0"
                                    style={{ backgroundColor: parent.color || "#06b6d4" }}
                                >
                                    {expandedIds.includes(parent.id) ? <FolderOpen className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
                                </div>
                                <div>
                                    <div className="font-bold text-foreground text-lg">{parent.name}</div>
                                    <div className="text-[10px] text-muted-foreground uppercase flex gap-2 items-center">
                                        <span>{parent.color}</span>
                                        <span className="w-1 h-1 bg-muted-foreground/30 rounded-full" />
                                        <span>{parent.children.length} {t('subCategories') || "Sub-categories"}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleAddNewSub(parent.id)}
                                    className="p-2 hover:bg-muted rounded-lg text-purple-400 opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                                    title="Add Sub-category"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                                <button onClick={() => startEdit(parent)} className="p-2 hover:bg-muted rounded-lg text-cyan-500">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDelete(parent.id)} className="p-2 hover:bg-muted rounded-lg text-red-500">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Children List (Expanded) */}
                        {expandedIds.includes(parent.id) && parent.children.length > 0 && (
                            <div className="bg-black/20 border-t border-white/5 py-2 pl-14 pr-4 space-y-2">
                                {parent.children.map((child: any) => (
                                    <div key={child.id} className="flex justify-between items-center group py-2 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02] transition-colors rounded-lg px-2">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-white text-[10px] border border-border/50 shrink-0"
                                                style={{ backgroundColor: child.color || parent.color }}
                                            >
                                                {child.name.slice(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-medium text-foreground text-sm">{child.name}</div>
                                                <div className="text-[10px] text-muted-foreground uppercase">{child.color}</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => startEdit(child)} className="p-1.5 hover:bg-muted rounded text-cyan-500">
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => handleDelete(child.id)} className="p-1.5 hover:bg-muted rounded text-red-500">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {arrangedCategories.length === 0 && (
                    <div className="text-center py-12 glass-card">
                        <Palette className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                        <p className="text-muted-foreground">{t('noResults') || "No categories found"}</p>
                    </div>
                )}
            </div>

            {/* Reusable Modal */}
            <CategoryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                csrfToken={csrfToken}
                initialData={editingCategory}
                onAddSubCategory={(parentId) => {
                    setEditingCategory({ id: "", name: "", color: "#06b6d4", parentId } as any);
                }}
            />

            <ConfirmationModal
                isOpen={isConfirmDeleteOpen}
                onClose={() => setIsConfirmDeleteOpen(false)}
                onConfirm={confirmDeleteAction}
                title={t('delete') || "Delete Category"}
                message={t('confirmDelete') || "Are you sure you want to delete this category? Sub-categories will be moved to top-level."}
                confirmText={t('delete') || "Delete"}
                cancelText={t('cancel') || "Cancel"}
                loading={deleting}
                variant="danger"
            />
        </div>
    );
}

