'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    ArrowRightLeft,
    Search,
    Package,
    X,
    Plus,
    Minus,
    Loader2,
    ArrowRight,
    ArrowDown,
    CheckCircle2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { toast } from 'sonner';
import { getEngineerStock } from "@/actions/engineer-actions";
import { transferStock } from "@/actions/inventory-transfer";
import GlassModal from "@/components/ui/GlassModal";

import { useTranslations } from '@/lib/i18n-mock';

type EntityType = 'ENGINEER' | 'WAREHOUSE';

export type TransferEntity = {
    id: string;
    name: string;
    type: EntityType;
    warehouseId?: string;
};

type TransferItem = {
    id: string;
    productId: string;
    productName: string;
    sku: string;
    availableQty: number;
    transferQty: number;
    price: number;
    costPrice?: number;
    sellPrice?: number;
    sellPrice2?: number;
    sellPrice3?: number;
    priceTier?: string;
};

export interface StockWithProduct {
    id: string;
    productId: string;
    quantity: number;
    product: {
        name: string;
        sku: string;
        costPrice: number | string;
        sellPrice: number | string;
        sellPrice2?: number | string;
        sellPrice3?: number | string;
    };
}

type TransferConsoleProps = {
    isOpen: boolean;
    onClose: () => void;
    availableSources: TransferEntity[];
    availableDestinations: TransferEntity[];
    initialSourceId?: string;
    onTransferComplete: () => void;
    csrfToken?: string;
};

export default function TransferConsole({
    isOpen,
    onClose,
    availableSources,
    availableDestinations,
    initialSourceId,
    onTransferComplete,
    csrfToken
}: TransferConsoleProps) {
    const t = useTranslations('Tickets.engineers.transfer');
    const [sourceId, setSourceId] = useState<string>(initialSourceId || '');
    const [destinationId, setDestinationId] = useState<string>('');
    const [sourceItems, setSourceItems] = useState<StockWithProduct[]>([]);
    const [stagingItems, setStagingItems] = useState<TransferItem[]>([]);
    const [loadingSource, setLoadingSource] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && initialSourceId) {
            setSourceId(initialSourceId);
        }
    }, [isOpen, initialSourceId]);

    useEffect(() => {
        if (sourceId) {
            const source = availableSources?.find(s => s.id === sourceId);
            if (source?.warehouseId) {
                loadSourceItems(source.warehouseId);
            } else if (source?.type === 'WAREHOUSE') {
                loadSourceItems(source.id);
            } else {
                setSourceItems([]);
            }
            setStagingItems([]);
        } else {
            setSourceItems([]);
        }
    }, [sourceId, availableSources]);


    async function loadSourceItems(warehouseId: string) {
        setLoadingSource(true);
        try {
            const res = await getEngineerStock(warehouseId);
            if (res.success && res.data) {
                setSourceItems(res.data);
            } else {
                toast.error(t('errors.loadFailed'));
                setSourceItems([]);
            }
        } catch (error) {
            console.error("Error loading stock:", error);
            toast.error(t('errors.loadFailed'));
        } finally {
            setLoadingSource(false);
        }
    }

    const filteredItems = useMemo(() => {
        if (!searchQuery) return sourceItems;
        const lowerQ = searchQuery.toLowerCase();
        return sourceItems.filter(item =>
            item.product.name.toLowerCase().includes(lowerQ) ||
            item.product.sku.toLowerCase().includes(lowerQ)
        );
    }, [sourceItems, searchQuery]);

    const addToStaging = (item: StockWithProduct) => {
        setStagingItems(prev => {
            const existing = prev.find(p => p.id === item.id);
            if (existing) {
                if (existing.transferQty < existing.availableQty) {
                    return prev.map(p => p.id === item.id ? { ...p, transferQty: p.transferQty + 1 } : p);
                }
                toast.error(t('errors.maxReached', { max: existing.availableQty }));
                return prev;
            }
            return [...prev, {
                id: item.id,
                productId: item.productId,
                productName: item.product.name,
                sku: item.product.sku,
                availableQty: item.quantity,
                transferQty: 1,
                price: Number(item.product.sellPrice),
                costPrice: Number(item.product.costPrice),
                sellPrice: Number(item.product.sellPrice),
                sellPrice2: Number(item.product.sellPrice2),
                sellPrice3: Number(item.product.sellPrice3),
                priceTier: 'Cost'
            }];
        });
    };

    const removeFromStaging = (itemId: string) => {
        setStagingItems(prev => prev.filter(p => p.id !== itemId));
    };

    const updateStagingQty = (itemId: string, delta: number) => {
        setStagingItems(prev => prev.map(p => {
            if (p.id !== itemId) return p;
            const newQty = p.transferQty + delta;
            if (newQty > p.availableQty) return p;
            if (newQty < 1) return p;
            return { ...p, transferQty: newQty };
        }));
    };

    const handleConfirmTransfer = async () => {
        if (!sourceId || !destinationId) {
            toast.error(t('errors.selectRequired'));
            return;
        }
        if (stagingItems.length === 0) {
            toast.error(t('errors.noItemsSelected'));
            return;
        }

        const source = availableSources.find(s => s.id === sourceId);
        const dest = availableDestinations.find(d => d.id === destinationId);

        if (!source || !dest) return;
        if (source.id === dest.id) {
            toast.error(t('errors.sameEntity'));
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await transferStock({
                sourceId: source.id,
                sourceType: source.type,
                destinationId: dest.id,
                destinationType: dest.type,
                items: stagingItems.map(i => ({
                    productId: i.productId,
                    quantity: i.transferQty,
                    priceTier: i.priceTier

                })),
                csrfToken
            });

            if (res?.success) {
                toast.success(res.message);
                onTransferComplete();
                onClose();
            } else {
                toast.error(t('errors.failed'));
            }
        } catch (error: any) {
            console.error("Transfer Error:", error);
            toast.error(t('errors.failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalItems = stagingItems.reduce((acc, item) => acc + Number(item.transferQty), 0);

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title={null}
            className="max-w-7xl h-[90vh] flex flex-col p-0 overflow-hidden bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl"
        >
            <div className="flex flex-col md:flex-row items-center p-8 border-b border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-zinc-900/50 gap-8">
                <div className="flex-1 w-full">
                    <label className="text-[10px] font-black text-slate-500 dark:text-zinc-500 uppercase tracking-widest mb-2.5 block">من</label>
                    <Select value={sourceId} onValueChange={setSourceId}>
                        <SelectTrigger className="h-16 bg-white dark:bg-black/40 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-xl font-black rounded-2xl shadow-sm focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20">
                            <SelectValue placeholder="اختر المصدر" />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-800 text-slate-900 dark:text-white max-h-[400px] rounded-2xl shadow-2xl">
                            <div className="p-3 text-[10px] text-slate-400 dark:text-zinc-500 font-black uppercase tracking-wider">الفنيون</div>
                            {availableSources?.filter(s => s.type === 'ENGINEER').map(s => (
                                <SelectItem key={s.id} value={s.id} className="py-4 text-base font-black focus:bg-slate-50 dark:focus:bg-white/5">{s.name}</SelectItem>
                            ))}
                            <div className="p-3 text-[10px] text-slate-400 dark:text-zinc-500 font-black uppercase border-t border-slate-200 dark:border-white/10 mt-2 pt-3 tracking-wider">المخازن</div>
                            {availableSources?.filter(s => s.type === 'WAREHOUSE').map(s => (
                                <SelectItem key={s.id} value={s.id} className="py-4 text-base font-black focus:bg-slate-50 dark:focus:bg-white/5">{s.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="hidden md:block text-slate-300 dark:text-zinc-600">
                    <ArrowRightLeft className="w-10 h-10" />
                </div>
                <div className="md:hidden text-slate-300 dark:text-zinc-600">
                    <ArrowDown className="w-10 h-10" />
                </div>

                <div className="flex-1 w-full">
                    <label className="text-[10px] font-black text-slate-500 dark:text-zinc-500 uppercase tracking-widest mb-2.5 block">إلى</label>
                    <Select value={destinationId} onValueChange={setDestinationId}>
                        <SelectTrigger className="h-16 bg-white dark:bg-black/40 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-xl font-black rounded-2xl shadow-sm focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20">
                            <SelectValue placeholder="اختر الوجهة" />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-800 text-slate-900 dark:text-white max-h-[400px] rounded-2xl shadow-2xl">
                            <div className="p-3 text-[10px] text-slate-400 dark:text-zinc-500 font-black uppercase tracking-wider">الفنيون</div>
                            {availableDestinations?.filter(s => s.type === 'ENGINEER').map(s => (
                                <SelectItem key={s.id} value={s.id} className="py-4 text-base font-black focus:bg-slate-50 dark:focus:bg-white/5">{s.name}</SelectItem>
                            ))}
                            <div className="p-3 text-[10px] text-slate-400 dark:text-zinc-500 font-black uppercase border-t border-slate-200 dark:border-white/10 mt-2 pt-3 tracking-wider">المخازن</div>
                            {availableDestinations?.filter(s => s.type === 'WAREHOUSE').map(s => (
                                <SelectItem key={s.id} value={s.id} className="py-4 text-base font-black focus:bg-slate-50 dark:focus:bg-white/5">{s.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
                <div className="flex-1 flex flex-col border-r border-slate-300 dark:border-white/10 bg-white dark:bg-black/20">
                    <div className="p-5 border-b border-slate-200 dark:border-white/10">
                        <div className="relative group/search">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 w-5 h-5 rtl:left-auto rtl:right-3 group-focus-within/search:text-black dark:group-focus-within/search:text-white transition-colors" />
                            <Input
                                placeholder="بحث..."
                                className="pl-10 bg-slate-50 dark:bg-black/20 border-slate-300 dark:border-white/10 h-14 text-lg text-slate-900 dark:text-white rounded-xl font-black focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 rtl:pl-4 rtl:pr-10"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto zebra-table">
                        <Table>
                            <TableHeader className="bg-slate-100 dark:bg-zinc-900/50 sticky top-0 z-10 border-b border-slate-300 dark:border-white/10 shadow-sm">
                                <TableRow className="hover:bg-transparent border-0">
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 py-4 px-6">المنتج</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 py-4 px-6 w-[120px]">SKU</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 py-4 px-6 w-[120px]">المتاح</TableHead>
                                    <TableHead className="w-[80px] py-4 px-6"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingSource ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-40 text-center text-zinc-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <Loader2 className="w-5 h-5 animate-spin" /> جاري التحميل...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredItems.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-40 text-center text-zinc-500">
                                            {sourceId ? "لا توجد نتائج" : "اختر المصدر لعرض المنتجات"}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredItems.map(item => {
                                        const staging = stagingItems.find(s => s.id === item.id);
                                        const stagedQty = staging ? staging.transferQty : 0;
                                        const remain = item.quantity - stagedQty;

                                        return (
                                            <TableRow
                                                key={item.id}
                                                className={`transition-all border-0 ${remain === 0 ? 'opacity-40 bg-slate-50 dark:bg-zinc-900/50' : ''}`}
                                            >
                                                <TableCell className="font-black text-slate-900 dark:text-white py-5 px-6">
                                                    {item.product.name}
                                                </TableCell>
                                                <TableCell className="text-slate-400 dark:text-zinc-500 font-black text-xs px-6 uppercase tracking-tighter">{item.product.sku}</TableCell>
                                                <TableCell className="text-right font-black text-black dark:text-white text-lg px-6">
                                                    {remain}
                                                </TableCell>
                                                <TableCell className="px-6 text-right">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => addToStaging(item)}
                                                        disabled={remain === 0}
                                                        className="bg-slate-100 dark:bg-zinc-800 hover:bg-black dark:hover:bg-white text-slate-900 dark:text-black hover:text-white dark:hover:text-black rounded-xl w-10 h-10 p-0 shadow-sm border border-slate-300 dark:border-0 transition-transform active:scale-90"
                                                    >
                                                        <Plus className="w-5 h-5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="w-full md:w-[480px] flex flex-col bg-slate-100 dark:bg-zinc-900/50 border-l border-slate-300 dark:border-white/10 shadow-2xl">
                    <div className="p-5 border-b border-slate-300 dark:border-white/10 bg-white dark:bg-zinc-900 flex justify-between items-center shadow-sm">
                        <div className="flex items-center gap-3 text-slate-900 dark:text-white font-black text-lg">
                            <div className="w-10 h-10 rounded-xl bg-slate-900/10 dark:bg-white/10 flex items-center justify-center">
                                <Package className="w-6 h-6 text-slate-900 dark:text-white" />
                            </div>
                            قائمة التحويل
                        </div>
                        <span className="bg-black dark:bg-white dark:text-black text-white px-3 py-1 rounded-lg text-xs font-black shadow-lg shadow-black/20">
                            {stagingItems.length}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {stagingItems.map(item => (
                            <div key={item.id} className="bg-white dark:bg-zinc-950 p-5 rounded-2xl border border-slate-300 dark:border-white/10 shadow-sm flex flex-col gap-4 group/item hover:border-cyan-500/30 transition-all">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="font-black text-slate-900 dark:text-white text-sm line-clamp-2 leading-tight">{item.productName}</div>
                                        <div className="text-[10px] font-black text-slate-400 dark:text-zinc-500 tracking-tighter mt-1">{item.sku}</div>
                                        <div className="flex flex-col gap-2 w-full mt-4">
                                            <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">تسعير النقل</span>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {['Cost', 'Sell 1', 'Sell 2', 'Sell 3'].map(tier => {
                                                    let val = item.costPrice ?? 0;
                                                    let tierLabel = 'تكلفة';
                                                    if (tier === 'Sell 1') { val = item.sellPrice ?? 0; tierLabel = 'مفرق'; }
                                                    if (tier === 'Sell 2') { val = item.sellPrice2 ?? 0; tierLabel = 'جملة'; }
                                                    if (tier === 'Sell 3') { val = item.sellPrice3 ?? 0; tierLabel = 'نص جملة'; }
                                                    
                                                    const isActive = (item.priceTier || 'Cost') === tier;
                                                    
                                                    return (
                                                <button 
                                                            key={tier}
                                                            onClick={() => {
                                                                const newItems = [...stagingItems];
                                                                const idx = newItems.findIndex(i => i.id === item.id);
                                                                if (idx !== -1) {
                                                                    newItems[idx].priceTier = tier;
                                                                    setStagingItems(newItems);
                                                                }
                                                            }}
                                                            className={`px-3 py-2 text-[9px] font-black rounded-lg border transition-all ${isActive ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-lg' : 'bg-slate-100 dark:bg-black/40 border-slate-300 dark:border-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/5'}`}
                                                        >
                                                            {tierLabel} ({val})
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => removeFromStaging(item.id)} className="w-8 h-8 flex items-center justify-center text-slate-300 dark:text-zinc-600 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-all font-black">
                                        ✕
                                    </button>
                                </div>

                                <div className="flex items-center justify-between bg-slate-100 dark:bg-zinc-950 p-1.5 rounded-xl border border-slate-300 dark:border-white/5 shadow-inner">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => updateStagingQty(item.id, -1)}
                                        className="h-10 w-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-black dark:hover:text-white transition-all shadow-sm"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </Button>
                                    <span className="text-2xl font-black text-slate-900 dark:text-white px-4">{item.transferQty}</span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => updateStagingQty(item.id, 1)}
                                        className="h-10 w-10 rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-white/10 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-500 transition-all shadow-sm"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {stagingItems.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-zinc-800 opacity-50 font-black py-20">
                                <ArrowRightLeft className="w-20 h-20 mb-5" />
                                <p className="uppercase tracking-[0.2em]">لا توجد قطع مضافة</p>
                            </div>
                        )}
                    </div>

                    <div className="p-6 bg-white dark:bg-zinc-900 border-t border-slate-300 dark:border-white/10 shadow-2xl z-20">
                        <Button
                            onClick={handleConfirmTransfer}
                            disabled={isSubmitting || stagingItems.length === 0 || !destinationId || !sourceId}
                            className={`w-full h-16 text-xl font-black rounded-2xl shadow-xl transition-all font-black tracking-tight transform active:scale-[0.98] ${stagingItems.length > 0 && destinationId && sourceId
                                ? 'bg-gradient-to-r from-slate-700 via-slate-900 to-black text-white shadow-black/25'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 border border-slate-300 dark:border-0'
                                }`}
                        >
                            {isSubmitting ? (
                                <div className="flex items-center gap-3">
                                    <Loader2 className="w-6 h-6 animate-spin" /> جاري التحويل...
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="w-6 h-6" />
                                    تأكيد التحويل ({totalItems})
                                </div>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </GlassModal>
    );
}


