"use client";

import { useState } from "react";
import { ShoppingCart, Wrench, CheckCircle2, Star, Loader2 } from "lucide-react";
import { setDefaultWarehouse } from "@/actions/inventory";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Warehouse {
    id: string;
    name: string;
    address: string | null;
    isDefault: boolean;
    isMaintenanceDefault: boolean;
    branchId: string | null;
}

function WarehouseCard({
    warehouse,
    type,
    loading,
    onSetDefault,
}: {
    warehouse: Warehouse;
    type: 'pos' | 'maintenance';
    loading: string | null;
    onSetDefault: (id: string, type: 'pos' | 'maintenance') => void;
}) {
    const isActive = type === 'pos' ? warehouse.isDefault : warehouse.isMaintenanceDefault;
    const loadingKey = `${type}-${warehouse.id}`;

    return (
        <div
            className={cn(
                "relative group p-6 rounded-3xl border transition-all duration-300",
                isActive
                    ? type === 'pos'
                        ? "bg-cyan-500/10 border-cyan-500/40 shadow-lg shadow-cyan-500/5"
                        : "bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/5"
                    : "bg-background/40 border-border/40 hover:border-primary/40 hover:bg-background/60"
            )}
        >
            <div className="flex flex-col h-full justify-between gap-5 text-right">
                <div className="space-y-1">
                    <div className="flex items-center justify-between flex-row-reverse">
                        <h4 className="font-black text-foreground uppercase tracking-tight group-hover:text-primary transition-colors">
                            {warehouse.name}
                        </h4>
                        {isActive && (
                            <Star className={cn("w-4 h-4 fill-current", type === 'pos' ? "text-cyan-500" : "text-amber-500")} />
                        )}
                    </div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">
                        {warehouse.address || "NO ADDRESS REGISTERED"}
                    </p>
                </div>

                <button
                    onClick={() => onSetDefault(warehouse.id, type)}
                    disabled={loading !== null || isActive}
                    className={cn(
                        "w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                        isActive
                            ? type === 'pos'
                                ? "bg-cyan-500 text-white cursor-default shadow-lg shadow-cyan-500/20"
                                : "bg-amber-500 text-white cursor-default shadow-lg shadow-amber-500/20"
                            : "bg-card border border-border/40 text-foreground hover:bg-primary hover:text-white hover:border-primary"
                    )}
                >
                    {loading === loadingKey ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isActive ? (
                        <><CheckCircle2 className="w-3 h-3" /> CURRENT DEFAULT</>
                    ) : (
                        "SET AS DEFAULT"
                    )}
                </button>
            </div>
        </div>
    );
}

export default function WarehouseSettings({ warehouses, currentBranchId }: { warehouses: Warehouse[], currentBranchId?: string }) {
    const [loading, setLoading] = useState<string | null>(null);

    const handleSetDefault = async (warehouseId: string, type: 'pos' | 'maintenance') => {
        const loadingKey = `${type}-${warehouseId}`;
        setLoading(loadingKey);
        try {
            const res = await setDefaultWarehouse({ warehouseId, branchId: currentBranchId, type });
            if (res.success) {
                toast.success(type === 'pos' ? "POS Default Warehouse set" : "Maintenance Default Warehouse set");
            } else {
                toast.error("Failed to set default warehouse");
            }
        } catch (error) {
            console.error(error);
            toast.error("An unexpected error occurred");
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="max-w-5xl space-y-10 animate-in slide-in-from-bottom-4 duration-700 pb-20">
            {/* POS Default Warehouse */}
            <div className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden group/pos">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover/pos:bg-cyan-500/10 transition-colors" />
                
                <div className="flex items-center gap-4 mb-10 relative z-10">
                    <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 shadow-inner">
                        <ShoppingCart className="w-6 h-6 text-cyan-500" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Sales Inventory (POS)</h3>
                        <p className="text-xs font-black text-muted-foreground uppercase tracking-widest opacity-60">Global default source for point-of-sale transactions</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                    {warehouses.map((warehouse) => (
                        <WarehouseCard
                            key={`pos-${warehouse.id}`}
                            warehouse={warehouse}
                            type="pos"
                            loading={loading}
                            onSetDefault={handleSetDefault}
                        />
                    ))}
                </div>
            </div>

            {/* Maintenance Default Warehouse */}
            <div className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden group/maint">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover/maint:bg-amber-500/10 transition-colors" />
                
                <div className="flex items-center gap-4 mb-10 relative z-10">
                    <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20 shadow-inner">
                        <Wrench className="w-6 h-6 text-amber-500" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Maintenance Logistics</h3>
                        <p className="text-xs font-black text-muted-foreground uppercase tracking-widest opacity-60">Primary warehouse for ticket spare parts fulfillments</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                    {warehouses.map((warehouse) => (
                        <WarehouseCard
                            key={`maint-${warehouse.id}`}
                            warehouse={warehouse}
                            type="maintenance"
                            loading={loading}
                            onSetDefault={handleSetDefault}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
