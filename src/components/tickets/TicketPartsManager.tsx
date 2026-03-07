"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n-mock";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, RotateCcw, X, Save, AlertTriangle, Loader2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import GlassModal from "@/components/ui/GlassModal";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

import { addTicketPart, removeTicketPart, getProductsForSelector } from "@/actions/ticket-actions";

// Types
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
    technicianId?: string;
    technicianName?: string;
    technicianWarehouseId?: string;
    onUpdate?: () => void;
}

export default function TicketPartsManager({
    ticketId,
    parts,
    technicianId,
    technicianName,
    technicianWarehouseId,
    onUpdate
}: TicketPartsManagerProps) {
    const t = useTranslations("Tickets.PartsManager");
    const router = useRouter();
    const [isAddingPart, setIsAddingPart] = useState(false);
    const [usageType, setUsageType] = useState<"part" | "service">("part");
    const [isLoading, setIsLoading] = useState(false);

    // Data State
    const [products, setProducts] = useState<ProductData[]>([]);

    // Form State
    const [selectedProductId, setSelectedProductId] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [selectedPriceTier, setSelectedPriceTier] = useState<"A" | "B" | "C">("A");
    const [notes, setNotes] = useState("");

    // Service State
    const [serviceName, setServiceName] = useState("");
    const [servicePrice, setServicePrice] = useState(0);

    // Load products when modal opens
    useEffect(() => {
        if (isAddingPart) {
            loadData();
        }
    }, [isAddingPart]);

    const loadData = async () => {
        setIsLoading(true);
        const res = await getProductsForSelector(technicianWarehouseId);
        if (res.success) setProducts((res.data || []) as any);
        setIsLoading(false);
    };

    const selectedProduct = products.find(p => p.id === selectedProductId);

    const handleAdd = async () => {
        if (usageType === "part") {
            if (!selectedProductId || quantity <= 0) {
                toast.error("Please select a product and valid quantity");
                return;
            }
            if (selectedProduct && selectedProduct.stock < quantity) {
                toast.error(`Not enough stock! Available: ${selectedProduct.stock}`);
                return;
            }

            // Determine Price based on Tier
            let unitPrice = 0;
            if (selectedProduct) {
                if (selectedPriceTier === 'A') unitPrice = selectedProduct.sellPrice;
                else if (selectedPriceTier === 'B') unitPrice = selectedProduct.sellPrice2;
                else unitPrice = selectedProduct.sellPrice3;
            }

            const res = await addTicketPart(ticketId, {
                productId: selectedProductId,
                quantity,
                warehouseId: technicianWarehouseId || "main",
                price: unitPrice
            });

            if (res.success) {
                toast.success("Part added successfully");
                setIsAddingPart(false);
                resetForm();
                router.refresh();
                onUpdate?.();
            } else {
                toast.error((res as any).error || "Failed to add part");
            }

        } else {
            // Service Adding
            if (!serviceName.trim() || servicePrice < 0) {
                toast.error("Please enter a valid service name and price");
                return;
            }

            const res = await addTicketPart(ticketId, {
                name: serviceName,
                quantity: 1,
                price: servicePrice
            });

            if (res.success) {
                toast.success("Service added successfully");
                setIsAddingPart(false);
                resetForm();
                router.refresh();
                onUpdate?.();
            } else {
                toast.error((res as any).error || "Failed to add service");
            }
        }
    };

    const handleRemove = async (partId: string) => {
        if (!confirm("Are you sure you want to remove this item? Stock will be returned to inventory.")) return;
        const res = await removeTicketPart(partId, technicianWarehouseId);
        if (res.success) {
            toast.success("Item removed and stock restored");
            router.refresh();
            onUpdate?.();
        } else toast.error((res as any).error);
    };

    const resetForm = () => {
        setSelectedProductId("");
        setQuantity(1);
        setNotes("");
        setServiceName("");
        setServicePrice(0);
    }

    const productOptions = products.map(p => ({
        label: `${p.name} (Stock: ${p.stock})`,
        value: p.name
    }));

    return (
        <Card className="solid-card bg-black/20 border-white/5">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-lg font-medium text-cyan-400 flex items-center gap-2">
                    <RotateCcw className="w-5 h-5" />
                    {t('title')}
                </CardTitle>
                <Button size="lg" onClick={() => setIsAddingPart(true)} className="bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 border-cyan-500/30">
                    <Plus className="w-5 h-5 mr-2" /> {t('add')}
                </Button>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {parts.length === 0 ? (
                        <div className="text-center py-6 text-zinc-500 text-sm italic border border-dashed border-white/10 rounded-lg">
                            {t('noParts')}
                        </div>
                    ) : (
                        parts.map((part) => (
                            <div key={part.id} className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors">
                                <div>
                                    <div className="font-medium text-zinc-200">
                                        {part.product?.name || (part as any).name || "Unknown Item"}
                                    </div>
                                    <div className="text-xs text-zinc-500 flex items-center gap-2">
                                        {part.productId ? (
                                            <>Qty: {part.quantity} × {formatCurrency(Number(part.price))}</>
                                        ) : (
                                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-purple-500/30 text-purple-400 bg-purple-500/10">Service</Badge>
                                        )}
                                        {(part as any).addedBy && (
                                            <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded border border-white/5 font-medium">
                                                By: {(part as any).addedBy?.name || (part as any).addedBy?.username}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-sm font-bold text-cyan-400">
                                        {formatCurrency(part.quantity * Number(part.price))}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                        onClick={() => handleRemove(part.id)}
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}

                    {parts.length > 0 && (
                        <div className="pt-4 border-t border-white/10 flex justify-between items-center px-2">
                            <span className="text-sm text-zinc-400">{t('totalconsumption')}</span>
                            <span className="text-lg font-bold text-cyan-400">
                                {formatCurrency(parts.reduce((acc, p) => acc + (p.quantity * Number(p.price)), 0))}
                            </span>
                        </div>
                    )}
                </div>
            </CardContent>

            <GlassModal
                isOpen={isAddingPart}
                onClose={() => setIsAddingPart(false)}
                title={t('modalTitle')}
                className="max-w-lg"
            >
                <div className="space-y-6 py-4">
                    <div className="flex gap-4 p-1 bg-black/20 rounded-lg">
                        <Button
                            variant="ghost"
                            className={`flex-1 ${usageType === 'part' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-500'}`}
                            onClick={() => setUsageType('part')}
                        >
                            {t('selectItem')}
                        </Button>
                        <Button
                            variant="ghost"
                            className={`flex-1 ${usageType === 'service' ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-500'}`}
                            onClick={() => setUsageType('service')}
                        >
                            {t('customEntry')}
                        </Button>
                    </div>

                    {usageType === 'part' ? (
                        <>
                            <div className="space-y-2">
                                <Label>{t('selectProduct')}</Label>
                                <SearchableSelect
                                    options={productOptions}
                                    value={selectedProduct?.name || ""}
                                    onChange={(nameVal) => {
                                        const found = products.find(p => p.name === nameVal);
                                        if (found) setSelectedProductId(found.id);
                                    }}
                                    placeholder={t('searchPlaceholder')}
                                />
                                {selectedProduct && (
                                    <div className="flex items-center justify-between text-xs px-1">
                                        <span className={selectedProduct.stock > 0 ? "text-green-400" : "text-red-400"}>
                                            In Stock: {selectedProduct.stock}
                                        </span>
                                        <span className="text-zinc-400">SKU: {selectedProduct.sku}</span>
                                    </div>
                                )}
                            </div>

                            {selectedProduct && (
                                <div className="space-y-2">
                                    <Label>Price Tier</Label>
                                    <div className="grid grid-cols-3 gap-2 bg-black/40 p-1 rounded-lg">
                                        {(['A', 'B', 'C'] as const).map((tier) => {
                                            const price = tier === 'A' ? selectedProduct.sellPrice :
                                                tier === 'B' ? selectedProduct.sellPrice2 :
                                                    selectedProduct.sellPrice3;

                                            const isSelected = selectedPriceTier === tier;

                                            return (
                                                <button
                                                    key={tier}
                                                    onClick={() => setSelectedPriceTier(tier)}
                                                    className={`
                                                        relative flex flex-col items-center justify-center py-2 px-1 rounded-md text-sm transition-all border
                                                        ${isSelected
                                                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                                                            : 'bg-transparent border-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}
                                                    `}
                                                >
                                                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 mb-0.5">Tier {tier}</span>
                                                    <span className={`font-bold ${isSelected ? 'text-white' : ''}`}>{formatCurrency(Number(price))}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>{t('quantity')}</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={quantity}
                                    onChange={e => setQuantity(Number(e.target.value))}
                                    className="solid-input bg-black/40 border-white/10"
                                />
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="bg-purple-500/10 border border-purple-500/20 p-3 rounded-lg text-xs text-purple-200 mb-2">
                                <AlertTriangle className="w-3 h-3 inline mr-1" />
                                {t('customWarning') || "Manual entry bypasses stock control. Use for services only."}
                            </div>
                            <div className="space-y-2">
                                <Label>{t('serviceName')}</Label>
                                <Input
                                    placeholder={t('servicePlaceholder')}
                                    className="solid-input bg-black/40 border-white/10"
                                    value={serviceName}
                                    onChange={(e) => setServiceName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t('priceCharge')}</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    className="solid-input font-bold text-green-400 bg-black/40 border-white/10"
                                    value={servicePrice}
                                    onChange={(e) => setServicePrice(Number(e.target.value))}
                                />
                            </div>
                        </div>
                    )}

                    <div className="pt-4 flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsAddingPart(false)} className="text-zinc-400">{t('cancel')}</Button>
                        <Button onClick={handleAdd} className="bg-cyan-600 hover:bg-cyan-500 text-white">
                            <Save className="w-4 h-4 mr-2" />
                            {t('confirm')}
                        </Button>
                    </div>
                </div>
            </GlassModal>
        </Card>
    );
}
