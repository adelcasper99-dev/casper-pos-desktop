"use client";

import { useState } from "react";
import { Database, ShoppingCart, Wrench, CheckCircle2, Star, Loader2, Store } from "lucide-react";
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
                "relative group p-5 rounded-xl border transition-all duration-300",
                isActive
                    ? type === 'pos'
                        ? "bg-cyan-500/10 border-cyan-500/50"
                        : "bg-amber-500/10 border-amber-500/50"
                    : "bg-white/5 border-white/10 hover:border-white/20"
            )}
        >
            <div className="flex flex-col h-full justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <h4 className="font-bold text-white group-hover:text-cyan-400 transition-colors">
                            {warehouse.name}
                        </h4>
                        {isActive && (
                            <Star className={cn("w-4 h-4 fill-current", type === 'pos' ? "text-cyan-400" : "text-amber-400")} />
                        )}
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-1">
                        {warehouse.address || "لا يوجد عنوان مسجل"}
                    </p>
                </div>

                <button
                    onClick={() => onSetDefault(warehouse.id, type)}
                    disabled={loading !== null || isActive}
                    className={cn(
                        "w-full py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
                        isActive
                            ? type === 'pos'
                                ? "bg-cyan-500 text-black cursor-default"
                                : "bg-amber-500 text-black cursor-default"
                            : "bg-white/10 text-white hover:bg-white/20"
                    )}
                >
                    {loading === loadingKey ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isActive ? (
                        <><CheckCircle2 className="w-3 h-3" /> الافتراضي حالياً</>
                    ) : (
                        "تعيين كافتراضي"
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
                toast.success(type === 'pos' ? "تم تعيين المخزن كافتراضي للبيع (POS)" : "تم تعيين مخزن الصيانة الرئيسي");
            } else {
                toast.error("فشل في تعيين المخزن الافتراضي");
            }
        } catch (error) {
            console.error(error);
            toast.error("حدث خطأ ما");
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* ── POS Default Warehouse ── */}
            <div className="glass-card p-6 border border-white/10 bg-black/20 backdrop-blur-xl rounded-2xl">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30">
                        <ShoppingCart className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-lg">مخزن البيع (POS)</h3>
                        <p className="text-zinc-400 text-sm">الجرد الافتراضي لعمليات البيع عبر نقاط البيع</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

            {/* ── Maintenance Default Warehouse ── */}
            <div className="glass-card p-6 border border-white/10 bg-black/20 backdrop-blur-xl rounded-2xl">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                        <Wrench className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-lg">مخزن الصيانة الرئيسي</h3>
                        <p className="text-zinc-400 text-sm">المصدر الافتراضي لقطع غيار تذاكر الصيانة</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
