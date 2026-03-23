"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormatCurrency } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, RotateCcw, Save, AlertTriangle, Loader2, Wrench, Package, Cpu } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import GlassModal from "@/components/ui/GlassModal";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCSRF } from "@/contexts/CSRFContext";
import { cn } from "@/lib/utils";

import { 
    addTicketPart, 
    removeTicketPart, 
    getProductsForSelector,
    refundTicketPart 
} from "@/actions/ticket-actions";
import { transferPartToTechnicianQuick } from "@/actions/technician-custody-actions";

// Types
interface ProductData {
    id: string;
    name: string;
    sku: string;
    stock: number;
    sellPrice: number;
    trackStock: boolean;
    sellPrice2?: number;
    sellPrice3?: number;
}

interface TicketPart {
    id: string;
    productId: string | null;
    quantity: number;
    cost: number;
    price: number;
    name?: string;
    status?: 'ACTIVE' | 'REFUNDED';
    isDamaged?: boolean;
    product?: {
        name: string;
        sku: string;
    };
    addedBy?: {
        name: string;
        username: string;
    };
}

interface TicketPartsManagerProps {
    ticketId: string;
    parts: TicketPart[];
    status: string;
    technicianId?: string | null;
    technicianName?: string | null;
    technicianWarehouseId?: string;
    onChangeTechnician?: () => void;
    onUpdate?: () => void;
    isWarrantyTicket?: boolean;
}

export default function TicketPartsManager({
    ticketId,
    parts,
    status,
    technicianId,
    technicianName,
    technicianWarehouseId,
    onChangeTechnician,
    onUpdate,
    isWarrantyTicket
}: TicketPartsManagerProps) {
    const t = useTranslations("Tickets.PartsManager");
    const formatCurrency = useFormatCurrency();
    const router = useRouter();
    const { token: csrfToken } = useCSRF();
    
    const isLocked = ['DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'CANCELLED', 'REJECTED', 'VOIDED'].includes(status);

    const [isAddingPart, setIsAddingPart] = useState(false);
    const [usageType, setUsageType] = useState<"part" | "service" | "transfer">("part");
    const [isLoading, setIsLoading] = useState(false);

    // Data State
    const [products, setProducts] = useState<ProductData[]>([]);

    // Form State
    const [selectedProductId, setSelectedProductId] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [selectedPriceTier, setSelectedPriceTier] = useState<"A" | "B" | "C">("A");

    // Service State
    const [serviceName, setServiceName] = useState("");
    const [servicePrice, setServicePrice] = useState(0);

    // Load products when modal opens
    useEffect(() => {
        if (isAddingPart) {
            loadData();
        }
    }, [isAddingPart, usageType]);

    const loadData = async () => {
        setIsLoading(true);
        // If transfer, load global, otherwise prioritizing technician's warehouse
        const targetWhId = usageType === "transfer" ? undefined : (technicianId || undefined);
        const res = await getProductsForSelector(targetWhId);
        if (res.success) setProducts(res.data || []);
        setIsLoading(false);
    };

    const selectedProduct = products.find(p => p.id === selectedProductId);

    const handleAdd = async () => {
        if (usageType === "transfer") {
            if (!technicianId) { toast.error("يرجى إسناد فني أولاً"); return; }
            if (!selectedProductId || quantity <= 0) { toast.error("يرجى اختيار المنتج والكمية"); return; }
            
            setIsLoading(true);
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
                    loadData();
                } else {
                    toast.error(res.error || "فشل النقل");
                }
            } catch (error: any) {
                toast.error(error.message || "فشل النقل");
            } finally {
                setIsLoading(false);
            }
            return;
        }

        if (usageType === "part") {
            if (!selectedProductId || quantity <= 0) {
                toast.error("يرجى اختيار المنتج والكمية");
                return;
            }

            // Determine Price based on Tier
            let unitPrice = 0;
            if (selectedProduct) {
                if (selectedPriceTier === 'A') unitPrice = selectedProduct.sellPrice;
                else if (selectedPriceTier === 'B') unitPrice = selectedProduct.sellPrice2 || selectedProduct.sellPrice;
                else unitPrice = selectedProduct.sellPrice3 || selectedProduct.sellPrice;
            }

            setIsLoading(true);
            const res = await addTicketPart({
                ticketId,
                productId: selectedProductId,
                quantity,
                price: unitPrice,
                csrfToken: csrfToken ?? undefined
            });

            if (res.success) {
                toast.success(t('success'));
                setIsAddingPart(false);
                resetForm();
                router.refresh();
                onUpdate?.();
            } else {
                toast.error((res as any).error || t('error'));
            }
            setIsLoading(false);

        } else {
            // Service Adding
            if (!serviceName.trim() || servicePrice < 0) {
                toast.error("يرجى إدخال اسم الخدمة والسعر");
                return;
            }

            setIsLoading(true);
            const res = await addTicketPart({
                ticketId,
                name: serviceName,
                quantity: 1,
                price: servicePrice,
                csrfToken: csrfToken ?? undefined
            });

            if (res.success) {
                toast.success(t('success'));
                setIsAddingPart(false);
                resetForm();
                router.refresh();
                onUpdate?.();
            } else {
                toast.error((res as any).error || t('error'));
            }
            setIsLoading(false);
        }
    };

    const handleRemove = async (partId: string) => {
        if (!confirm("هل أنت متأكد من حذف هذا البند؟")) return;
        
        const res = await removeTicketPart({
            partId,
            csrfToken: csrfToken ?? undefined
        });
        
        if (res.success) {
            toast.success(t('deleteSuccess'));
            router.refresh();
            onUpdate?.();
        } else {
            toast.error((res as any).error);
        }
    };

    const resetForm = () => {
        setSelectedProductId("");
        setQuantity(1);
        setServiceName("");
        setServicePrice(0);
        setSelectedPriceTier("A");
    }

    return (
        <div className="space-y-6" dir="rtl">
            <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">{t('title')}</span>
                    <h4 className="text-lg font-black text-white flex items-center gap-3">
                        {t('title')}
                        {technicianName ? (
                            <Badge variant="outline" className="bg-cyan-500/10 border-cyan-500/20 text-cyan-400 font-bold hover:bg-cyan-500/20 cursor-pointer transition-all" onClick={onChangeTechnician}>
                                <Wrench className="w-3 h-3 ml-1.5" />
                                الفني: {technicianName}
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-zinc-800 text-zinc-500 border-white/5 cursor-pointer hover:text-cyan-400 transition-colors" onClick={onChangeTechnician}>
                                (إسناد فني)
                            </Badge>
                        )}
                    </h4>
                </div>
                <Button 
                    size="sm" 
                    onClick={() => setIsAddingPart(true)} 
                    disabled={isLocked}
                    className="h-12 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-xl px-6 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                    <Plus className="w-4 h-4 ml-2" />
                    {t('addItem')}
                </Button>
            </div>

            <div className="space-y-3">
                {parts.length === 0 ? (
                    <div className="text-center py-12 text-zinc-600 text-[11px] font-black uppercase tracking-widest border-2 border-dashed border-white/5 rounded-[24px]">
                        {t('noParts')}
                    </div>
                ) : (
                    parts.map((part) => (
                        <div 
                            key={part.id} 
                            className={cn(
                                "group relative flex items-center justify-between p-5 rounded-2xl bg-zinc-900 border border-white/10 hover:border-cyan-500/30 transition-all shadow-xl",
                                part.status === 'REFUNDED' && "opacity-60 grayscale"
                            )}
                        >
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center border",
                                    part.productId ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-500" : "bg-purple-500/10 border-purple-500/20 text-purple-500"
                                )}>
                                    {part.productId ? <Package className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <h5 className="font-black text-white text-sm">
                                        {part.product?.name || part.name || "Unknown Item"}
                                    </h5>
                                    <div className="flex items-center gap-2 text-xs text-zinc-500 font-bold">
                                        <span>{part.quantity} × {formatCurrency(Number(part.price))}</span>
                                        {part.status === 'REFUNDED' && (
                                            <Badge variant="destructive" className="h-4 text-[8px] font-black uppercase px-1.5 leading-none">REFUNDED</Badge>
                                        )}
                                        {part.addedBy && (
                                            <span className="text-[10px] text-zinc-700">| بواسطة: {part.addedBy.name}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-8">
                                <div className="text-right">
                                    <span className="text-lg font-black text-cyan-400 tabular-nums">
                                        {formatCurrency(part.quantity * Number(part.price))}
                                    </span>
                                </div>
                                {!isLocked && part.status !== 'REFUNDED' && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-10 w-10 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                        onClick={() => handleRemove(part.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))
                )}

                {parts.length > 0 && (
                    <div className="flex justify-between items-center px-6 py-4 mt-4 bg-zinc-950/50 rounded-2xl border border-white/5">
                        <span className="text-xs font-black text-zinc-500 tracking-wider uppercase">{t('totalconsumption')}</span>
                        <span className="text-2xl font-black text-white tabular-nums">
                            {formatCurrency(parts.filter(p => p.status !== 'REFUNDED').reduce((acc, p) => acc + (p.quantity * Number(p.price)), 0))}
                        </span>
                    </div>
                )}
            </div>

            <GlassModal
                isOpen={isAddingPart}
                onClose={() => !isLoading && setIsAddingPart(false)}
                title={t('title')}
                className="max-w-lg"
            >
                <div className="space-y-6 py-4">
                    {/* Mode Toggle */}
                    <div className="grid grid-cols-3 gap-2 p-1 bg-black/40 rounded-2xl border border-white/10">
                        {(['part', 'service', 'transfer'] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setUsageType(mode)}
                                className={cn(
                                    "py-2 rounded-xl text-xs font-black transition-all",
                                    usageType === mode 
                                        ? "bg-white text-black shadow-lg" 
                                        : "text-zinc-600 hover:text-zinc-400"
                                )}
                            >
                                {mode === 'part' ? t('part') : mode === 'service' ? t('service') : "نقل عهدة"}
                            </button>
                        ))}
                    </div>

                    {usageType === 'transfer' ? (
                        <div className="space-y-5 animate-in fade-in slide-in-from-top-4">
                            <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl">
                                <p className="text-xs text-emerald-400 font-bold leading-relaxed mb-4">
                                    <AlertTriangle className="w-3 h-3 inline ml-1.5 mb-1" />
                                    سيتم نقل الكمية المحددة من المخزن الرئيسي إلى مخزن الفني مباشرة، ثم يمكنك إضافتها للتذكرة.
                                </p>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-black text-zinc-500 mr-2">ابحث عن منتج في المخزن الرئيسي</Label>
                                        <SearchableSelect
                                            options={products.map(p => ({
                                                label: `${p.name} (متوفر: ${p.stock})`,
                                                value: p.id
                                            }))}
                                            value={selectedProductId}
                                            onChange={(val) => setSelectedProductId(val)}
                                            placeholder="اختر القطعة..."
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-black text-zinc-500 mr-2">الكمية المنقولة</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                className="bg-black/40 border-white/5 h-14 rounded-xl text-center text-lg font-black focus:border-emerald-500 transition-all font-mono"
                                                value={quantity}
                                                onChange={e => setQuantity(Number(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : usageType === 'part' ? (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-black text-zinc-500 mr-2">{t('selectProduct')}</Label>
                                <SearchableSelect
                                    options={products.map(p => ({
                                        label: `${p.name} (المخزن: ${p.stock}) ${p.sku ? `[${p.sku}]` : ''}`,
                                        value: p.id
                                    }))}
                                    value={selectedProductId}
                                    onChange={(val) => setSelectedProductId(val)}
                                    placeholder={t('searchPlaceholder')}
                                />
                                {selectedProduct && (
                                    <div className="flex justify-between items-center px-1 mt-1 text-[10px] uppercase tracking-widest font-black">
                                        <span className={selectedProduct.stock > 0 ? "text-emerald-500" : "text-red-500"}>
                                            {t('stockInfo', { count: selectedProduct.stock })}
                                        </span>
                                        <span className="text-zinc-600">SKU: {selectedProduct.sku || '-'}</span>
                                    </div>
                                )}
                            </div>

                            {selectedProduct && (
                                <div className="space-y-2">
                                    <Label className="text-xs font-black text-zinc-500 mr-2">{t('priceTier')}</Label>
                                    <div className="grid grid-cols-3 gap-2 bg-black/40 p-2 rounded-2xl border border-white/10">
                                        {(['A', 'B', 'C'] as const).map((tier) => {
                                            const price = tier === 'A' ? selectedProduct.sellPrice :
                                                         tier === 'B' ? (selectedProduct.sellPrice2 || selectedProduct.sellPrice) :
                                                         (selectedProduct.sellPrice3 || selectedProduct.sellPrice);
                                            
                                            const isSelected = selectedPriceTier === tier;

                                            return (
                                                <button
                                                    key={tier}
                                                    onClick={() => setSelectedPriceTier(tier)}
                                                    className={cn(
                                                        "flex flex-col items-center justify-center py-3 rounded-xl border transition-all",
                                                        isSelected 
                                                            ? "bg-cyan-600/20 border-cyan-500 text-white shadow-lg" 
                                                            : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                                                    )}
                                                >
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] mb-1 opacity-60">
                                                        {tier === 'A' ? 'S' : tier === 'B' ? 'M' : 'L'} Tier
                                                    </span>
                                                    <span className="text-sm font-black tabular-nums">{formatCurrency(Number(price))}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label className="text-xs font-black text-zinc-500 mr-2">{t('quantity')}</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    className="bg-black/40 border-white/5 h-14 rounded-xl text-center text-lg font-black focus:border-cyan-500 transition-all font-mono"
                                    value={quantity}
                                    onChange={e => setQuantity(Number(e.target.value))}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5 animate-in fade-in slide-in-from-left-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-black text-zinc-500 mr-2">{t('customName')}</Label>
                                <Input
                                    className="bg-black/40 border-white/5 h-14 rounded-xl px-5 text-sm font-bold focus:border-purple-500 transition-all"
                                    placeholder={t('customName')}
                                    value={serviceName}
                                    onChange={e => setServiceName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-black text-zinc-500 mr-2">{t('customPrice')}</Label>
                                <Input
                                    type="number"
                                    className="bg-black/40 border-white/5 h-14 rounded-xl text-center text-lg font-black focus:border-purple-500 transition-all font-mono"
                                    value={servicePrice}
                                    onChange={e => setServicePrice(Number(e.target.value))}
                                />
                            </div>
                        </div>
                    )}

                    <div className="pt-8 flex flex-row-reverse gap-4">
                        <Button 
                            onClick={handleAdd} 
                            disabled={isLoading}
                            className={cn(
                                "flex-1 h-16 font-black text-lg rounded-[24px] shadow-2xl transition-all active:scale-95",
                                usageType === 'transfer' ? "bg-emerald-500 text-black hover:bg-emerald-400 shadow-emerald-500/20" : "bg-white text-black hover:bg-zinc-200"
                            )}
                        >
                            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : 
                             usageType === 'transfer' ? "تأكيد النقل للمهندس" : t('add')}
                        </Button>
                        <Button 
                            variant="ghost" 
                            onClick={() => setIsAddingPart(false)} 
                            disabled={isLoading}
                            className="bg-white/5 px-10 h-16  text-zinc-500 hover:text-white rounded-[24px] font-bold"
                        >
                            {t('cancel')}
                        </Button>
                    </div>
                </div>
            </GlassModal>
        </div>
    );
}
