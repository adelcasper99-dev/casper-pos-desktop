"use client";

import { useState, useEffect, useCallback } from "react";
import { getCashCategories, getArchivedCashCategories, createCashCategory, updateCashCategory, deleteCashCategory, restoreCashCategory } from "@/actions/cash-category-actions";
import GlassModal from "@/components/ui/GlassModal";
import { toast } from "sonner";

interface Category {
    id: string;
    name: string;
    type: string;
    isSystem: boolean;
    isActive: boolean;
    glCode: string;
    createdAt: string;
    deletedAt?: string;
}

interface CategoryStats {
    id: string;
    count: number;
}

export default function CashCategoriesManager() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [archivedCategories, setArchivedCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
    
    // Modal states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
    
    // Form states
    const [formName, setFormName] = useState("");
    const [formType, setFormType] = useState<"IN" | "OUT">("OUT");
    const [formGlCode, setFormGlCode] = useState("3000");
    const [formSubmitting, setFormSubmitting] = useState(false);

    const fetchCategories = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await getCashCategories({});
            if (result?.categories) {
                setCategories(result.categories);
            }
        } catch (error) {
            toast.error("فشل في تحميل التصنيفات");
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchArchived = useCallback(async () => {
        try {
            const result = await getArchivedCashCategories();
            if (result?.categories) {
                setArchivedCategories(result.categories);
            }
        } catch (error) {
            console.error("Failed to fetch archived:", error);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    useEffect(() => {
        if (activeTab === "archived") {
            fetchArchived();
        }
    }, [activeTab, fetchArchived]);

    const handleCreate = async () => {
        if (!formName.trim()) {
            toast.error("يرجى إدخال اسم التصنيف");
            return;
        }

        setFormSubmitting(true);
        try {
            const result = await createCashCategory({
                name: formName.trim(),
                type: formType,
                glCode: formGlCode
            });

            if (result?.success) {
                toast.success("تم إنشاء التصنيف بنجاح");
                setIsCreateModalOpen(false);
                resetForm();
                fetchCategories();
            }
        } catch (error: any) {
            toast.error(error?.message || "فشل في إنشاء التصنيف");
        } finally {
            setFormSubmitting(false);
        }
    };

    const handleUpdate = async () => {
        if (!editingCategory || !formName.trim()) return;

        setFormSubmitting(true);
        try {
            const result = await updateCashCategory({
                id: editingCategory.id,
                name: formName.trim(),
                isActive: true,
                glCode: formGlCode
            });

            if (result?.success) {
                toast.success("تم تحديث التصنيف بنجاح");
                setIsEditModalOpen(false);
                setEditingCategory(null);
                resetForm();
                fetchCategories();
            }
        } catch (error: any) {
            toast.error(error?.message || "فشل في تحديث التصنيف");
        } finally {
            setFormSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingCategory) return;

        setFormSubmitting(true);
        try {
            const result = await deleteCashCategory(deletingCategory.id);

            if (result?.success) {
                toast.success(result?.message || "تم حذف التصنيف بنجاح");
                setIsDeleteModalOpen(false);
                setDeletingCategory(null);
                fetchCategories();
            }
        } catch (error: any) {
            toast.error(error?.message || "فشل في حذف التصنيف");
        } finally {
            setFormSubmitting(false);
        }
    };

    const handleRestore = async (id: string) => {
        try {
            const result = await restoreCashCategory(id);
            if (result?.success) {
                toast.success("تم استعادة التصنيف بنجاح");
                fetchArchived();
                fetchCategories();
            }
        } catch (error: any) {
            toast.error(error?.message || "فشل في استعادة التصنيف");
        }
    };

    const resetForm = () => {
        setFormName("");
        setFormType("OUT");
        setFormGlCode("3000");
    };

    const openEditModal = (cat: Category) => {
        setEditingCategory(cat);
        setFormName(cat.name);
        setFormType(cat.type as "IN" | "OUT");
        setFormGlCode(cat.glCode || "3000");
        setIsEditModalOpen(true);
    };

    const openDeleteModal = (cat: Category) => {
        setDeletingCategory(cat);
        setIsDeleteModalOpen(true);
    };

    const currentCategories = activeTab === "active" ? categories : archivedCategories;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-zinc-900 dark:text-white">
                        تصنيفات النقدية
                    </h2>
                    <p className="text-sm text-muted-foreground font-bold">
                        إدارة تصنفيات حركات الإيداع والسحب
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setActiveTab(activeTab === "active" ? "archived" : "active")}
                        className="px-4 py-2 rounded-xl font-black text-sm bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/[0.1] transition-colors"
                    >
                        {activeTab === "active" ? "🗑️ المؤرشفة" : "← العودة للنشطة"}
                    </button>
                    {activeTab === "active" && (
                        <button
                            onClick={() => { resetForm(); setIsCreateModalOpen(true); }}
                            className="px-4 py-2 rounded-xl font-black text-sm bg-primary text-white hover:bg-primary/90 transition-colors"
                        >
                            + إضافة تصنيف
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                <button
                    onClick={() => setActiveTab("active")}
                    className={`px-4 py-2 rounded-lg font-black text-sm transition-colors ${
                        activeTab === "active"
                            ? "bg-primary text-white"
                            : "bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/[0.1]"
                    }`}
                >
                    النشطة ({categories.length})
                </button>
                <button
                    onClick={() => setActiveTab("archived")}
                    className={`px-4 py-2 rounded-lg font-black text-sm transition-colors ${
                        activeTab === "archived"
                            ? "bg-primary text-white"
                            : "bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/[0.1]"
                    }`}
                >
                    المؤرشفة ({archivedCategories.length})
                </button>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="text-center py-12 text-muted-foreground font-bold">جاري التحميل...</div>
            ) : currentCategories.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground font-bold">
                    {activeTab === "active" ? "لا توجد تصنيفات نشطة" : "لا توجد تصنيفات مؤرشفة"}
                </div>
            ) : (
                <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-zinc-50 dark:bg-white/[0.05]">
                            <tr>
                                <th className="px-4 py-3 text-right font-black text-xs text-zinc-500 dark:text-zinc-400 uppercase">الاسم</th>
                                <th className="px-4 py-3 text-right font-black text-xs text-zinc-500 dark:text-zinc-400 uppercase">النوع</th>
                                <th className="px-4 py-3 text-right font-black text-xs text-zinc-500 dark:text-zinc-400 uppercase">كود الحساب</th>
                                <th className="px-4 py-3 text-right font-black text-xs text-zinc-500 dark:text-zinc-400 uppercase">الحالة</th>
                                <th className="px-4 py-3 text-right font-black text-xs text-zinc-500 dark:text-zinc-400 uppercase">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {currentCategories.map((cat) => (
                                <tr key={cat.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02]">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-sm text-zinc-900 dark:text-white">{cat.name}</span>
                                            {cat.isSystem && (
                                                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                    نظامي
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-lg text-xs font-black ${
                                            cat.type === "IN" 
                                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                        }`}>
                                            {cat.type === "IN" ? "إيداع ↑" : "سحب ↓"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="font-mono text-sm text-zinc-600 dark:text-zinc-400">{cat.glCode || "—"}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-lg text-xs font-black ${
                                            cat.isActive 
                                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                        }`}>
                                            {cat.isActive ? "نشط" : "غير نشط"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {activeTab === "active" ? (
                                            <div className="flex gap-2">
                                                {!cat.isSystem && (
                                                    <>
                                                        <button
                                                            onClick={() => openEditModal(cat)}
                                                            className="px-3 py-1 rounded-lg text-xs font-black bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                                                        >
                                                            تعديل
                                                        </button>
                                                        <button
                                                            onClick={() => openDeleteModal(cat)}
                                                            className="px-3 py-1 rounded-lg text-xs font-black bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                                                        >
                                                            حذف
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleRestore(cat.id)}
                                                className="px-3 py-1 rounded-lg text-xs font-black bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                                            >
                                                استعادة
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create Modal */}
            <GlassModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="إضافة تصنيف جديد">
                <div className="space-y-4 p-4">
                    <div>
                        <label className="block text-sm font-black text-zinc-700 dark:text-zinc-300 mb-1">اسم التصنيف</label>
                        <input
                            type="text"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold text-sm"
                            placeholder="مثال: مصاريف التشغيل"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-black text-zinc-700 dark:text-zinc-300 mb-1">النوع</label>
                        <select
                            value={formType}
                            onChange={(e) => setFormType(e.target.value as "IN" | "OUT")}
                            className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold text-sm"
                        >
                            <option value="IN">إيداع (داخل)</option>
                            <option value="OUT">سحب (خارج)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-black text-zinc-700 dark:text-zinc-300 mb-1">كود الحساب</label>
                        <input
                            type="text"
                            value={formGlCode}
                            onChange={(e) => setFormGlCode(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono text-sm"
                            placeholder="1000"
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={handleCreate}
                            disabled={formSubmitting}
                            className="flex-1 py-2 rounded-xl font-black text-sm bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                        >
                            {formSubmitting ? "جاري..." : "إنشاء"}
                        </button>
                        <button
                            onClick={() => setIsCreateModalOpen(false)}
                            className="flex-1 py-2 rounded-xl font-black text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        >
                            إلغاء
                        </button>
                    </div>
                </div>
            </GlassModal>

            {/* Edit Modal */}
            <GlassModal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditingCategory(null); }} title="تعديل التصنيف">
                <div className="space-y-4 p-4">
                    <div>
                        <label className="block text-sm font-black text-zinc-700 dark:text-zinc-300 mb-1">اسم التصنيف</label>
                        <input
                            type="text"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-black text-zinc-700 dark:text-zinc-300 mb-1">النوع</label>
                        <select
                            value={formType}
                            onChange={(e) => setFormType(e.target.value as "IN" | "OUT")}
                            disabled={editingCategory?.isSystem}
                            className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold text-sm disabled:opacity-50"
                        >
                            <option value="IN">إيداع (داخل)</option>
                            <option value="OUT">سحب (خارج)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-black text-zinc-700 dark:text-zinc-300 mb-1">كود الحساب</label>
                        <input
                            type="text"
                            value={formGlCode}
                            onChange={(e) => setFormGlCode(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono text-sm"
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={handleUpdate}
                            disabled={formSubmitting}
                            className="flex-1 py-2 rounded-xl font-black text-sm bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                        >
                            {formSubmitting ? "جاري..." : "حفظ"}
                        </button>
                        <button
                            onClick={() => { setIsEditModalOpen(false); setEditingCategory(null); }}
                            className="flex-1 py-2 rounded-xl font-black text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        >
                            إلغاء
                        </button>
                    </div>
                </div>
            </GlassModal>

            {/* Delete Modal */}
            <GlassModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="حذف التصنيف">
                <div className="p-4">
                    <p className="text-center text-zinc-600 dark:text-zinc-400 font-bold mb-4">
                        هل أنت متأكد من حذف تصنيف "<span className="text-zinc-900 dark:text-white">{deletingCategory?.name}</span>"؟
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={handleDelete}
                            disabled={formSubmitting}
                            className="flex-1 py-2 rounded-xl font-black text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                        >
                            {formSubmitting ? "جاري..." : "حذف"}
                        </button>
                        <button
                            onClick={() => setIsDeleteModalOpen(false)}
                            className="flex-1 py-2 rounded-xl font-black text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        >
                            إلغاء
                        </button>
                    </div>
                </div>
            </GlassModal>
        </div>
    );
}