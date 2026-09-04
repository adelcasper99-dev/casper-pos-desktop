'use client';

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, Truck, PackageCheck, RefreshCw, GitPullRequest, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getStockRequests, transitionStockRequest } from "@/actions/stock-request-actions";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n-mock";
import { Badge } from "@/components/ui/badge";

interface WarehouseItem {
    id: string;
    name?: string;
    [key: string]: unknown;
}

interface RequestProductItem {
    id: string;
    quantity: number;
    product?: {
        id: string;
        name: string;
        sku?: string;
    };
}

interface StockRequestRecord {
    id: string;
    warehouseId: string;
    status: 'PENDING' | 'APPROVED' | 'DISPATCHED' | 'RECEIVED' | 'REJECTED' | string;
    createdAt?: string;
    warehouse?: {
        id: string;
        name: string;
    };
    items: RequestProductItem[];
}

interface StockRequestsManagerProps {
    warehouses?: WarehouseItem[];
    csrfToken?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
    PENDING: {
        label: 'قيد الانتظار',
        className: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    },
    APPROVED: {
        label: 'تمت الموافقة',
        className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    },
    DISPATCHED: {
        label: 'تم الشحن',
        className: 'bg-sky-500/10 text-sky-400 border-sky-500/30'
    },
    RECEIVED: {
        label: 'تم الاستلام',
        className: 'bg-violet-500/10 text-violet-400 border-violet-500/30'
    },
    REJECTED: {
        label: 'مرفوض',
        className: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    }
};

export default function StockRequestsManager({ warehouses = [], csrfToken }: StockRequestsManagerProps) {
    const t = useTranslations('Inventory.requests');
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
    const [requests, setRequests] = useState<StockRequestRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    const loadRequests = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getStockRequests(selectedWarehouseId || undefined);
            if (res.success && Array.isArray(res.data)) {
                setRequests(res.data as StockRequestRecord[]);
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'حدث خطأ أثناء تحميل الطلبات';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [selectedWarehouseId]);

    useEffect(() => {
        loadRequests();
    }, [loadRequests]);

    const handleTransition = async (id: string, status: string) => {
        setActionLoadingId(id);
        try {
            const res = await transitionStockRequest({ requestId: id, targetStatus: status, csrfToken });
            if (res.success) {
                const statusLabel = STATUS_CONFIG[status]?.label || status;
                toast.success(`تم تحديث حالة الطلب إلى: ${statusLabel}`);
                loadRequests();
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'فشل تغيير حالة الطلب';
            toast.error(message);
        } finally {
            setActionLoadingId(null);
        }
    };

    const warehouseOptions = [
        { label: t('allWarehouses', 'جميع المستودعات'), value: '' },
        ...warehouses.map((w) => ({ label: w.name || 'مستودع غير مسمى', value: w.id }))
    ];

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500 text-start" dir="rtl">
            {/* Header Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                        <GitPullRequest className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-wide">
                            {t('title', 'طلبات المخزون')}
                        </h2>
                        <p className="text-xs text-zinc-400">
                            متابعة أوامر تزويد ونقل المخزون بين المستودعات والموافقة عليها وشحنها
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button 
                        onClick={loadRequests} 
                        variant="outline"
                        disabled={loading}
                        className="gap-2 font-bold bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        <span>تحديث القائمة</span>
                    </Button>
                </div>
            </div>

            {/* Warehouse Filter */}
            <div className="flex flex-wrap items-center gap-4 bg-zinc-900/40 p-3.5 rounded-2xl border border-zinc-800/80">
                <div className="w-72">
                    <label className="text-xs font-bold text-zinc-400 mb-1.5 block">
                        {t('filterWarehouse', 'تصفية حسب المستودع')}
                    </label>
                    <SearchableSelect 
                        options={warehouseOptions}
                        value={selectedWarehouseId}
                        onChange={setSelectedWarehouseId}
                        placeholder={t('allWarehouses', 'جميع المستودعات')}
                    />
                </div>
            </div>

            {/* Table Card */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-start border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-bold">
                                <th className="py-3 px-4 text-start font-black w-28">{t('tableId', 'رقم الطلب')}</th>
                                <th className="py-3 px-4 text-start font-black w-44">{t('tableWarehouse', 'المستودع')}</th>
                                <th className="py-3 px-4 text-start font-black">{t('tableItems', 'الأصناف والكميات')}</th>
                                <th className="py-3 px-4 text-center font-black w-36">{t('tableStatus', 'الحالة')}</th>
                                <th className="py-3 px-4 text-end font-black w-48">{t('tableActions', 'الإجراءات')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-zinc-400 font-bold text-sm">
                                        <div className="flex items-center justify-center gap-2">
                                            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                                            <span>{t('loading', 'جاري التحميل...')}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : requests.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-zinc-500 font-medium text-sm">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Box className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
                                            <span>{t('noRequests', 'لا توجد طلبات مخزون مسجلة')}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                requests.map((r) => {
                                    const statusInfo = STATUS_CONFIG[r.status] || {
                                        label: r.status,
                                        className: 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                    };
                                    const isBusy = actionLoadingId === r.id;

                                    return (
                                        <tr key={r.id} className="hover:bg-zinc-800/30 transition-colors">
                                            <td className="py-3.5 px-4 font-mono text-xs font-bold text-zinc-400">
                                                #{r.id.substring(0, 8)}
                                            </td>
                                            <td className="py-3.5 px-4 font-bold text-white text-sm">
                                                {r.warehouse?.name || '-'}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {r.items.map((item) => (
                                                        <span 
                                                            key={item.id} 
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700/60 text-xs text-zinc-200"
                                                        >
                                                            <span className="font-medium">{item.product?.name || 'صنف'}</span>
                                                            <span className="font-mono font-bold text-cyan-400">(x{item.quantity})</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <Badge 
                                                    variant="outline" 
                                                    className={`font-bold px-2.5 py-0.5 rounded-md border ${statusInfo.className}`}
                                                >
                                                    {statusInfo.label}
                                                </Badge>
                                            </td>
                                            <td className="py-3.5 px-4 text-end">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {r.status === 'PENDING' && (
                                                        <>
                                                            <Button 
                                                                size="sm" 
                                                                disabled={isBusy}
                                                                onClick={() => handleTransition(r.id, 'APPROVED')}
                                                                className="h-8 gap-1 text-xs font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 cursor-pointer"
                                                            >
                                                                <CheckCircle className="w-3.5 h-3.5" />
                                                                <span>{t('approve', 'موافقة')}</span>
                                                            </Button>
                                                            <Button 
                                                                size="sm" 
                                                                disabled={isBusy}
                                                                onClick={() => handleTransition(r.id, 'REJECTED')}
                                                                className="h-8 gap-1 text-xs font-bold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 cursor-pointer"
                                                            >
                                                                <XCircle className="w-3.5 h-3.5" />
                                                                <span>{t('reject', 'رفض')}</span>
                                                            </Button>
                                                        </>
                                                    )}

                                                    {r.status === 'APPROVED' && (
                                                        <Button 
                                                            size="sm" 
                                                            disabled={isBusy}
                                                            onClick={() => handleTransition(r.id, 'DISPATCHED')}
                                                            className="h-8 gap-1.5 text-xs font-bold bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/30 cursor-pointer"
                                                        >
                                                            <Truck className="w-3.5 h-3.5" />
                                                            <span>{t('dispatch', 'إرسال / شحن')}</span>
                                                        </Button>
                                                    )}

                                                    {r.status === 'DISPATCHED' && (
                                                        <Button 
                                                            size="sm" 
                                                            disabled={isBusy}
                                                            onClick={() => handleTransition(r.id, 'RECEIVED')}
                                                            className="h-8 gap-1.5 text-xs font-bold bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/30 cursor-pointer"
                                                        >
                                                            <PackageCheck className="w-3.5 h-3.5" />
                                                            <span>{t('receive', 'تأكيد الاستلام')}</span>
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
