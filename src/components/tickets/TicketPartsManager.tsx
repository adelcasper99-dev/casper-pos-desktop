"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import { useFormatCurrency } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, RotateCcw, Save, AlertTriangle, Loader2, Wrench, Package, Cpu, ShieldCheck, AlertCircle } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import GlassModal from "@/components/ui/GlassModal";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Decimal } from "decimal.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCSRF } from "@/contexts/CSRFContext";
import { cn } from "@/lib/utils";
import ConfirmationModal from "@/components/ui/ConfirmationModal";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

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
    costPrice: number | string;
    sellPrice: number | string;
    trackStock: boolean;
    sellPrice2?: number | string;
    sellPrice3?: number | string;
}

interface TicketPart {
    id: string;
    productId: string | null;
    quantity: number;
    cost: number | string;
    price: number | string;
    name?: string;
    status?: 'ACTIVE' | 'REFUNDED';
    isDamaged?: boolean;
    createdAt?: string | Date; // To compare against ticket.lastReturnedAt
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
    lastReturnedAt?: string | Date | null;
    isAddingPartExternal?: boolean;
    onCloseAddingPartExternal?: () => void;
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
    isWarrantyTicket,
    lastReturnedAt,
    isAddingPartExternal,
    onCloseAddingPartExternal
}: TicketPartsManagerProps) {
    const t = useTranslations("Tickets.PartsManager");
    const formatCurrencyCtx = useFormatCurrency();
    const router = useRouter();
    const { token: csrfToken } = useCSRF();
    
    // Status lock based on ticket status
    const isLocked = ['DELIVERED', 'PICKED_UP', 'PAID_DELIVERED', 'CANCELLED', 'REJECTED', 'VOIDED'].includes(status);

    const [isAddingPart, setIsAddingPart] = useState(false);
    const [usageType, setUsageType] = useState<"part" | "service" | "transfer">("part");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isAddingPartExternal) {
            setIsAddingPart(true);
        }
    }, [isAddingPartExternal]);

    const handleCloseModal = () => {
        if (!isLoading) {
            setIsAddingPart(false);
            onCloseAddingPartExternal?.();
        }
    };

    // Data State
    const [products, setProducts] = useState<ProductData[]>([]);

    const [selectedProductId, setSelectedProductId] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [selectedPriceTier, setSelectedPriceTier] = useState<"A" | "B" | "C">("A");
    const [transferPriceChoice, setTransferPriceChoice] = useState<"COST" | "SELL_1">("COST");

    // Service State
    const [serviceName, setServiceName] = useState("");
    const [servicePrice, setServicePrice] = useState(0);

    const [deletingPartId, setDeletingPartId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDamagedConfirm, setShowDamagedConfirm] = useState(false);
    const [lossPercent, setLossPercent] = useState(70);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        if (isAddingPart) {
            loadData(debouncedSearchQuery);
        }
    }, [isAddingPart, usageType, debouncedSearchQuery]);

    const loadData = async (query?: string) => {
        setIsLoading(true);
        // If transfer, load global, otherwise prioritizing technician's warehouse
        const targetWhId = usageType === "transfer" ? undefined : (technicianId || undefined);
        const res = await getProductsForSelector({ 
            search: query, 
            warehouseId: targetWhId 
        });
        if (res.success) setProducts((res.data || []) as ProductData[]);
        setIsLoading(false);
    };

    const selectedProduct = products.find(p => p.id === selectedProductId);

    const handleAdd = async () => {
        if (usageType === "transfer") {
            if (!technicianId) { toast.error("يرجى إسناد فني أولاً"); return; }
            if (!selectedProductId || quantity <= 0) { toast.error("يرجى اختيار المنتج والكمية"); return; }
            
            setIsLoading(true);
            try {
                const priceValue = transferPriceChoice === 'COST' ? selectedProduct?.costPrice : selectedProduct?.sellPrice;
                const priceLabel = transferPriceChoice === 'COST' ? 'بسعر التكلفة' : 'بالسعر 1';

                const res = await transferPartToTechnicianQuick({
                    technicianId, 
                    productId: selectedProductId, 
                    quantity,
                    transferPrice: priceValue !== undefined ? Number(priceValue) : undefined,
                    transferPriceLabel: priceLabel,
                    csrfToken: csrfToken ?? undefined
                });

                if (res.success) {
                    toast.success("تم النقل للمهندس بنجاح. يمكنك الآن إضافة القطعة للتذكرة.");
                    setUsageType("part"); 
                    loadData();
                } else {
                    toast.error(res.error || "فشل النقل");
                }
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : "فشل النقل";
                toast.error(msg);
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
                if (selectedPriceTier === 'A') unitPrice = Number(selectedProduct.sellPrice);
                else if (selectedPriceTier === 'B') unitPrice = Number(selectedProduct.sellPrice2 || selectedProduct.sellPrice);
                else unitPrice = Number(selectedProduct.sellPrice3 || selectedProduct.sellPrice);
            }

            // Determine Transfer Price (Cost to Engineer)
            let overrideTransferPrice = 0;
            if (selectedProduct) {
                overrideTransferPrice = transferPriceChoice === 'COST' ? Number(selectedProduct.costPrice) : Number(selectedProduct.sellPrice);
            }

            setIsLoading(true);
            const res = await addTicketPart({
                ticketId,
                productId: selectedProductId,
                quantity,
                price: unitPrice,
                transferPriceOverride: overrideTransferPrice,
                csrfToken: csrfToken ?? undefined
            });

            if (res.success) {
                toast.success(t('success'));
                setIsAddingPart(false);
                onCloseAddingPartExternal?.();
                resetForm();
                router.refresh();
                onUpdate?.();
            } else {
                toast.error(res.error || t('error'));
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
                onCloseAddingPartExternal?.();
                resetForm();
                router.refresh();
                onUpdate?.();
            } else {
                toast.error(res.error || t('error'));
            }
            setIsLoading(false);
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
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "حدث خطأ غير متوقع";
            toast.error(msg);
        } finally {
            setIsDeleting(false);
            setDeletingPartId(null);
            setShowDamagedConfirm(false);
        }
    };

    const resetForm = () => {
        setSelectedProductId("");
        setQuantity(1);
        setServiceName("");
        setServicePrice(0);
        setSelectedPriceTier("A");
        setTransferPriceChoice("COST");
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
                    <div className="text-center py-12 text-muted-foreground text-[11px] font-black uppercase tracking-widest border-2 border-dashed border-border rounded-[24px]">
                        {t('noParts')}
                    </div>
                ) : (
                    <>
                        <Table>
                            <TableHeader className="bg-muted/30 border-b border-border">
                                <TableRow className="border-border hover:bg-transparent">
                                    <TableHead className="text-right text-[11px] font-black uppercase text-muted-foreground py-5 px-6 tracking-[0.2em]">البيان / الخدمة</TableHead>
                                    <TableHead className="text-center text-[11px] font-black uppercase text-muted-foreground py-5 tracking-[0.2em]">الكمية</TableHead>
                                    <TableHead className="text-left text-[11px] font-black uppercase text-muted-foreground py-5 px-6 tracking-[0.2em]">الإجمالي</TableHead>
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
                                                "border-border group transition-all duration-300",
                                                isRefunded ? "bg-red-50 dark:bg-red-950/20 opacity-60 grayscale border-l-4 border-l-red-500" : "hover:bg-muted/50",
                                                isNewAddition && !isRefunded ? "border-l-4 border-l-cyan-500/50 bg-cyan-50/50 dark:bg-cyan-500/[0.02]" : ""
                                            )}>
                                                <TableCell className="py-4 px-6 relative">
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className={cn(
                                                            "font-black text-sm transition-colors flex items-center gap-2",
                                                            isRefunded ? "text-muted-foreground line-through" : "text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400"
                                                        )}>
                                                            {part.product?.name || part.name}
                                                            
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
                                                            isRefunded ? "text-muted-foreground/80" : "text-muted-foreground"
                                                        )}>
                                                            {formatCurrencyCtx(Number(part.price))} /الوحدة
                                                            {part.addedBy && (
                                                                <span className="mr-2 opacity-70">| بواسطة: {part.addedBy.name}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "text-center font-mono text-xs font-black",
                                                    isRefunded ? "text-muted-foreground" : "text-foreground/80"
                                                )}>{part.quantity}</TableCell>
                                                <TableCell className="text-left px-6">
                                                    <div className="text-sm font-bold text-cyan-400">
                                                        {formatCurrencyCtx(new Decimal(part.price.toString()).mul(part.quantity).toNumber())}
                                                    </div>
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
                                                        <TableRow className="bg-muted/10 hover:bg-muted/10 border-b border-border">
                                                            <TableCell colSpan={4} className="py-2 px-6">
                                                                <span className="text-[10px] font-black uppercase text-muted-foreground/70 tracking-widest flex items-center gap-2">
                                                                    القطع الأصلية <span className="text-[8px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">قبل المرتجع</span>
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
                                                    <TableRow className="bg-cyan-50 dark:bg-cyan-500/[0.02] hover:bg-cyan-50 dark:hover:bg-cyan-500/[0.02] border-y border-cyan-500/20">
                                                        <TableCell colSpan={4} className="py-2 px-6">
                                                            <span className="text-[10px] font-black uppercase text-cyan-700 dark:text-cyan-500 tracking-widest flex items-center gap-2">
                                                                القطع المضافة حديثاً <span className="text-[8px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded">بعد المرتجع</span>
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
                        <div className="p-6 bg-muted/20 border-t border-border flex justify-between items-center">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">إجمالي البنود</span>
                                <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md">خاضع للضمان والخصومات</span>
                            </div>
                        </div>
                    </>
                )}

                {parts.length > 0 && (
                    <div className="flex justify-between items-center px-6 py-4 mt-4 bg-muted/40 rounded-2xl border border-border">
                        <span className="text-xs font-black text-muted-foreground tracking-wider uppercase">{t('totalconsumption')}</span>
                        <span className="text-lg font-bold text-cyan-400">
                            {formatCurrencyCtx(parts.filter(p => p.status !== 'REFUNDED').reduce((acc, p) => acc.add(new Decimal(p.price.toString()).mul(p.quantity)), new Decimal(0)).toNumber())}
                        </span>
                    </div>
                )}
            </div>

            <GlassModal
                isOpen={isAddingPart}
                onClose={handleCloseModal}
                title={t('title')}
                className="max-w-lg"
            >
                <div className="space-y-6 py-4">
                    {/* Mode Toggle */}
                    <div className="flex bg-muted p-1.5 rounded-2xl border border-border mb-6">
                        {(['part', 'service', 'transfer'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setUsageType(mode)}
                                className={cn(
                                    "flex-1 py-3 text-sm font-black rounded-xl transition-all duration-300",
                                    usageType === mode 
                                        ? "bg-background text-foreground shadow-sm" 
                                        : "text-muted-foreground hover:text-foreground"
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
                                            onChange={(val) => {
                                                setSelectedProductId(val);
                                                // Clear search when selected to avoid loops, but keep it if we want to filter more?
                                                // For now, simple selection is enough.
                                            }}
                                            onSearch={(query) => setSearchQuery(query)}
                                            placeholder="اختر القطعة..."
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-black text-muted-foreground mr-2">الكمية المنقولة</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                className="bg-muted/30 border-input text-foreground h-14 rounded-xl text-center text-lg font-black focus:border-primary transition-all font-mono"
                                                value={quantity}
                                                onChange={e => setQuantity(Number(e.target.value))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-black text-muted-foreground mr-2">تسعير النقل للمهندس</Label>
                                            <div className="grid grid-cols-2 gap-2 bg-muted/40 p-2 rounded-2xl border border-border">
                                                <button
                                                    onClick={() => setTransferPriceChoice("COST")}
                                                    className={cn("py-3 rounded-xl border transition-all text-sm font-black", transferPriceChoice === "COST" ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 shadow-sm" : "border-transparent text-muted-foreground hover:bg-muted font-bold")}
                                                >
                                                    بسعر التكلفة {selectedProduct ? `(${formatCurrencyCtx(selectedProduct.costPrice)})` : ''}
                                                </button>
                                                <button
                                                    onClick={() => setTransferPriceChoice("SELL_1")}
                                                    className={cn("py-3 rounded-xl border transition-all text-sm font-black", transferPriceChoice === "SELL_1" ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-700 dark:text-cyan-400 shadow-sm" : "border-transparent text-muted-foreground hover:bg-muted font-bold")}
                                                >
                                                    بالسعر 1 {selectedProduct ? `(${formatCurrencyCtx(selectedProduct.sellPrice)})` : ''}
                                                </button>
                                            </div>
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
                                    onSearch={(query) => setSearchQuery(query)}
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
                                    <Label className="text-xs font-black text-muted-foreground mr-2">{t('priceTier')}</Label>
                                    <div className="grid grid-cols-3 gap-2 bg-muted/40 p-2 rounded-2xl border border-border">
                                        {(['A', 'B', 'C'] as const).map((tier) => {
                                            const price = tier === 'A' ? Number(selectedProduct.sellPrice) :
                                                         tier === 'B' ? Number(selectedProduct.sellPrice2 || selectedProduct.sellPrice) :
                                                         Number(selectedProduct.sellPrice3 || selectedProduct.sellPrice);
                                            
                                            const isSelected = selectedPriceTier === tier;

                                            return (
                                                <button
                                                    key={tier}
                                                    onClick={() => setSelectedPriceTier(tier)}
                                                    className={cn(
                                                        "flex flex-col items-center justify-center py-3 rounded-xl border transition-all",
                                                        isSelected 
                                                            ? "bg-primary/10 border-primary/50 text-primary shadow-sm" 
                                                            : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/70"
                                                    )}
                                                >
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] mb-1 opacity-60">
                                                        {tier === 'A' ? 'S' : tier === 'B' ? 'M' : 'L'} Tier
                                                    </span>
                                                    <span className="text-sm font-black tabular-nums">{formatCurrencyCtx(Number(price))}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {selectedProduct && (
                                <div className="space-y-2 mt-4 pt-4 border-t border-border/50">
                                    <Label className="text-xs font-black text-muted-foreground mr-2">تكلفة النقل على المهندس (العهدة)</Label>
                                    <div className="grid grid-cols-2 gap-2 bg-muted/40 p-2 rounded-2xl border border-border">
                                        <button
                                            onClick={() => setTransferPriceChoice("COST")}
                                            className={cn("py-3 rounded-xl border transition-all text-sm font-black flex flex-col items-center justify-center", transferPriceChoice === "COST" ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 shadow-sm" : "border-transparent text-muted-foreground hover:bg-muted font-bold")}
                                        >
                                            <span className="text-[10px] mb-1 opacity-60">سعر التكلفة الأساسي</span>
                                            {formatCurrencyCtx(selectedProduct.costPrice)}
                                        </button>
                                        <button
                                            onClick={() => setTransferPriceChoice("SELL_1")}
                                            className={cn("py-3 rounded-xl border transition-all text-sm font-black flex flex-col items-center justify-center", transferPriceChoice === "SELL_1" ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-700 dark:text-cyan-400 shadow-sm" : "border-transparent text-muted-foreground hover:bg-muted font-bold")}
                                        >
                                            <span className="text-[10px] mb-1 opacity-60">السعر 1</span>
                                            {formatCurrencyCtx(selectedProduct.sellPrice)}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label className="text-xs font-black text-muted-foreground mr-2">{t('quantity')}</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    className="bg-muted/30 border-input text-foreground h-14 rounded-xl text-center text-lg font-black focus:border-primary transition-all font-mono"
                                    value={quantity}
                                    onChange={e => setQuantity(Number(e.target.value))}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5 animate-in fade-in slide-in-from-left-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-black text-muted-foreground mr-2">{t('customName')}</Label>
                                <Input
                                    className="bg-muted/30 border-input text-foreground h-14 rounded-xl px-5 text-sm font-bold focus:border-primary transition-all"
                                    placeholder={t('customName')}
                                    value={serviceName}
                                    onChange={e => setServiceName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-black text-muted-foreground mr-2">{t('customPrice')}</Label>
                                <Input
                                    type="number"
                                    className="bg-muted/30 border-input text-foreground h-14 rounded-xl text-center text-lg font-black focus:border-primary transition-all font-mono"
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
                                usageType === 'transfer' ? "bg-emerald-500 text-black hover:bg-emerald-400 shadow-emerald-500/20" : "bg-primary text-primary-foreground hover:bg-primary/90"
                            )}
                        >
                            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : 
                             usageType === 'transfer' ? "تأكيد النقل للمهندس" : "إضافة البند للقائمة"}
                        </Button>
                        <Button variant="ghost" onClick={() => setIsAddingPart(false)} className="px-10 h-16 text-muted-foreground hover:text-foreground hover:bg-muted rounded-2xl font-bold">إلغاء</Button>
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
