"use client";

import { useTranslations } from "@/lib/i18n-mock";
import { Trash2, History, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useState } from "react";
import { getProductPriceHistory } from "@/actions/inventory";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface InvoiceItem {
    id: string; // Product ID
    name: string;
    sku: string;
    productId?: string; // Actual ID in DB
    quantity: number;
    unitCost: number;
    sellPrice?: number;
    sellPrice2?: number;
    sellPrice3?: number;
    isNew?: boolean; // If true, create product on save
    categoryId?: string; // Required if isNew
}

interface PurchaseItemsTableProps {
    items: InvoiceItem[];
    onRemoveItem: (id: string) => void;
    onUpdateItem: (id: string, updates: Partial<InvoiceItem>) => void;
    currencySymbol?: string;
}

function PriceHistoryPopover({ productId, name }: { productId: string, name: string }) {
    const t = useTranslations('Purchasing');
    const [history, setHistory] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);

    const handleOpen = async (open: boolean) => {
        if (open && !history) {
            setLoading(true);
            const res = await getProductPriceHistory(productId);
            if (res.success && res.history) {
                setHistory(res.history);
            }
            setLoading(false);
        }
    };

    return (
        <Popover onOpenChange={handleOpen}>
            <PopoverTrigger asChild>
                <button className="p-1 hover:bg-cyan-500/10 text-cyan-500 rounded-md transition-colors" title={t('priceHistory')}>
                    <History className="w-3.5 h-3.5" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0 bg-popover border border-border shadow-2xl rounded-xl overflow-hidden" align="end">
                <div className="bg-muted/50 p-2.5 border-b border-border">
                    <h4 className="text-xs font-bold flex items-center gap-2">
                        <History className="w-3.5 h-3.5 text-cyan-500" />
                        {t('priceHistory')}
                    </h4>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{name}</p>
                </div>
                <div className="p-1 max-h-60 overflow-y-auto">
                    {loading ? (
                        <div className="p-6 flex flex-col items-center gap-2 text-muted-foreground">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-[10px]">{t('loading')}</span>
                        </div>
                    ) : !history || history.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-[10px] italic">
                            No history found.
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {history.map((h) => (
                                <div key={h.id} className="p-2 hover:bg-muted/30 transition-colors text-[11px] flex justify-between items-center">
                                    <div className="flex flex-col gap-0.5">
                                        <div className="font-bold text-foreground">{h.supplierName}</div>
                                        <div className="text-[9px] text-muted-foreground">{new Date(h.date).toLocaleDateString()}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold font-mono text-cyan-500">{h.unitCost.toFixed(2)} EGP</div>
                                        <div className="text-[9px] text-muted-foreground">{h.invoiceNumber}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export function PurchaseItemsTable({
    items,
    onRemoveItem,
    onUpdateItem,
    currencySymbol = "EGP"
}: PurchaseItemsTableProps) {
    const t = useTranslations('Purchasing');

    return (
        <div className="bg-muted/40 rounded-xl border border-white/10 overflow-hidden min-h-[150px] flex flex-col">
            {/* Table Header */}
            <div className="grid grid-cols-12 bg-muted/60 p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-4">{t('itemSku')}</div>
                <div className="col-span-2 text-center">{t('qty')}</div>
                <div className="col-span-2 text-right">{t('cost')}</div>
                <div className="col-span-2 text-right">{t('price')} (1/2/3)</div>
                <div className="col-span-2 text-right">{t('total')}</div>
            </div>

            {/* Table Body */}
            {items.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground/50 text-sm italic border-t border-white/5">
                    {t('noInvoices') || "No items added yet"}
                </div>
            ) : (
                <div className="divide-y divide-border">
                    {items.map((item, index) => (
                        <div key={`${item.id}-${index}`} className="grid grid-cols-12 p-3 items-center hover:bg-muted/30 transition-colors group text-sm">
                            <div className="col-span-4">
                                <div className="font-bold text-foreground">
                                    {item.name}
                                    {item.isNew && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-500">
                                            {t('newItem')}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                            </div>
                            <div className="col-span-2 text-center">
                                <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => onUpdateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                    className="bg-background border border-border w-16 px-1 py-1 rounded-md font-mono text-center focus:outline-none focus:border-cyan-500 transition-colors"
                                />
                            </div>
                            <div className="col-span-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                    {!item.isNew && item.productId && (
                                        <PriceHistoryPopover productId={item.productId} name={item.name} />
                                    )}
                                    <span className="text-muted-foreground text-[10px]">{currencySymbol}</span>
                                    <input
                                        type="number"
                                        value={item.unitCost}
                                        onChange={(e) => onUpdateItem(item.id, { unitCost: parseFloat(e.target.value) || 0 })}
                                        className="bg-background border border-border w-24 px-1 py-1 rounded-md font-mono text-right focus:outline-none focus:border-cyan-500 transition-colors"
                                    />
                                </div>
                            </div>
                            <div className="col-span-2 text-right text-xs text-muted-foreground">
                                <div className="font-mono">{item.sellPrice?.toFixed(2) || '-'}</div>
                                {(item.sellPrice2 || item.sellPrice3) && (
                                    <div className="opacity-60 text-[10px]">
                                        {item.sellPrice2?.toFixed(2)} / {item.sellPrice3?.toFixed(2)}
                                    </div>
                                )}
                            </div>
                            <div className="col-span-2 flex items-center justify-end gap-3">
                                <div className="font-bold font-mono text-foreground">
                                    {currencySymbol}{(item.quantity * item.unitCost).toFixed(2)}
                                </div>
                                <button
                                    onClick={() => onRemoveItem(item.id)}
                                    className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
