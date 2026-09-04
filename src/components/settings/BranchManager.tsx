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

    const handleDelete = async (id: string, counts?: { users?: number; warehouses?: number }) => {
        if ((counts?.users ?? 0) > 0 || (counts?.warehouses ?? 0) > 0) {
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
        <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-300 pb-14">
            <div className="flex justify-between items-center bg-card/90 dark:bg-card/40 backdrop-blur-xl p-3 rounded-xl border border-border/40 shadow-sm">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                        <Building2 className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-foreground leading-none">إدارة الفروع</h3>
                        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">أضف وعدل الفروع الخاصة بك</p>
                    </div>
                </div>

                <button
                    onClick={openCreateModal}
                    className="text-xs font-black bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 h-8 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-indigo-500/20 active:scale-95"
                >
                    <Plus className="w-3.5 h-3.5" />
                    إضافة فرع
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {branches.map((b) => (
                    <div key={b.id} className="glass-card p-3 group hover:border-indigo-500/40 transition-all flex flex-col justify-between bg-card/90 dark:bg-card/40 border border-border/40 shadow-sm relative rounded-xl">
                        <div>
                            <div className="flex justify-between items-start mb-1.5">
                                <div className={clsx(
                                    "px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md border",
                                    b.type === 'CENTER' ? "bg-purple-500/10 text-purple-600 border-purple-500/20" : 
                                    b.type === 'RETAIL' ? "bg-blue-500/10 text-blue-600 border-blue-500/20" : 
                                    "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                )}>
                                    {b.type}
                                </div>
                                <div className="flex gap-1 items-center">
                                    <button
                                        onClick={() => openEditModal(b)}
                                        className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-indigo-600 transition-colors"
                                        title="تعديل الفرع"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(b.id, b._count)}
                                        disabled={isDeleting && deletingId === b.id}
                                        className="p-1 hover:bg-red-500/10 rounded-md text-muted-foreground hover:text-red-500 transition-colors"
                                        title="حذف الفرع"
                                    >
                                        {isDeleting && deletingId === b.id ? (
                                            <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent animate-spin rounded-full" />
                                        ) : (
                                            <Trash2 className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <h4 className="font-black text-sm text-foreground mb-0.5 truncate tracking-tight">{b.name}</h4>
                            <p className="text-[9px] text-muted-foreground font-mono mb-2 uppercase tracking-wider">
                                {b.code}
                            </p>

                            <div className="space-y-1">
                                {b.address && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium truncate">
                                        <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                                        <span className="truncate">{b.address}</span>
                                    </p>
                                )}
                                {b.phone && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                                        <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                                        <span>{b.phone}</span>
                                    </p>
                                )}
                                {(b.region || b.territoryCode) && (
                                    <div className="flex gap-1.5 pt-0.5">
                                        {b.region && <span className="text-[10px] bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground font-bold">المنطقة: {b.region}</span>}
                                        {b.territoryCode && <span className="text-[10px] bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground font-mono font-bold">إقليم: {b.territoryCode}</span>}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-border/20 flex gap-3 text-xs font-bold text-muted-foreground">
                             <div className="flex items-center gap-1.5">
                                 <span className="text-[10px] uppercase opacity-70">المستودعات:</span>
                                 <span className="text-indigo-500 font-black">{b._count?.warehouses || 0}</span>
                             </div>
                             <div className="flex items-center gap-1.5 border-r pr-3 border-border/20">
                                 <span className="text-[10px] uppercase opacity-70">المستخدمين:</span>
                                 <span className="text-emerald-500 font-black">{b._count?.users || 0}</span>
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
                <form onSubmit={handleSubmit} className="space-y-3 max-h-[80vh] overflow-y-auto pr-1 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground uppercase font-black block tracking-wider">اسم الفرع *</label>
                            <input
                                className="w-full bg-background/60 border border-border/40 rounded-xl h-8 px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                                placeholder="مثال: الفرع الرئيسي"
                                value={name}
                                onChange={handleNameChange}
                                onBlur={() => generateCode(name)}
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground uppercase font-black block tracking-wider">كود الفرع *</label>
                            <input
                                className="w-full bg-background/60 border border-border/40 rounded-xl h-8 px-3 text-xs font-bold font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 uppercase"
                                placeholder="MB-001"
                                value={code}
                                onChange={e => setCode(e.target.value.toUpperCase())}
                                required
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-black block tracking-wider">نوع الفرع *</label>
                        <select
                            className="w-full bg-background/60 border border-border/40 rounded-xl h-8 px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                            value={type}
                            onChange={e => setType(e.target.value)}
                            required
                        >
                            <option value="STORE">معرض (Store)</option>
                            <option value="CENTER">مركز صيانة وإدارة (Center)</option>
                            <option value="RETAIL">تجزئة (Retail)</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-black block tracking-wider">رقم الهاتف</label>
                        <input
                            className="w-full bg-background/60 border border-border/40 rounded-xl h-8 px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                            placeholder="01xxxxxxxxx"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-black block tracking-wider">العنوان</label>
                        <input
                            className="w-full bg-background/60 border border-border/40 rounded-xl h-8 px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                            placeholder="عنوان الفرع تفصيلياً"
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground uppercase font-black block tracking-wider">المنطقة</label>
                            <input
                                className="w-full bg-background/60 border border-border/40 rounded-xl h-8 px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                                placeholder="مثال: الوسطى"
                                value={region}
                                onChange={e => setRegion(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground uppercase font-black block tracking-wider">كود الإقليم</label>
                            <input
                                className="w-full bg-background/60 border border-border/40 rounded-xl h-8 px-3 text-xs font-bold font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 uppercase"
                                placeholder="CEN-01"
                                value={territoryCode}
                                onChange={e => setTerritoryCode(e.target.value.toUpperCase())}
                            />
                        </div>
                    </div>
                    
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black h-8 rounded-xl flex justify-center items-center gap-1.5 shadow-md shadow-indigo-500/20 active:scale-95 transition-all text-xs"
                    >
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
                            editingBranch
                                ? <><Edit2 className="w-3.5 h-3.5" /> تحديث الفرع</>
                                : <><Plus className="w-3.5 h-3.5" /> إنشاء الفرع</>
                        )}
                    </button>
                </form>
            </GlassModal>
        </div>
    );
}
