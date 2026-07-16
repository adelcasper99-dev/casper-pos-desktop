"use client";

import { useState } from "react";
import { Plus, Building2, MapPin, Edit2, Trash2, Loader2, Phone } from "lucide-react";
import GlassModal from "../ui/GlassModal";
import { createBranch, updateBranch, deleteBranch } from "@/actions/branch-actions";
import clsx from "clsx";
import { toast } from "sonner";
import { Branch } from "@prisma/client";

interface BranchWithCounts extends Branch {
    _count?: {
        warehouses: number;
        users: number;
    };
}

export default function BranchManager({ branches, csrfToken }: { branches: BranchWithCounts[], csrfToken?: string }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form State
    const [editingBranch, setEditingBranch] = useState<BranchWithCounts | null>(null);
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [type, setType] = useState("STORE");
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");
    const [region, setRegion] = useState("");
    const [territoryCode, setTerritoryCode] = useState("");

    // Delete State
    const [isDeleting, setIsDeleting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const openCreateModal = () => {
        setEditingBranch(null);
        setName("");
        setCode("");
        setType("STORE");
        setAddress("");
        setPhone("");
        setRegion("");
        setTerritoryCode("");
        setIsModalOpen(true);
    };

    const openEditModal = (branch: BranchWithCounts) => {
        setEditingBranch(branch);
        setName(branch.name);
        setCode(branch.code);
        setType(branch.type);
        setAddress(branch.address || "");
        setPhone(branch.phone || "");
        setRegion(branch.region || "");
        setTerritoryCode(branch.territoryCode || "");
        setIsModalOpen(true);
    };

    const generateCode = (branchName: string) => {
        if (!editingBranch && branchName.trim() !== "") {
            const newCode = branchName.trim()
                .split(/\s+/)
                .map(word => word.charAt(0))
                .join('')
                .toUpperCase() + "-" + Math.floor(100 + Math.random() * 900);
            setCode(newCode);
        }
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newName = e.target.value;
        setName(newName);
        if (!editingBranch && code === "") {
             generateCode(newName);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const res = editingBranch
            ? await updateBranch({ id: editingBranch.id, name, code, type, address, phone, region, territoryCode, csrfToken })
            : await createBranch({ name, code, type, address, phone, region, territoryCode, csrfToken });

        setLoading(false);

        if (res.success) {
            setIsModalOpen(false);
            toast.success(editingBranch ? "تم تحديث الفرع بنجاح" : "تم إضافة الفرع بنجاح");
            setEditingBranch(null);
        } else {
            toast.error(res.error || "حدث خطأ غير متوقع");
        }
    };

    const handleDelete = async (id: string, counts: any) => {
        if (counts?.users > 0 || counts?.warehouses > 0) {
            toast.error("لا يمكن حذف فرع يحتوي على مستخدمين أو مستودعات نشطة.");
            return;
        }

        if (!window.confirm("هل أنت متأكد من حذف هذا الفرع؟")) return;

        setIsDeleting(true);
        setDeletingId(id);
        const res = await deleteBranch({ id, csrfToken });
        setIsDeleting(false);
        setDeletingId(null);

        if (!res.success) {
            toast.error(res.error || "فشل حذف الفرع");
        } else {
             toast.success("تم حذف الفرع بنجاح");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-100 dark:bg-muted/50 p-6 rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                <div className="flex items-center gap-3 text-slate-500 dark:text-muted-foreground">
                    <Building2 className="w-6 h-6 text-indigo-500" />
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-wider text-slate-900 dark:text-foreground">إدارة الفروع</h3>
                        <p className="text-sm text-slate-500 dark:text-muted-foreground font-medium">أضف وعدل الفروع الخاصة بك</p>
                    </div>
                </div>

                <button
                    onClick={openCreateModal}
                    className="text-sm font-black bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    إضافة فرع
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {branches.map((b) => (
                    <div key={b.id} className="glass-card p-6 group hover:border-indigo-500/40 transition-all flex flex-col justify-between h-auto min-h-[14rem] bg-white dark:bg-black/20 border-slate-200 dark:border-white/5 shadow-md relative rounded-2xl">
                        <div>
                            <div className="flex justify-between items-start mb-3">
                                <div className={clsx(
                                    "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full border",
                                    b.type === 'CENTER' ? "bg-purple-500/10 text-purple-600 border-purple-500/20" : 
                                    b.type === 'RETAIL' ? "bg-blue-500/10 text-blue-600 border-blue-500/20" : 
                                    "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                )}>
                                    {b.type}
                                </div>
                                <div className="flex gap-2 items-center opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all">
                                    <button
                                        onClick={() => openEditModal(b)}
                                        className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                        title="تعديل الفرع"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(b.id, b._count)}
                                        disabled={isDeleting && deletingId === b.id}
                                        className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-red-600 transition-colors"
                                        title="حذف الفرع"
                                    >
                                        {isDeleting && deletingId === b.id ? (
                                            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent animate-spin rounded-full" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <h4 className="font-black text-xl text-slate-900 dark:text-white mb-1 truncate tracking-tight">{b.name}</h4>
                            <p className="text-[10px] text-slate-400 dark:text-zinc-400 font-mono mb-4 uppercase tracking-widest">
                                {b.code}
                            </p>

                            <div className="space-y-2 mt-2">
                                {b.address && (
                                    <p className="text-sm text-slate-500 dark:text-muted-foreground flex items-center gap-2 font-medium">
                                        <MapPin className="w-4 h-4 text-slate-400 dark:text-zinc-500 shrink-0" />
                                        <span className="truncate">{b.address}</span>
                                    </p>
                                )}
                                {b.phone && (
                                    <p className="text-sm text-slate-500 dark:text-muted-foreground flex items-center gap-2 font-medium">
                                        <Phone className="w-4 h-4 text-slate-400 dark:text-zinc-500 shrink-0" />
                                        <span>{b.phone}</span>
                                    </p>
                                )}
                                {(b.region || b.territoryCode) && (
                                    <div className="flex gap-2">
                                        {b.region && <span className="text-xs bg-slate-100 dark:bg-white/5 px-2 py-1 rounded text-slate-500 font-black">المنطقة: {b.region}</span>}
                                        {b.territoryCode && <span className="text-xs bg-slate-100 dark:bg-white/5 px-2 py-1 rounded text-slate-500 font-mono font-black">إقليم: {b.territoryCode}</span>}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 flex gap-4 text-xs font-black text-slate-500 dark:text-zinc-400">
                             <div className="flex flex-col">
                                 <span className="text-[10px] uppercase tracking-widest opacity-70">المستودعات</span>
                                 <span className="text-indigo-600 dark:text-indigo-400 text-sm">{b._count?.warehouses || 0}</span>
                             </div>
                             <div className="flex flex-col border-r pr-4 border-slate-200 dark:border-white/10">
                                 <span className="text-[10px] uppercase tracking-widest opacity-70">المستخدمين</span>
                                 <span className="text-emerald-600 dark:text-emerald-400 text-sm">{b._count?.users || 0}</span>
                             </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* CREATE / EDIT MODAL */}
            <GlassModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingBranch ? "تعديل الفرع" : "إضافة فرع جديد"}
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">اسم الفرع *</label>
                            <input
                                className="glass-input w-full font-black text-slate-900 dark:text-white"
                                placeholder="مثال: الفرع الرئيسي"
                                value={name}
                                onChange={handleNameChange}
                                onBlur={() => generateCode(name)}
                                required
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">كود الفرع *</label>
                            <input
                                className="glass-input w-full font-black font-mono text-slate-900 dark:text-white"
                                placeholder="MB-001"
                                value={code}
                                onChange={e => setCode(e.target.value.toUpperCase())}
                                required
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">نوع الفرع *</label>
                        <select
                            className="glass-input w-full font-black text-slate-900 dark:text-white bg-white dark:bg-black/20"
                            value={type}
                            onChange={e => setType(e.target.value)}
                            required
                        >
                            <option value="STORE">معرض (Store)</option>
                            <option value="CENTER">مركز صيانة وإدارة (Center)</option>
                            <option value="RETAIL">تجزئة (Retail)</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">رقم الهاتف</label>
                        <input
                            className="glass-input w-full font-black text-slate-900 dark:text-white"
                            placeholder="01xxxxxxxxx"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">العنوان</label>
                        <input
                            className="glass-input w-full font-black text-slate-900 dark:text-white"
                            placeholder="عنوان الفرع تفصيلياً"
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">المنطقة</label>
                            <input
                                className="glass-input w-full font-black text-slate-900 dark:text-white"
                                placeholder="مثال: الوسطى"
                                value={region}
                                onChange={e => setRegion(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase font-black mb-2 block tracking-widest">كود الإقليم</label>
                            <input
                                className="glass-input w-full font-black font-mono text-slate-900 dark:text-white"
                                placeholder="CEN-01"
                                value={territoryCode}
                                onChange={e => setTerritoryCode(e.target.value.toUpperCase())}
                            />
                        </div>
                    </div>
                    
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-black py-4 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all mt-4"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                            editingBranch
                                ? <><Edit2 className="w-5 h-5" /> تحديث الفرع</>
                                : <><Plus className="w-5 h-5" /> إنشاء الفرع</>
                        )}
                    </button>
                </form>
            </GlassModal>
        </div>
    );
}
