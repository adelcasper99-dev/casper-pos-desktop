"use client";

import { useState } from "react";
import { Plus, Warehouse, MapPin, Eye, Package } from "lucide-react";
import GlassModal from "../ui/GlassModal";
import { createWarehouse, getWarehouseStock } from "@/actions/inventory";
import clsx from "clsx";

interface Warehouse {
    id: string;
    name: string;
    address: string | null;
    isDefault: boolean;
}

interface StockItem {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    sellPrice: number;
}

export default function WarehouseManager({ warehouses, csrfToken, branchId }: { warehouses: Warehouse[], csrfToken?: string, branchId?: string }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Create Form
    const [name, setName] = useState("");
    const [address, setAddress] = useState("");

    // View Stock State
    const [viewedWarehouse, setViewedWarehouse] = useState<Warehouse | null>(null);
    const [stockList, setStockList] = useState<StockItem[]>([]);
    const [stockLoading, setStockLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // If branchId is not provided (legacy global view?), we might error or handle it.
        // Plan says "contextual creation", so we assume branchId is present in Branch View.
        if (!branchId) {
             alert("Error: Branch Context Missing");
             setLoading(false);
             return;
        }
        const res = await createWarehouse({ name, address, csrfToken, branchId });
        setLoading(false);
        
        if (res.success) {
            setIsModalOpen(false);
            setName("");
            setAddress("");
        } else {
            alert(res.error || "Failed to create warehouse");
        }
    };

    const handleViewStock = async (warehouse: Warehouse) => {
        setViewedWarehouse(warehouse);
        setStockLoading(true);
        const res = await getWarehouseStock(warehouse.id);
        if (res.success && res.data) {
            setStockList(res.data);
        } else {
            setStockList([]);
        }
        setStockLoading(false);
    };

    const closeStockView = () => {
        setViewedWarehouse(null);
        setStockList([]);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-muted/50 p-4 rounded-2xl border border-border">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Warehouse className="w-5 h-5 text-cyan-400" />
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Warehouse Locations</h3>
                        <p className="text-xs text-muted-foreground">Manage physical inventory locations</p>
                    </div>
                </div>

                {branchId && (
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                    >
                        <Plus className="w-4 h-4" />
                        Add Location
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {warehouses.map((w) => (
                    <div key={w.id} className="glass-card p-5 group hover:border-cyan-500/30 transition-all flex flex-col justify-between h-40 bg-card border-border">
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <div className={clsx(
                                    "w-10 h-1 rounded-full mb-3",
                                    w.isDefault ? "bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" : "bg-muted-foreground/30"
                                )} />
                                {w.isDefault && <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full font-bold border border-cyan-500/20">MAIN</span>}
                            </div>

                            <h4 className="font-bold text-lg text-foreground mb-1 truncate">{w.name}</h4>

                            {w.address ? (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-muted-foreground" />
                                    {w.address}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground italic">No address set</p>
                            )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-border flex gap-2">
                            <button
                                onClick={() => handleViewStock(w)}
                                className="flex-1 text-xs bg-muted/50 hover:bg-muted text-muted-foreground py-2 rounded-lg flex items-center justify-center gap-2 transition-colors border border-border"
                            >
                                <Eye className="w-3 h-3" /> View Stock
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* CREATE MODAL */}
            <GlassModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Add New Warehouse"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">Name</label>
                        <input
                            className="glass-input w-full"
                            placeholder="e.g. Downtown Branch"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">Address</label>
                        <input
                            className="glass-input w-full"
                            placeholder="e.g. 123 Main St"
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 rounded-xl flex justify-center items-center gap-2"
                    >
                        {loading ? "Saving..." : <><Plus className="w-4 h-4" /> Create Warehouse</>}
                    </button>
                </form>
            </GlassModal>

            {/* VIEW STOCK MODAL */}
            <GlassModal
                isOpen={!!viewedWarehouse}
                onClose={closeStockView}
                title={`Stock in ${viewedWarehouse?.name || 'Warehouse'}`}
            >
                <div>
                    {stockLoading ? (
                        <div className="p-8 text-center text-muted-foreground">Loading stock...</div>
                    ) : (
                        <div className="overflow-hidden">
                            {stockList.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                                    <Package className="w-8 h-8 opacity-20 mb-2" />
                                    <p>No stock found in this location.</p>
                                </div>
                            ) : (
                                <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-2">
                                    {stockList.map(item => (
                                        <div key={item.id} className="flex justify-between items-center bg-muted/50 p-3 rounded-xl border border-border">
                                            <div>
                                                <div className="font-bold text-sm text-foreground">{item.name}</div>
                                                <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-lg text-cyan-400">{item.quantity} appx</div>
                                                <div className="text-[10px] text-muted-foreground uppercase">In Stock</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </GlassModal>
        </div>
    );
}
