'use client';

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Truck, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getStockRequests, transitionStockRequest } from "@/actions/stock-request-actions";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n-mock";
import { Badge } from "@/components/ui/badge";

export default function StockRequestsManager({ warehouses, csrfToken }: any) {
  const t = useTranslations('Inventory.requests');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRequests();
  }, [selectedWarehouseId]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const res = await getStockRequests(selectedWarehouseId || undefined);
      if (res.success) setRequests(res.data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTransition = async (id: string, status: string) => {
    try {
      const res = await transitionStockRequest({ requestId: id, targetStatus: status, csrfToken });
      if (res.success) {
        toast.success(`Request marked as ${status}`);
        loadRequests();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const warehouseOptions = [
    { label: 'All Warehouses', value: '' },
    ...warehouses.map((w: any) => ({ label: w.name, value: w.id }))
  ];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Stock Requests</h2>
      </div>

      <div className="flex gap-4 items-center bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10">
        <div className="w-64">
          <label className="text-sm font-bold text-slate-500 mb-1 block">Filter by Warehouse</label>
          <SearchableSelect 
            options={warehouseOptions}
            value={selectedWarehouseId}
            onChange={setSelectedWarehouseId}
            placeholder="All Warehouses"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/10">
              <th className="py-2 font-black text-slate-500">ID</th>
              <th className="py-2 font-black text-slate-500">Warehouse</th>
              <th className="py-2 font-black text-slate-500">Items</th>
              <th className="py-2 font-black text-slate-500">Status</th>
              <th className="py-2 font-black text-slate-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-4 text-center text-slate-500 font-bold">Loading...</td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-slate-500 font-bold">No requests found</td></tr>
            ) : requests.map(r => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-white/5">
                <td className="py-3 font-mono text-sm">{r.id.substring(0, 8)}</td>
                <td className="py-3 font-bold">{r.warehouse?.name}</td>
                <td className="py-3">
                  {r.items.map((item: any) => (
                    <div key={item.id} className="text-sm">{item.product?.name} (x{item.quantity})</div>
                  ))}
                </td>
                <td className="py-3">
                  <Badge variant={r.status === 'PENDING' ? 'outline' : r.status === 'APPROVED' ? 'default' : r.status === 'DISPATCHED' ? 'secondary' : r.status === 'RECEIVED' ? 'default' : 'destructive'}>
                    {r.status}
                  </Badge>
                </td>
                <td className="py-3 flex justify-end gap-2">
                  {r.status === 'PENDING' && (
                    <>
                      <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleTransition(r.id, 'APPROVED')}>
                        <CheckCircle className="w-4 h-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleTransition(r.id, 'REJECTED')}>
                        <XCircle className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                  {r.status === 'APPROVED' && (
                    <Button size="sm" variant="outline" className="text-blue-600" onClick={() => handleTransition(r.id, 'DISPATCHED')}>
                      <Truck className="w-4 h-4 mr-1" /> Dispatch
                    </Button>
                  )}
                  {r.status === 'DISPATCHED' && (
                    <Button size="sm" variant="outline" className="text-purple-600" onClick={() => handleTransition(r.id, 'RECEIVED')}>
                      <PackageCheck className="w-4 h-4 mr-1" /> Receive
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
