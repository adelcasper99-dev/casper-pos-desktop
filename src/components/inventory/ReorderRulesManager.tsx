'use client';

import { useState, useEffect } from "react";
import { Plus, Trash, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getReorderRules, upsertReorderRule, deleteReorderRule, checkAndGenerateRequests } from "@/actions/reorder-rules-actions";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n-mock";

export default function ReorderRulesManager({ warehouses, products, csrfToken }: any) {
  const t = useTranslations('Inventory.reorder');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(warehouses?.[0]?.id || '');
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // New rule form
  const [newProductId, setNewProductId] = useState('');
  const [newMin, setNewMin] = useState(0);
  const [newMax, setNewMax] = useState(0);

  useEffect(() => {
    if (selectedWarehouseId) {
      loadRules();
    }
  }, [selectedWarehouseId]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await getReorderRules(selectedWarehouseId);
      if (res.success) setRules(res.data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newProductId) return toast.error("Select a product");
    try {
      const res = await upsertReorderRule({
        warehouseId: selectedWarehouseId,
        productId: newProductId,
        minQty: newMin,
        maxQty: newMax,
        isActive: true,
        csrfToken
      });
      if (res.success) {
        toast.success("Rule added");
        setNewProductId('');
        setNewMin(0);
        setNewMax(0);
        loadRules();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteReorderRule({ id, csrfToken });
      toast.success("Rule deleted");
      loadRules();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleGenerate = async () => {
    try {
      const res = await checkAndGenerateRequests({ warehouseId: selectedWarehouseId, csrfToken });
      if (res.success) {
        toast.success(`Generated ${res.count} requests`);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const productOptions = products.map((p: any) => ({ label: p.name, value: p.id }));
  const warehouseOptions = warehouses.map((w: any) => ({ label: w.name, value: w.id }));

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Reorder Rules</h2>
        <Button onClick={handleGenerate} className="gap-2 font-black">
          <RefreshCw className="w-4 h-4" /> Generate Requests
        </Button>
      </div>

      <div className="flex gap-4 items-center bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10">
        <div className="w-64">
          <label className="text-sm font-bold text-slate-500 mb-1 block">Warehouse</label>
          <SearchableSelect 
            options={warehouseOptions}
            value={selectedWarehouseId}
            onChange={setSelectedWarehouseId}
            placeholder="Select Warehouse"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm">
        <div className="flex gap-4 items-end mb-6">
           <div className="flex-1">
             <label className="text-sm font-bold text-slate-500 mb-1 block">Product</label>
             <SearchableSelect 
               options={productOptions}
               value={newProductId}
               onChange={setNewProductId}
               placeholder="Select Product"
             />
           </div>
           <div className="w-24">
             <label className="text-sm font-bold text-slate-500 mb-1 block">Min Qty</label>
             <Input type="number" value={newMin} onChange={e => setNewMin(Number(e.target.value))} />
           </div>
           <div className="w-24">
             <label className="text-sm font-bold text-slate-500 mb-1 block">Max Qty</label>
             <Input type="number" value={newMax} onChange={e => setNewMax(Number(e.target.value))} />
           </div>
           <Button onClick={handleAdd} className="gap-2 font-black h-10">
             <Plus className="w-4 h-4" /> Add
           </Button>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/10">
              <th className="py-2 font-black text-slate-500">Product</th>
              <th className="py-2 font-black text-slate-500">Min</th>
              <th className="py-2 font-black text-slate-500">Max</th>
              <th className="py-2 font-black text-slate-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="py-4 text-center text-slate-500 font-bold">Loading...</td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan={4} className="py-4 text-center text-slate-500 font-bold">No rules found</td></tr>
            ) : rules.map(r => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-white/5">
                <td className="py-3 font-bold">{r.product?.name || r.productId}</td>
                <td className="py-3 font-bold">{r.minQty}</td>
                <td className="py-3 font-bold">{r.maxQty}</td>
                <td className="py-3 text-right">
                  <Button variant="destructive" size="icon" onClick={() => handleDelete(r.id)}>
                    <Trash className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
