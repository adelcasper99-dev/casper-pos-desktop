'use client'

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Wrench, RotateCcw, ShieldCheck, AlertCircle } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import GlassModal from "@/components/ui/GlassModal";
import { toast } from "sonner";
import { useCSRF } from "@/contexts/CSRFContext";
import { addTicketPart, removeTicketPart, getProductsForSelector } from "@/actions/ticket-actions";
import { transferPartToTechnicianQuick } from "@/actions/technician-custody-actions";
import ConfirmationModal from "@/components/ui/ConfirmationModal";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface ProductData {
    id: string;
    name: string;
    sku: string;
    stock: number;
    costPrice: number;
    sellPrice: number;
    sellPrice2: number;
    sellPrice3: number;
}

interface TicketPart {
    id: string;
    productId: string | null;
    quantity: number;
    cost: number;
    price: number;
    status?: 'ACTIVE' | 'REFUNDED';
    isDamaged?: boolean;
    createdAt?: string | Date; // To compare against ticket.lastReturnedAt
    product?: {
        name: string;
        sku: string;
    };
}

interface TicketPartsManagerProps {
    ticketId: string;
    parts: TicketPart[];
    technicianId?: string | null;
    technicianName?: string | null;
    onChangeTechnician?: () => void;
    onUpdate?: () => void;
    status: string;
    isWarrantyTicket?: boolean;
    lastReturnedAt?: string | Date | null;
}

export default function TicketPartsManager({
    ticketId,
    parts,
    technicianId,
    technicianName,
    onChangeTechnician,
    onUpdate,
    status,
    isWarrantyTicket,
    lastReturnedAt
}: TicketPartsManagerProps) {
    const isLocked = ['DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'CANCELLED', 'REJECTED', 'VOIDED'].includes(status);
    const { token: csrfToken } = useCSRF();
    const router = useRouter();

    const [isAddingPart, setIsAddingPart] = useState(false);
    const [usageType, setUsageType] = useState<"part" | "service" | "transfer">("part");
    const [isLoading, setIsLoading] = useState(false);
    const [products, setProducts] = useState<ProductData[]>([]);

    const [selectedProductId, setSelectedProductId] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [selectedPriceTier, setSelectedPriceTier] = useState<"A" | "B" | "C">("A");
    const [serviceName, setServiceName] = useState("");
    const [servicePrice, setServicePrice] = useState(0);

    const [deletingPartId, setDeletingPartId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDamagedConfirm, setShowDamagedConfirm] = useState(false);
    const [lossPercent, setLossPercent] = useState(70);

    useEffect(() => {
        if (isAddingPart) {
            setSelectedProductId("");
            setQuantity(1);
            loadData();
        }
    }, [isAddingPart, usageType, technicianId]);

    const loadData = async () => {
        setIsLoading(true);
        // Calculate the target warehouse ID locally to ensure it uses the most fresh logic
        const targetWarehouseId = usageType === "transfer" ? "MAIN" : (technicianId || undefined);
        const res = await getProductsForSelector(targetWarehouseId);
        if (res.success) setProducts((res.data || []) as any);
        setIsLoading(false);
    };

    const selectedProduct = products.find(p => p.id === selectedProductId);

    const handleAdd = async () => {
        if (usageType === "transfer") {
            if (!technicianId) { toast.error("يرجى إسناد فني أولاً"); return; }
            if (!selectedProductId) { toast.error("يرجى اختيار المنتج"); return; }
            
            try {
                const res = await transferPartToTechnicianQuick({
                    technicianId, 
                    productId: selectedProductId, 
                    quantity,
                    csrfToken: csrfToken ?? undefined
                });

                if (res.success) {
                    toast.success("تم النقل للمهندس بنجاح. يمكنك الآن إضافة القطعة للتذكرة.");
                    setUsageType("part"); 
                    // Force reload data to catch the new stock in the technician context
                    loadData();
                }
            } catch (error: any) {
                toast.error(error.message || "فشل النقل");
            }
            return;
        }

        if (usageType === "part") {
            if (!selectedProductId) { toast.error("يرجى اختيار المنتج"); return; }
            let unitPrice = selectedPriceTier === 'A' ? selectedProduct?.sellPrice :
                selectedPriceTier === 'B' ? selectedProduct?.sellPrice2 :
                    selectedProduct?.sellPrice3;

            const res = await addTicketPart({
                ticketId, productId: selectedProductId, quantity,
                price: unitPrice || 0,
                csrfToken: csrfToken ?? undefined
            });

            if (res.success) {
                toast.success("تم الإضافة"); setIsAddingPart(false);
                router.refresh(); onUpdate?.();
            } else {
                toast.error((res as any).error || "Failed to add part");
            }
        } else {
            const res = await addTicketPart({
                ticketId, quantity: 1, price: servicePrice, name: serviceName,
                csrfToken: csrfToken ?? undefined
            });
            if (res.success) {
                toast.success("تم الإضافة"); setIsAddingPart(false);
                router.refresh(); onUpdate?.();
            } else {
                toast.error((res as any).error || "Failed to add service");
            }
        }
    };

    const handleRemoveClick = (partId: string) => {
        setDeletingPartId(partId);
    };

    const confirmRemove = async (isDamaged: boolean) => {
        if (!deletingPartId) return;
        
        // Show secondary confirmation for damaged parts if not already showing
        if (isDamaged && !showDamagedConfirm) {
            setShowDamagedConfirm(true);
            return;
        }

        setIsDeleting(true);
        try {
            const res = await removeTicketPart({ 
                partId: deletingPartId, 
                isDamaged,
                lossRateOverride: isDamaged ? lossPercent : undefined,
                csrfToken: csrfToken ?? undefined 
            });
            if (res.success) { 
                toast.success(isDamaged ? `تم الحذف وتسجيله تالف (تحمل المهندس: ${lossPercent}%)` : "تم الحذف وإرجاع للمخزن"); 
                router.refresh(); 
                onUpdate?.(); 
            } else {
                toast.error("حدث خطأ أثناء الحذف");
            }
        } catch (error: any) {
            toast.error(error.message || "حدث خطأ غير متوقع");
        } finally {
            setIsDeleting(false);
            setDeletingPartId(null);
            setShowDamagedConfirm(false);
        }
    };

    return (
        <div className="space-y-6 text-right" dir="rtl">
            <div className="flex items-center justify-between group/header mb-4">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">المكونات والقطع</span>
                    <h4 className="text-lg font-black text-white">
                        تفصيل تكاليف الصيانة 
                        {technicianName ? (
                            <button 
                                onClick={onChangeTechnician}
                                disabled={isLocked}
                                className="group/tech inline-flex items-center gap-2 mr-3 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all active:scale-95 shadow-lg shadow-cyan-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Wrench className="w-4 h-4 text-cyan-400 group-hover/tech:rotate-12 transition-transform" />
                                <span className="text-cyan-400 text-sm font-black tracking-tight underline decoration-cyan-500/30 underline-offset-4">
                                    الفني: {technicianName}
                                </span>
                            </button>
                        ) : (
                            <button 
                                onClick={onChangeTechnician}
                                disabled={isLocked}
                                className="mr-3 px-3 py-1.5 rounded-xl bg-zinc-800/50 text-zinc-400 text-xs font-bold hover:text-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                (إسناد فني ومخزن)
                            </button>
                        )}
                    </h4>
                </div>
                <Button size="sm" onClick={() => setIsAddingPart(true)} disabled={isLocked} className="h-12 rounded-xl bg-cyan-500 text-black hover:bg-cyan-400 px-6 font-black transition-all shadow-xl shadow-cyan-500/10 active:scale-95 text-xs disabled:opacity-50 disabled:cursor-not-allowed">
                    <Plus className="w-4 h-4 ml-2" /> إضافة بند جديد
                </Button>
            </div>

            <div className="bg-zinc-900 border border-white/10 rounded-[20px] overflow-hidden shadow-2xl">
                {parts.length === 0 ? (
                    <div className="py-24 text-center text-[11px] font-black uppercase text-zinc-600 tracking-widest border border-dashed border-white/5 m-4 rounded-3xl">
                        قائمة البنود فارغة حالياً
                    </div>
                ) : (
                    <>
                        <Table>
                            <TableHeader className="bg-white/5 border-b border-white/10">
                                <TableRow className="border-white/10 hover:bg-transparent">
                                    <TableHead className="text-right text-[11px] font-black uppercase text-zinc-500 py-5 px-6 tracking-[0.2em]">البيان / الخدمة</TableHead>
                                    <TableHead className="text-center text-[11px] font-black uppercase text-zinc-500 py-5 tracking-[0.2em]">الكمية</TableHead>
                                    <TableHead className="text-left text-[11px] font-black uppercase text-zinc-500 py-5 px-6 tracking-[0.2em]">الإجمالي</TableHead>
                                    <TableHead className="w-[60px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(() => {
                                    const originalParts = parts.filter(p => !lastReturnedAt || new Date(p.createdAt || 0) < new Date(lastReturnedAt));
                                    const newParts = parts.filter(p => lastReturnedAt && new Date(p.createdAt || 0) >= new Date(lastReturnedAt));

                                    const renderRow = (part: TicketPart, isNewAddition: boolean) => {
                                        const isRefunded = part.status === 'REFUNDED';
                                        const isWarrantyPart = !isRefunded && Number(part.price) === 0 && isWarrantyTicket;
                                        
                                        return (
                                            <TableRow key={part.id} className={cn(
                                                "border-white/10 group transition-all duration-300",
                                                isRefunded ? "bg-red-950/20 opacity-60 grayscale border-l-4 border-l-red-500" : "hover:bg-white/[0.03]",
                                                isNewAddition && !isRefunded ? "border-l-4 border-l-cyan-500/50 bg-cyan-500/[0.02]" : ""
                                            )}>
                                                <TableCell className="py-4 px-6 relative">
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className={cn(
                                                            "font-black text-sm transition-colors flex items-center gap-2",
                                                            isRefunded ? "text-zinc-500 line-through" : "text-white group-hover:text-cyan-400"
                                                        )}>
                                                            {part.product?.name || (part as any).name}
                                                            
                                                            {isRefunded && (
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-tighter shadow-sm animate-pulse">
                                                                    <AlertCircle className="w-3 h-3" /> مرتجع
                                                                </span>
                                                            )}
                                                            
                                                            {isWarrantyPart && (
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-tighter shadow-sm">
                                                                    <ShieldCheck className="w-3 h-3" /> بديل ضمان
                                                                </span>
                                                            )}

                                                            {isNewAddition && !isWarrantyPart && (
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-tighter shadow-sm">
                                                                    <Plus className="w-3 h-3" /> إضافة جديدة
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className={cn(
                                                            "text-[10px] font-bold uppercase tracking-widest opacity-80",
                                                            isRefunded ? "text-zinc-600" : "text-zinc-600"
                                                        )}>
                                                            {formatCurrency(Number(part.price))} / الوحدة
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "text-center font-mono text-xs font-black",
                                                    isRefunded ? "text-zinc-600" : "text-zinc-400"
                                                )}>{part.quantity}</TableCell>
                                                <TableCell className="text-left px-6">
                                                    <span className={cn(
                                                        "font-mono font-black text-sm tracking-tighter",
                                                        isRefunded ? "text-zinc-600 line-through decoration-red-500/50" : 
                                                        isWarrantyPart ? "text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]" : "text-white"
                                                    )}>
                                                        {formatCurrency(part.quantity * Number(part.price))}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="px-6 text-left">
                                                    <div className="flex items-center justify-end">
                                                        {!isRefunded && !isLocked && (
                                                            <Button 
                                                                variant="ghost" 
                                                                size="sm"
                                                                onClick={() => handleRemoveClick(part.id)} 
                                                                className="h-10 px-4 text-red-500/80 hover:text-white hover:bg-red-500/20 rounded-xl font-black border border-red-500/10 transition-all flex items-center gap-2 group/btn shadow-sm bg-red-500/5 active:scale-95 touch-manipulation"
                                                            >
                                                                <Trash2 className="w-4 h-4 group-hover/btn:rotate-12 transition-transform" />
                                                                <span className="text-xs tracking-tight">إزالة / مرتجع</span>
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    };

                                    return (
                                        <>
                                            {/* Original Parts Section */}
                                            {originalParts.length > 0 && (
                                                <>
                                                    {lastReturnedAt && (
                                                        <TableRow className="bg-white/[0.01] hover:bg-white/[0.01] border-b border-white/5">
                                                            <TableCell colSpan={4} className="py-2 px-6">
                                                                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest flex items-center gap-2">
                                                                    القطع الأصلية <span className="text-[8px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">قبل المرتجع</span>
                                                                </span>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                    {originalParts.map(p => renderRow(p, false))}
                                                </>
                                            )}

                                            {/* New Additions Section */}
                                            {newParts.length > 0 && (
                                                <>
                                                    <TableRow className="bg-cyan-500/[0.02] hover:bg-cyan-500/[0.02] border-y border-cyan-500/10">
                                                        <TableCell colSpan={4} className="py-2 px-6">
                                                            <span className="text-[10px] font-black uppercase text-cyan-500 tracking-widest flex items-center gap-2">
                                                                القطع المضافة حديثاً <span className="text-[8px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded">بعد المرتجع</span>
                                                            </span>
                                                        </TableCell>
                                                    </TableRow>
                                                    {newParts.map(p => renderRow(p, true))}
                                                </>
                                            )}
                                        </>
                                    );
                                })()}
                            </TableBody>
                        </Table>
                        <div className="p-6 bg-zinc-950 border-t border-white/10 flex justify-between items-center">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">إجمالي البنود</span>
                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md">خاضع للضمان والخصومات</span>
                            </div>
                             <span className="text-3xl font-black text-white font-mono tracking-tighter shadow-sm">
                                {formatCurrency(parts.filter(p => (p as any).status !== 'REFUNDED').reduce((acc, p) => acc + (p.quantity * Number(p.price)), 0))}
                            </span>
                        </div>
                    </>
                )}
            </div>

            <GlassModal isOpen={isAddingPart} onClose={() => setIsAddingPart(false)} title="إضافة بند جديد">
                <div className="space-y-6 pt-4 text-right" dir="rtl">
                    <div className="flex gap-4 p-2 bg-black border border-white/10 rounded-2xl">
                        <Button variant="ghost" className={`flex-1 h-12 rounded-xl text-sm font-black transition-all ${usageType === 'part' ? 'bg-white text-black shadow-xl' : 'text-zinc-500'}`} onClick={() => setUsageType('part')}>قطعة غيار</Button>
                        <Button variant="ghost" className={`flex-1 h-12 rounded-xl text-sm font-black transition-all ${usageType === 'service' ? 'bg-white text-black shadow-xl' : 'text-zinc-500'}`} onClick={() => setUsageType('service')}>خدمة يدوية</Button>
                        <Button 
                            variant="ghost" 
                            className={`flex-1 h-12 rounded-xl text-sm font-black transition-all ${usageType === 'transfer' ? 'bg-emerald-500 text-black shadow-xl shadow-emerald-500/20' : 'text-emerald-500/70 hover:text-emerald-400'}`} 
                            onClick={() => { 
                                if (!technicianId) { toast.error("يرجى إسناد فني أولاً لتتمكن من النقل له"); return; }
                                setUsageType('transfer'); 
                            }}
                        >
                            نقل للمهندس
                        </Button>
                    </div>

                    {usageType === 'transfer' ? (
                        <div className="space-y-5">
                            <SearchableSelect
                                options={products.map(p => ({ label: `${p.name} (متوفر للصرف: ${p.stock}) ${p.sku ? `[${p.sku}]` : ''}`, value: p.id }))}
                                value={selectedProductId}
                                onChange={(val) => setSelectedProductId(val)}
                                placeholder="ابحث عن قطعة في مخزن الصيانة الافتراضي للنقل..."
                            />
                            <div className="flex items-center gap-4">
                                <label className="text-sm font-black text-zinc-400 shrink-0">الكمية المنقولة:</label>
                                <Input type="number" min={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="h-16 bg-black border-white/10 rounded-2xl text-center text-xl font-black focus:border-emerald-500 transition-all" />
                            </div>
                        </div>
                    ) : usageType === 'part' ? (
                        <div className="space-y-5">
                            <SearchableSelect
                                options={products.map(p => ({ label: `${p.name} (${p.stock}) ${p.sku ? `[${p.sku}]` : ''}`, value: p.id }))}
                                value={selectedProductId}
                                onChange={(val) => setSelectedProductId(val)}
                                placeholder="ابحث عن قطعة..."
                            />
                            {selectedProduct && (
                                <div className="grid grid-cols-3 gap-2 bg-black p-2 rounded-2xl border border-white/10">
                                    {(['A', 'B', 'C'] as const).map(t => {
                                        const price = t === 'A' ? selectedProduct.sellPrice : t === 'B' ? selectedProduct.sellPrice2 : selectedProduct.sellPrice3;
                                        return (
                                            <button 
                                                key={t} 
                                                onClick={() => setSelectedPriceTier(t)} 
                                                className={`flex flex-col items-center justify-center py-3 rounded-xl transition-all border ${
                                                    selectedPriceTier === t 
                                                    ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)] scale-[1.02]' 
                                                    : 'bg-zinc-900/50 text-zinc-400 border-white/5 hover:border-white/10 hover:bg-zinc-800'
                                                }`}
                                            >
                                                <span className={`text-[8px] font-black uppercase tracking-[0.1em] mb-0.5 ${selectedPriceTier === t ? 'text-black/60' : 'text-zinc-500'}`}>
                                                    فئة {t === 'A' ? 'أ' : t === 'B' ? 'ب' : 'ج'}
                                                </span>
                                                <span className="text-[14px] font-black tabular-nums tracking-tight">
                                                    {formatCurrency(Number(price || 0))}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="flex items-center gap-4">
                                <label className="text-sm font-black text-zinc-400 shrink-0">الكمية المطلوبة:</label>
                                <Input type="number" min={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="h-16 bg-black border-white/10 rounded-2xl text-center text-xl font-black focus:border-cyan-500 transition-all" />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <Input placeholder="اسم الخدمة..." className="h-16 bg-black border-white/10 rounded-2xl pr-6 font-bold text-lg focus:border-cyan-500 transition-all" value={serviceName} onChange={e => setServiceName(e.target.value)} />
                            <Input type="number" className="h-16 bg-black border-white/10 rounded-2xl text-center text-xl font-black focus:border-cyan-500 transition-all" value={servicePrice} onChange={e => setServicePrice(Number(e.target.value))} />
                        </div>
                    )}
                    <div className="pt-6 flex flex-row-reverse gap-4">
                        <Button 
                            onClick={handleAdd} 
                            className={`flex-1 h-16 text-black font-black text-base rounded-2xl transition-all shadow-2xl ${usageType === 'transfer' ? 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20' : 'bg-white hover:bg-zinc-200 shadow-white/10'}`}
                        >
                            {usageType === 'transfer' ? 'تأكيد النقل للمهندس' : 'إضافة البند للقائمة'}
                        </Button>
                        <Button variant="ghost" onClick={() => setIsAddingPart(false)} className="px-10 h-16 text-zinc-500 hover:text-white rounded-2xl font-bold">إلغاء</Button>
                    </div>
                </div>
            </GlassModal>

            {/* DELETE CONFIRMATION MODAL */}
            <GlassModal isOpen={!!deletingPartId && !showDamagedConfirm} onClose={() => !isDeleting && setDeletingPartId(null)} title="تأكيد حذف أو استرجاع البند">
                <div className="space-y-6 pt-4 text-right" dir="rtl">
                    <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-2xl">
                        <p className="text-zinc-300 text-sm font-black mb-1">هل أنت متأكد من رغبتك في تعديل التذكرة؟</p>
                        <p className="text-[11px] text-zinc-500 font-medium">سيؤدي هذا الإجراء لتعديل إجمالي التذكرة وقد يتطلب تسوية مالية مع العميل.</p>
                    </div>

                    <div className="flex flex-col gap-3">
                        {/* Option 1: Return to Stock */}
                        <Button 
                            onClick={() => confirmRemove(false)} 
                            className="h-24 bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600 hover:text-white border border-cyan-500/20 rounded-2xl flex flex-col items-center justify-center gap-1 group transition-all"
                            disabled={isDeleting}
                        >
                            <span className="text-xl font-black italic tracking-tight">إرجاع للمخزن (سليمة)</span>
                            <span className="text-[10px] opacity-60 font-black uppercase tracking-widest group-hover:opacity-100 transition-opacity">تسترد القطعة لعهدة المهندس مجدداً</span>
                        </Button>

                        {/* Option 2: Mark as Damaged */}
                        <Button 
                            onClick={() => confirmRemove(true)} 
                            className="h-24 bg-orange-600/10 text-orange-500 hover:bg-orange-600 hover:text-white border border-orange-500/20 rounded-2xl flex flex-col items-center justify-center gap-1 group transition-all"
                            disabled={isDeleting}
                        >
                            <span className="text-xl font-black italic tracking-tight">تسجيل كـ تالف (هالك)</span>
                            <span className="text-[10px] opacity-60 font-black uppercase tracking-widest group-hover:opacity-100 transition-opacity text-orange-400/70">⚠️ القطعة غير قابلة للاسترجاع (Wastage)</span>
                        </Button>

                        {/* Cancel Button */}
                        <Button 
                            variant="ghost" 
                            onClick={() => setDeletingPartId(null)} 
                            className="h-16 text-zinc-500 hover:text-white rounded-2xl font-black bg-white/5 mt-2"
                            disabled={isDeleting}
                        >
                            إلغاء الإجراء
                        </Button>
                    </div>
                </div>
            </GlassModal>

            <ConfirmationModal 
                isOpen={showDamagedConfirm}
                onClose={() => setShowDamagedConfirm(false)}
                onConfirm={() => confirmRemove(true)}
                title="تأكيد المرتجع التالف (Loss Share)"
                message="تنبيه هام: سيتم استهلاك هذه القطعة آلياً في العهدة كبند تالف. يتم تحديد نسبة التحمل أدناه لخصمها من حساب المهندس."
                confirmText="تأكيد الخصم والتالف"
                cancelText="تراجع"
                variant="warning"
                loading={isDeleting}
            >
                <div className="flex flex-col gap-3 p-4 bg-white/5 rounded-2xl border border-white/10 mt-2">
                    <div className="flex items-center justify-between">
                        <span className="text-zinc-400 font-bold text-xs uppercase tracking-wider">نسبة تحمل المهندس</span>
                        <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full border border-white/5">
                            <input 
                                type="number" 
                                value={lossPercent}
                                onChange={(e) => setLossPercent(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                                className="w-12 bg-transparent text-amber-500 font-black text-right outline-none"
                            />
                            <span className="text-amber-500/50 font-black">%</span>
                        </div>
                    </div>
                    
                    {/* Visual Progress Bar for Split */}
                    <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                        <div 
                            className="h-full bg-amber-500 transition-all duration-300" 
                            style={{ width: `${lossPercent}%` }} 
                        />
                        <div 
                            className="h-full bg-zinc-600 transition-all duration-300" 
                            style={{ width: `${100 - lossPercent}%` }} 
                        />
                    </div>
                    
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                        <span className="text-amber-500">تحمل المهندس: {lossPercent}%</span>
                        <span className="text-zinc-500">تحمل المركز: {100 - lossPercent}%</span>
                    </div>
                </div>
            </ConfirmationModal>
        </div>
    );
}
