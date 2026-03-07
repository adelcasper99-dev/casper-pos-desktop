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
    ArrowDown
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
};

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
    const [sourceId, setSourceId] = useState<string>(initialSourceId || '');
    const [destinationId, setDestinationId] = useState<string>('');
    const [sourceItems, setSourceItems] = useState<any[]>([]);
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
                toast.error("Failed to load inventory");
                setSourceItems([]);
            }
        } catch (error) {
            console.error("Error loading stock:", error);
            toast.error("Error loading stock");
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

    const addToStaging = (item: any) => {
        setStagingItems(prev => {
            const existing = prev.find(p => p.id === item.id);
            if (existing) {
                if (existing.transferQty < existing.availableQty) {
                    return prev.map(p => p.id === item.id ? { ...p, transferQty: p.transferQty + 1 } : p);
                }
                toast.error(`Max quantity reached (${existing.availableQty})`);
                return prev;
            }
            return [...prev, {
                id: item.id,
                productId: item.productId,
                productName: item.product.name,
                sku: item.product.sku,
                availableQty: item.quantity,
                transferQty: 1,
                price: Number(item.product.sellPrice)
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
            toast.error("Select Source and Destination");
            return;
        }
        if (stagingItems.length === 0) {
            toast.error("No items selected");
            return;
        }

        const source = availableSources.find(s => s.id === sourceId);
        const dest = availableDestinations.find(d => d.id === destinationId);

        if (!source || !dest) return;
        if (source.id === dest.id) {
            toast.error("Cannot transfer to same entity");
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
                    quantity: i.transferQty
                })),
                csrfToken
            });

            if (res?.success) {
                toast.success(res.message);
                onTransferComplete();
                onClose();
            } else {
                toast.error(res?.message || "Transfer failed");
            }
        } catch (error: any) {
            console.error("Transfer Error:", error);
            toast.error(error.message || "Failed to transfer");
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalItems = stagingItems.reduce((acc, item) => acc + item.transferQty, 0);

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title={null}
            className="max-w-7xl h-[90vh] flex flex-col p-0 overflow-hidden bg-zinc-950"
        >
            <div className="flex flex-col md:flex-row items-center p-6 border-b border-white/10 bg-zinc-900/50 gap-6">
                <div className="flex-1 w-full">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">From (Source)</label>
                    <Select value={sourceId} onValueChange={setSourceId}>
                        <SelectTrigger className="h-14 bg-black/40 border-white/10 text-white text-lg rounded-xl">
                            <SelectValue placeholder="Select Source..." />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white max-h-[400px]">
                            <div className="p-2 text-xs text-zinc-500 font-bold uppercase">Technicians</div>
                            {availableSources?.filter(s => s.type === 'ENGINEER').map(s => (
                                <SelectItem key={s.id} value={s.id} className="py-3 text-base">{s.name}</SelectItem>
                            ))}
                            <div className="p-2 text-xs text-zinc-500 font-bold uppercase border-t border-white/10 mt-2 pt-2">Warehouses</div>
                            {availableSources?.filter(s => s.type === 'WAREHOUSE').map(s => (
                                <SelectItem key={s.id} value={s.id} className="py-3 text-base">{s.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="hidden md:block text-zinc-600">
                    <ArrowRight className="w-8 h-8" />
                </div>
                <div className="md:hidden text-zinc-600">
                    <ArrowDown className="w-8 h-8" />
                </div>

                <div className="flex-1 w-full">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">To (Destination)</label>
                    <Select value={destinationId} onValueChange={setDestinationId}>
                        <SelectTrigger className="h-14 bg-black/40 border-white/10 text-white text-lg rounded-xl">
                            <SelectValue placeholder="Select Destination..." />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white max-h-[400px]">
                            <div className="p-2 text-xs text-zinc-500 font-bold uppercase">Technicians</div>
                            {availableDestinations?.filter(s => s.type === 'ENGINEER').map(s => (
                                <SelectItem key={s.id} value={s.id} className="py-3 text-base">{s.name}</SelectItem>
                            ))}
                            <div className="p-2 text-xs text-zinc-500 font-bold uppercase border-t border-white/10 mt-2 pt-2">Warehouses</div>
                            {availableDestinations?.filter(s => s.type === 'WAREHOUSE').map(s => (
                                <SelectItem key={s.id} value={s.id} className="py-3 text-base">{s.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
                <div className="flex-1 flex flex-col border-r border-white/10 bg-black/20">
                    <div className="p-4 border-b border-white/10">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
                            <Input
                                placeholder="Search products..."
                                className="pl-10 bg-black/20 border-white/10 h-12 text-lg text-white rounded-lg"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto">
                        <Table>
                            <TableHeader className="bg-zinc-900/50 sticky top-0 z-10">
                                <TableRow className="hover:bg-transparent border-white/5">
                                    <TableHead className="text-zinc-400">Product</TableHead>
                                    <TableHead className="text-zinc-400 w-[100px]">SKU</TableHead>
                                    <TableHead className="text-right text-zinc-400 w-[100px]">Avail</TableHead>
                                    <TableHead className="w-[100px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingSource ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-40 text-center text-zinc-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <Loader2 className="w-5 h-5 animate-spin" /> Loading stock...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredItems.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-40 text-center text-zinc-500">
                                            {sourceId ? "No items found" : "Select a source to view stock"}
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
                                                className={`border-white/5 transition-colors ${remain === 0 ? 'opacity-40 bg-zinc-900/50' : 'hover:bg-white/5'}`}
                                            >
                                                <TableCell className="font-medium text-white py-4">
                                                    {item.product.name}
                                                </TableCell>
                                                <TableCell className="text-zinc-500 font-mono text-xs">{item.product.sku}</TableCell>
                                                <TableCell className="text-right font-mono font-bold text-cyan-400 text-lg">
                                                    {remain}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => addToStaging(item)}
                                                        disabled={remain === 0}
                                                        className="bg-zinc-800 hover:bg-cyan-600 text-white rounded-full w-8 h-8 p-0"
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

                <div className="w-full md:w-[450px] flex flex-col bg-zinc-900/50 border-l border-white/10 shadow-2xl">
                    <div className="p-4 border-b border-white/10 bg-zinc-900 flex justify-between items-center">
                        <div className="flex items-center gap-2 text-white font-bold">
                            <Package className="w-5 h-5 text-purple-400" />
                            Transfer List
                        </div>
                        <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded text-xs font-mono">
                            {stagingItems.length}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {stagingItems.map(item => (
                            <div key={item.id} className="bg-zinc-950 p-4 rounded-xl border border-white/10 shadow-sm flex flex-col gap-3">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="font-medium text-white line-clamp-1">{item.productName}</div>
                                        <div className="text-xs text-zinc-500 font-mono">{item.sku}</div>
                                    </div>
                                    <button onClick={() => removeFromStaging(item.id)} className="text-zinc-600 hover:text-red-400">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between bg-zinc-900/50 rounded-lg p-1.5">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => updateStagingQty(item.id, -1)}
                                        className="h-8 w-8 rounded hover:bg-white/10 text-white"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </Button>
                                    <span className="text-xl font-bold font-mono text-white">{item.transferQty}</span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => updateStagingQty(item.id, 1)}
                                        className="h-8 w-8 rounded hover:bg-white/10 text-white"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {stagingItems.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-600 opacity-50">
                                <ArrowRightLeft className="w-12 h-12 mb-3" />
                                <p>No items selected</p>
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-zinc-900 border-t border-white/10">
                        <Button
                            onClick={handleConfirmTransfer}
                            disabled={isSubmitting || stagingItems.length === 0 || !destinationId || !sourceId}
                            className={`w-full h-14 text-lg font-bold rounded-xl shadow-lg transition-all ${stagingItems.length > 0 && destinationId && sourceId
                                ? 'bg-gradient-to-r from-cyan-600 to-purple-600 hover:scale-[1.02]'
                                : 'bg-zinc-800 text-zinc-500'
                                }`}
                        >
                            {isSubmitting ? (
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" /> Transferring...
                                </div>
                            ) : (
                                `Confirm (${totalItems})`
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </GlassModal>
    );
}
