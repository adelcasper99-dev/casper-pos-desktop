"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
                "relative group p-2.5 rounded-xl border transition-all duration-200",
                isActive
                    ? type === 'pos'
                        ? "bg-cyan-500/10 border-cyan-500/40 shadow-xs"
                        : "bg-amber-500/10 border-amber-500/40 shadow-xs"
                    : "bg-background/40 border-border/40 hover:border-primary/40 hover:bg-background/60"
            )}
        >
            <div className="flex flex-col h-full justify-between gap-2 text-right">
                <div className="space-y-0.5">
                    <div className="flex items-center justify-between flex-row-reverse">
                        <h4 className="font-black text-xs text-foreground uppercase tracking-tight group-hover:text-primary transition-colors truncate">
                            {warehouse.name}
                        </h4>
                        {isActive && (
                            <Star className={cn("w-3.5 h-3.5 fill-current shrink-0", type === 'pos' ? "text-cyan-500" : "text-amber-500")} />
                        )}
                    </div>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider opacity-70 truncate">
                        {warehouse.address || "NO ADDRESS REGISTERED"}
                    </p>
                </div>

                <button
                    onClick={() => onSetDefault(warehouse.id, type)}
                    disabled={loading !== null || isActive}
                    className={cn(
                        "w-full h-7 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
                        isActive
                            ? type === 'pos'
                                ? "bg-cyan-500 text-white cursor-default shadow-xs"
                                : "bg-amber-500 text-white cursor-default shadow-xs"
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
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const handleSetDefault = async (warehouseId: string, type: 'pos' | 'maintenance') => {
        const loadingKey = `${type}-${warehouseId}`;
        setLoading(loadingKey);
        try {
            const res = await setDefaultWarehouse({ warehouseId, branchId: currentBranchId, type });
            if (res.success) {
                toast.success(type === 'pos' ? "POS Default Warehouse set" : "Maintenance Default Warehouse set");
                startTransition(() => {
                    router.refresh();
                    setLoading(null);
                });
            } else {
                toast.error("Failed to set default warehouse");
                setLoading(null);
            }
        } catch (error) {
            console.error(error);
            toast.error("An unexpected error occurred");
            setLoading(null);
        }
    };

    return (
        <div className="max-w-5xl space-y-3 animate-in slide-in-from-bottom-2 duration-300 pb-14">
            {/* POS Default Warehouse */}
            <div className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-xl p-3.5 shadow-sm relative overflow-hidden group/pos space-y-2.5">
                <div className="flex items-center gap-2.5 relative z-10">
                    <div className="w-7 h-7 bg-cyan-500/10 rounded-lg border border-cyan-500/20 flex items-center justify-center">
                        <ShoppingCart className="w-3.5 h-3.5 text-cyan-500" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-tight text-foreground leading-none">Sales Inventory (POS)</h3>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider opacity-70 mt-0.5">Global default source for point-of-sale transactions</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 relative z-10">
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
            <div className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl border border-border/40 rounded-xl p-3.5 shadow-sm relative overflow-hidden group/maint space-y-2.5">
                <div className="flex items-center gap-2.5 relative z-10">
                    <div className="w-7 h-7 bg-amber-500/10 rounded-lg border border-amber-500/20 flex items-center justify-center">
                        <Wrench className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-tight text-foreground leading-none">Maintenance Logistics</h3>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider opacity-70 mt-0.5">Primary warehouse for ticket spare parts fulfillments</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 relative z-10">
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
