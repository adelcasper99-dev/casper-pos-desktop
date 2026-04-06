"use client";

import { useTranslations } from "@/lib/i18n-mock";
import { Combobox } from "@/components/ui/combobox";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";

interface PurchaseHeaderProps {
    suppliers: { id: string; name: string }[];
    branches: { id: string; name: string; code?: string }[];
    warehouses: { id: string; name: string }[];

    selectedSupplierId: string;
    onSupplierChange: (id: string) => void;

    selectedBranchId: string;
    onBranchChange: (id: string) => void;

    selectedWarehouseId: string;
    onWarehouseChange: (id: string) => void;

    isHQUser: boolean;
    
    // Walk-in state
    isWalkin: boolean;
    setIsWalkin: (val: boolean) => void;
    walkinName: string;
    setWalkinName: (val: string) => void;
    walkinPhone: string;
    setWalkinPhone: (val: string) => void;
    walkinNationalId: string;
    setWalkinNationalId: (val: string) => void;
    attachmentUrl?: string | null;
    setAttachmentUrl: (val: string | null) => void;
}

import { User, Phone, CreditCard, ImagePlus, X, Trash2, ShieldCheck, CheckCircle2, Plus, Loader2 } from "lucide-react";
import { compressImage } from "@/lib/image-compressor";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PurchaseHeader({
    suppliers,
    branches,
    warehouses,
    selectedSupplierId,
    onSupplierChange,
    selectedBranchId,
    onBranchChange,
    selectedWarehouseId,
    onWarehouseChange,
    isHQUser,
    isWalkin, setIsWalkin,
    walkinName, setWalkinName,
    walkinPhone, setWalkinPhone,
    walkinNationalId, setWalkinNationalId,
    attachmentUrl, setAttachmentUrl
}: PurchaseHeaderProps) {
    const t = useTranslations('Purchasing');
    const { handleKeyDown, getNavProps } = useKeyboardNavigation();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const compressed = await compressImage(file, 1000, 1000, 0.7);
            setAttachmentUrl(compressed);
            toast.success("تم ضغط الصورة وحفظها بنجاح");
        } catch (error) {
            console.error(error);
            toast.error("فشل في معالجة الصورة");
        }
    };

    // Convert to Combobox options
    const supplierOptions = suppliers.map(s => ({ label: s.name, value: s.id }));
    const warehouseOptions = warehouses.map(w => ({ label: w.name, value: w.id }));

    return (
        <div className="relative group">
            {/* Background Glows for Premium Look */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 blur-[80px] rounded-full pointer-events-none group-hover:bg-cyan-500/20 transition-all" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none group-hover:bg-indigo-500/20 transition-all" />

            <div className="bg-muted/20 backdrop-blur-md rounded-3xl p-6 border border-border/50 shadow-2xl relative z-10 space-y-6">
                
                {/* Mode Toggle Row */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-5">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-xl transition-all shadow-lg", isWalkin ? "bg-indigo-500 text-white shadow-indigo-500/20" : "bg-emerald-500 text-white shadow-emerald-500/20")}>
                            {isWalkin ? <ShieldCheck className="w-5 h-5" /> : <User className="w-5 h-5" />}
                        </div>
                        <div>
                            <h4 className="font-black text-sm uppercase tracking-tight text-foreground">
                                {isWalkin ? "شراء مباشر من عميل (مبايعة)" : "شراء من مورد مسجل"}
                            </h4>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                                {isWalkin ? "توثيق بيانات الهوية وصور المستندات" : "إضافة إلى رصيد المورد الحالي"}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsWalkin(!isWalkin)}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border active:scale-95",
                            isWalkin 
                                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20" 
                                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                        )}
                    >
                        {isWalkin ? (
                            <><CheckCircle2 className="w-3.5 h-3.5" /> تبديل لمورد مسجل</>
                        ) : (
                            <><Plus className="w-3.5 h-3.5" /> تبديل لشراء من زبون</>
                        )}
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    
                    {/* Primary Entity Selector (Supplier or Walk-in Name) */}
                    <div className="lg:col-span-2">
                        {isWalkin ? (
                            <div className="space-y-4 animate-in slide-in-from-left duration-300">
                                <div>
                                    <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest mb-2 flex items-center gap-2">
                                        <User className="w-3 h-3" /> اسم العميل بالكامل (البطاقة) *
                                    </label>
                                    <input
                                        className="glass-input w-full h-12 text-sm font-bold"
                                        placeholder="مثال: أحمد محمد علي"
                                        value={walkinName}
                                        onChange={e => setWalkinName(e.target.value)}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2 flex items-center gap-2">
                                            <Phone className="w-3 h-3" /> رقم الهاتف *
                                        </label>
                                        <input
                                            className="glass-input w-full h-12 text-sm font-mono tracking-widest"
                                            placeholder="01xxxxxxxxx"
                                            maxLength={11}
                                            value={walkinPhone}
                                            onChange={e => setWalkinPhone(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2 flex items-center gap-2">
                                            <CreditCard className="w-3 h-3" /> الرقم القومي (14 رقم)
                                        </label>
                                        <input
                                            className="glass-input w-full h-12 text-sm font-mono tracking-[0.2em]"
                                            placeholder="2xxxxxxxxxxxxx"
                                            maxLength={14}
                                            value={walkinNationalId}
                                            onChange={e => setWalkinNationalId(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="animate-in slide-in-from-right duration-300">
                                <label className="text-[10px] text-emerald-400 uppercase font-black tracking-widest mb-2 flex items-center gap-2">
                                    <User className="w-3 h-3" /> {t('supplier')}
                                </label>
                                <Combobox
                                    {...getNavProps(0)}
                                    options={supplierOptions}
                                    value={selectedSupplierId}
                                    onChange={onSupplierChange}
                                    onKeyDown={(e: any) => handleKeyDown(e, 0, 13, undefined)}
                                    placeholder={t('selectSupplier')}
                                    emptyText="No suppliers found."
                                    className="h-12 [&_.glass-input]:h-12"
                                />
                            </div>
                        )}
                    </div>

                    {/* Warehouse & Media Container */}
                    <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {/* Warehouse */}
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2 flex items-center gap-2">
                                    {t('warehouse')}
                                </label>
                                <Combobox
                                    {...getNavProps(1)}
                                    options={warehouseOptions}
                                    value={selectedWarehouseId}
                                    onChange={onWarehouseChange}
                                    onKeyDown={(e: any) => handleKeyDown(e, 1, 13, undefined)}
                                    placeholder={t('selectWarehouse')}
                                    emptyText="No warehouses found."
                                    className="h-12 [&_.glass-input]:h-12"
                                />
                            </div>

                            {/* Branch Info (Read Only) */}
                            {isHQUser && (
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                                    <span className="text-[10px] uppercase font-black text-zinc-500 tracking-wider">Branch context</span>
                                    <span className="text-[11px] font-bold text-cyan-400">{branches.find(b => b.id === selectedBranchId)?.name || "N/A"}</span>
                                </div>
                            )}
                        </div>

                        {/* Image Dropzone (Only for Walk-in) */}
                        <div className={cn("transition-all duration-500", isWalkin ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none")}>
                            <label className="text-[10px] text-indigo-400 uppercase font-black tracking-widest mb-2 flex items-center gap-2">
                                <ImagePlus className="w-3 h-3" /> صورة المبايعة / البطاقة
                            </label>
                            
                            <div className="relative group/zone">
                                {attachmentUrl ? (
                                    <div className="relative h-24 w-full rounded-2xl overflow-hidden border border-indigo-500/30 group/img shadow-2xl">
                                        <img src={attachmentUrl} className="w-full h-full object-cover" alt="Verification" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                            <button 
                                                onClick={() => setAttachmentUrl(null)}
                                                className="bg-rose-500 text-white p-2 rounded-full hover:scale-110 active:scale-95 transition-all shadow-lg"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center h-24 w-full rounded-2xl border-2 border-dashed border-zinc-200 dark:border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all cursor-pointer group/label">
                                        <ImagePlus className="w-6 h-6 text-zinc-400 group-hover/label:text-indigo-400 mb-1" />
                                        <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest group-hover/label:text-indigo-400">إرفاق مستند</span>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                    </label>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
