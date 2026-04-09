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
    onQuickCreateSupplier?: (data: { name: string; phone?: string }) => void;
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
    attachmentUrl, setAttachmentUrl,
    onQuickCreateSupplier
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
        <div className="relative group flex-none">
            {/* Background Glows for Premium Look - Reduced Size */}
            <div className="absolute -top-12 -left-12 w-24 h-24 bg-cyan-500/5 blur-[40px] rounded-full pointer-events-none group-hover:bg-cyan-500/10 transition-all" />
            <div className="absolute -bottom-12 -right-12 w-24 h-24 bg-indigo-500/5 blur-[40px] rounded-full pointer-events-none group-hover:bg-indigo-500/10 transition-all" />

            <div className="bg-muted/20 backdrop-blur-md rounded-xl p-2 border border-white/20 shadow-2xl relative z-40 space-y-2">
                
                {/* Mode Toggle Row - Ultra Dense */}
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                        <div className={cn("p-1 rounded-md transition-all", isWalkin ? "bg-indigo-500 text-white" : "bg-emerald-500 text-white ")}>
                            {isWalkin ? <ShieldCheck className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                            <h4 className="font-black text-[11px] uppercase tracking-tight text-foreground leading-none">
                                {isWalkin ? "شراء مباشر (مبايعة)" : "شراء من مورد مسجل"}
                            </h4>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsWalkin(!isWalkin)}
                        className={cn(
                            "flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border active:scale-95",
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

                <div className="animate-in fade-in duration-300">
                    {isWalkin ? (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 pb-1">
                             {/* Walk-in Logic (Ultra Compact) */}
                             <div className="lg:col-span-2 grid grid-cols-1 gap-2 border-e border-white/10 pe-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                        <label className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-0.5 flex items-center gap-1.5">
                                            <User className="w-2.5 h-2.5" /> الاسم *
                                        </label>
                                        <input
                                            className="glass-input w-full h-8 text-[11px] font-bold"
                                            placeholder="اسم العميل..."
                                            value={walkinName}
                                            onChange={e => setWalkinName(e.target.value)}
                                        />
                                    </div>
                                    <div className="w-32">
                                        <label className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-0.5 flex items-center gap-1.5">
                                            <Phone className="w-2.5 h-2.5" /> الموبايل
                                        </label>
                                        <input
                                            className="glass-input w-full h-8 text-[11px] font-mono"
                                            placeholder="01xxxxxxxxx"
                                            value={walkinPhone}
                                            onChange={e => setWalkinPhone(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-0.5 flex items-center gap-1.5">
                                        <CreditCard className="w-2.5 h-2.5" /> الرقم القومي
                                    </label>
                                    <input
                                        className="glass-input w-full h-8 text-[11px] font-mono"
                                        placeholder="2xxxxxxxxxxxxx"
                                        maxLength={14}
                                        value={walkinNationalId}
                                        onChange={e => setWalkinNationalId(e.target.value)}
                                    />
                                </div>
                             </div>
                             
                             <div className="lg:col-span-2 grid grid-cols-2 gap-2">
                                <div className="space-y-2">
                                    <div>
                                        <label className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-0.5 flex items-center gap-2">
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
                                            className="h-8 [&_.glass-input]:h-8 text-[11px]"
                                        />
                                    </div>
                                    {isHQUser && (
                                        <div className="px-2 py-1 rounded-md bg-white/5 border border-white/10 flex items-center justify-between">
                                            <span className="text-[7px] uppercase font-black text-zinc-500 tracking-wider">Branch</span>
                                            <span className="text-[8px] font-bold text-cyan-400 truncate max-w-[80px]">{branches.find(b => b.id === selectedBranchId)?.name || "N/A"}</span>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[8px] text-indigo-400 uppercase font-black tracking-widest mb-0.5 flex items-center gap-2">
                                        <ImagePlus className="w-3 h-3" /> صورة المستند
                                    </label>
                                    <div className="relative h-14 w-full rounded-lg border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden bg-white/5 group">
                                        {attachmentUrl ? (
                                            <div className="relative w-full h-full">
                                                <img src={attachmentUrl} className="w-full h-full object-cover" alt="Doc" />
                                                <button onClick={() => setAttachmentUrl(null)} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <Trash2 className="w-3.5 h-3.5 text-white" />
                                                </button>
                                            </div>
                                        ) : (
                                            <label className="cursor-pointer flex flex-col items-center justify-center h-full w-full">
                                                <ImagePlus className="w-3 h-3 text-zinc-500" />
                                                <span className="text-[7px] font-black uppercase text-zinc-500">إرفاق صورة</span>
                                                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                            </label>
                                        )}
                                    </div>
                                </div>
                             </div>
                        </div>
                    ) : (
                        /* ULTRA COMPACT Supplier + Warehouse Row */
                        <div className="flex flex-wrap lg:flex-nowrap items-end gap-3">
                            <div className="flex-1 min-w-[180px]">
                                <label className="text-[8px] text-emerald-400 uppercase font-black tracking-widest mb-1 flex items-center gap-1.5">
                                    <User className="w-3 h-3" /> {t('supplier')}
                                </label>
                                <Combobox
                                    {...getNavProps(0)}
                                    options={supplierOptions}
                                    value={selectedSupplierId}
                                    onChange={onSupplierChange}
                                    onQuickCreate={onQuickCreateSupplier}
                                    quickCreateType="SUPPLIER"
                                    onKeyDown={(e: any) => handleKeyDown(e, 0, 13, () => {
                                        const focusable = document.querySelectorAll('[data-nav]');
                                        (focusable[1] as HTMLElement)?.focus();
                                    })}
                                    placeholder={t('selectSupplier')}
                                    emptyText="No suppliers found."
                                    className="h-10 text-xs shadow-xl"
                                />
                            </div>

                            <div className="flex-1 min-w-[160px]">
                                <label className="text-[8px] text-zinc-400 uppercase font-black tracking-widest mb-1 flex items-center gap-1.5">
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
                                    className="h-8 [&_.glass-input]:h-8 text-[11px]"
                                />
                            </div>

                            {isHQUser && (
                                <div className="hidden lg:flex flex-col justify-end pb-0.5">
                                    <div className="px-3 py-1.5 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2">
                                        <ShieldCheck className="w-3 h-3 text-cyan-500" />
                                        <span className="text-[10px] font-bold text-cyan-400">{branches.find(b => b.id === selectedBranchId)?.name || "Main"}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
