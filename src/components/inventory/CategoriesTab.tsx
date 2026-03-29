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
            <div className="flex justify-between items-center bg-slate-100 dark:bg-muted/50 p-6 rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                <div>
                    <h2 className="text-2xl font-black flex items-center gap-2 text-slate-900 dark:text-white">
                        <Palette className="w-6 h-6 text-purple-500" />
                        {t('title')}
                    </h2>
                    <p className="text-slate-500 dark:text-muted-foreground text-sm font-medium">{t('subtitle')}</p>
                </div>
                <button
                    onClick={handleAddNew}
                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-6 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    {t('newCategory')}
                </button>
            </div>

            {/* Hierarchical List */}
            <div className="space-y-4">
                {arrangedCategories.map((parent: any) => (
                    <div key={parent.id} className="glass-card overflow-hidden border border-slate-200 dark:border-white/5 rounded-2xl bg-white dark:bg-black/20 shadow-md">
                        {/* Parent Row */}
                        <div className="p-5 flex justify-between items-center group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-4">
                                {parent.children.length > 0 ? (
                                    <button 
                                        onClick={() => toggleExpand(parent.id)}
                                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-cyan-600 dark:text-cyan-500 transition-all"
                                    >
                                        {expandedIds.includes(parent.id) ? (
                                            <ChevronDown className="w-5 h-5" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5" />
                                        )}
                                    </button>
                                ) : (
                                    <div className="w-8" /> /* Spacer */
                                )}
                                <div
                                    className="w-12 h-12 rounded-xl shadow-lg flex items-center justify-center font-black text-white text-sm border-2 border-white/20 shrink-0"
                                    style={{ backgroundColor: parent.color || "#06b6d4" }}
                                >
                                    {expandedIds.includes(parent.id) ? <FolderOpen className="w-6 h-6" /> : <Folder className="w-6 h-6" />}
                                </div>
                                <div>
                                    <div className="font-black text-slate-900 dark:text-white text-xl">{parent.name}</div>
                                    <div className="text-[10px] font-black text-slate-400 dark:text-muted-foreground uppercase flex gap-3 items-center tracking-widest">
                                        <span>{parent.color}</span>
                                        <span className="w-1.5 h-1.5 bg-slate-200 dark:bg-muted-foreground/30 rounded-full" />
                                        <span>{parent.children.length} {t('subCategories') || "Sub-categories"}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleAddNewSub(parent.id)}
                                    className="p-2.5 hover:bg-purple-100 dark:hover:bg-purple-500/10 rounded-xl text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                                    title="Add Sub-category"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                                <button onClick={() => startEdit(parent)} className="p-2.5 hover:bg-cyan-100 dark:hover:bg-cyan-500/10 rounded-xl text-cyan-600 dark:text-cyan-500 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all">
                                    <Edit2 className="w-5 h-5" />
                                </button>
                                <button onClick={() => handleDelete(parent.id)} className="p-2.5 hover:bg-red-100 dark:hover:bg-red-500/10 rounded-xl text-red-600 dark:text-red-500 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all">
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Children List (Expanded) */}
                        {expandedIds.includes(parent.id) && parent.children.length > 0 && (
                            <div className="bg-slate-50 dark:bg-black/40 border-t border-slate-200 dark:border-white/5 py-3 pl-16 pr-6 space-y-2">
                                {parent.children.map((child: any) => (
                                    <div key={child.id} className="flex justify-between items-center group py-3 border-b border-slate-200 dark:border-white/[0.05] last:border-0 hover:bg-white dark:hover:bg-white/[0.05] transition-colors rounded-xl px-4">
                                        <div className="flex items-center gap-4">
                                            <div
                                                className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-white text-xs border border-white/20 shadow-sm shrink-0"
                                                style={{ backgroundColor: child.color || parent.color }}
                                            >
                                                {child.name.slice(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-black text-slate-800 dark:text-white text-base">{child.name}</div>
                                                <div className="text-[10px] font-black text-slate-400 dark:text-muted-foreground uppercase tracking-widest">{child.color}</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                            <button onClick={() => startEdit(child)} className="p-2 hover:bg-cyan-100 dark:hover:bg-cyan-500/10 rounded-lg text-cyan-600 dark:text-cyan-500">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(child.id)} className="p-2 hover:bg-red-100 dark:hover:bg-red-500/10 rounded-lg text-red-600 dark:text-red-500">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {arrangedCategories.length === 0 && (
                    <div className="text-center py-16 glass-card bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl">
                        <Palette className="w-16 h-16 text-slate-200 dark:text-muted-foreground/20 mx-auto mb-4" />
                        <p className="text-slate-400 dark:text-muted-foreground font-black text-lg">{t('noResults') || "No categories found"}</p>
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

