"use client";

import { useTranslations } from "@/lib/i18n-mock";
import { Trash2 } from "lucide-react";
import { clsx } from "clsx";

interface InvoiceItem {
    id: string; // Product ID
    name: string;
    sku: string;
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
    currencySymbol?: string;
}

export function PurchaseItemsTable({
    items,
    onRemoveItem,
    currencySymbol = "$"
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
                                            NEW
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                            </div>
                            <div className="col-span-2 text-center">
                                <span className="bg-background border border-border px-2 py-1 rounded-md font-mono">
                                    {item.quantity}
                                </span>
                            </div>
                            <div className="col-span-2 text-right font-mono text-muted-foreground">
                                {currencySymbol}{item.unitCost.toFixed(2)}
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
