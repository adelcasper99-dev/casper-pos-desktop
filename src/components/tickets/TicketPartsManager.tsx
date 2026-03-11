'use client'

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Wrench } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import GlassModal from "@/components/ui/GlassModal";
import { toast } from "sonner";
import { useCSRF } from "@/contexts/CSRFContext";
import { addTicketPart, removeTicketPart, getProductsForSelector } from "@/actions/ticket-actions";
import { transferPartToTechnicianQuick } from "@/actions/technician-custody-actions";
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
    productId: string;
    quantity: number;
    cost: number;
    price: number;
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
}

export default function TicketPartsManager({
    ticketId,
    parts,
    technicianId,
    technicianName,
    onChangeTechnician,
    onUpdate
}: TicketPartsManagerProps) {
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

    useEffect(() => {
        if (isAddingPart) loadData();
    }, [isAddingPart, usageType, technicianId]);

    const loadData = async () => {
        setIsLoading(true);
        // If "transfer", fetch stock from MAIN warehouse. Otherwise, filter by technician's warehouse.
        const whId = usageType === "transfer" ? "MAIN" : (technicianId || undefined);
        const res = await getProductsForSelector(whId);
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
                    toast.success("تم النقل للمهندس بنجاح");
                    setUsageType("part"); // Switch back to 'part' tab to add it
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
            }
        } else {
            const res = await addTicketPart({
                ticketId, quantity: 1, price: servicePrice, name: serviceName,
                csrfToken: csrfToken ?? undefined
            });
            if (res.success) {
                toast.success("تم الإضافة"); setIsAddingPart(false);
                router.refresh(); onUpdate?.();
            }
        }
    };

    const handleRemove = async (partId: string) => {
        if (!confirm("حذف العنصر؟")) return;
        const res = await removeTicketPart({ partId, csrfToken: csrfToken ?? undefined });
        if (res.success) { toast.success("تم الحذف"); router.refresh(); onUpdate?.(); }
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
                                className="group/tech inline-flex items-center gap-2 mr-3 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all active:scale-95 shadow-lg shadow-cyan-500/5"
                            >
                                <Wrench className="w-4 h-4 text-cyan-400 group-hover/tech:rotate-12 transition-transform" />
                                <span className="text-cyan-400 text-sm font-black tracking-tight underline decoration-cyan-500/30 underline-offset-4">
                                    الفني: {technicianName}
                                </span>
                            </button>
                        ) : (
                            <button 
                                onClick={onChangeTechnician}
                                className="mr-3 px-3 py-1.5 rounded-xl bg-zinc-800/50 text-zinc-400 text-xs font-bold hover:text-cyan-400 transition-colors"
                            >
                                (إسناد فني ومخزن)
                            </button>
                        )}
                    </h4>
                </div>
                <Button size="sm" onClick={() => setIsAddingPart(true)} className="h-12 rounded-xl bg-cyan-500 text-black hover:bg-cyan-400 px-6 font-black transition-all shadow-xl shadow-cyan-500/10 active:scale-95 text-xs">
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
                                {parts.map((part) => (
                                    <TableRow key={part.id} className="border-white/10 group hover:bg-white/[0.03] transition-colors">
                                        <TableCell className="py-4 px-6">
                                            <div className="font-black text-sm text-white group-hover:text-cyan-400 transition-colors">{part.product?.name || (part as any).name}</div>
                                            <div className="text-[10px] text-zinc-600 font-bold mt-1 uppercase tracking-widest opacity-80">{formatCurrency(Number(part.price))} / الوحدة</div>
                                        </TableCell>
                                        <TableCell className="text-center font-mono text-zinc-400 text-xs font-black">{part.quantity}</TableCell>
                                        <TableCell className="text-left px-6">
                                            <span className="font-mono font-black text-white text-sm tracking-tighter">
                                                {formatCurrency(part.quantity * Number(part.price))}
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-6 text-left">
                                            <button onClick={() => handleRemove(part.id)} className="opacity-0 group-hover:opacity-100 p-2 text-zinc-700 hover:text-red-400 transition-all bg-white/5 rounded-lg hover:bg-red-500/10">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <div className="p-6 bg-zinc-950 border-t border-white/10 flex justify-between items-center">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">إجمالي البنود</span>
                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md">خاضع للضمان والخصومات</span>
                            </div>
                            <span className="text-3xl font-black text-white font-mono tracking-tighter shadow-sm">
                                {formatCurrency(parts.reduce((acc, p) => acc + (p.quantity * Number(p.price)), 0))}
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
                                options={products.map(p => ({ label: `${p.name} (متوفر في الرئيسي: ${p.stock})`, value: p.name }))}
                                value={selectedProduct?.name || ""}
                                onChange={(val) => { const f = products.find(p => p.name === val); if (f) setSelectedProductId(f.id); }}
                                placeholder="ابحث عن قطعة في المخزن الرئيسي للنقل..."
                            />
                            <div className="flex items-center gap-4">
                                <label className="text-sm font-black text-zinc-400 shrink-0">الكمية المنقولة:</label>
                                <Input type="number" min={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="h-16 bg-black border-white/10 rounded-2xl text-center text-xl font-black focus:border-emerald-500 transition-all" />
                            </div>
                        </div>
                    ) : usageType === 'part' ? (
                        <div className="space-y-5">
                            <SearchableSelect
                                options={products.map(p => ({ label: `${p.name} (${p.stock})`, value: p.name }))}
                                value={selectedProduct?.name || ""}
                                onChange={(val) => { const f = products.find(p => p.name === val); if (f) setSelectedProductId(f.id); }}
                                placeholder="ابحث عن قطعة..."
                            />
                            {selectedProduct && (
                                <div className="grid grid-cols-3 gap-2 bg-black p-2 rounded-2xl border border-white/10">
                                    {(['A', 'B', 'C'] as const).map(t => (
                                        <button key={t} onClick={() => setSelectedPriceTier(t)} className={`py-3.5 rounded-xl text-[11px] font-black transition-all ${selectedPriceTier === t ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-zinc-700 hover:text-white'}`}>
                                            فئة {t === 'A' ? 'أ' : t === 'B' ? 'ب' : 'ج'}
                                        </button>
                                    ))}
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
        </div>
    );
}
