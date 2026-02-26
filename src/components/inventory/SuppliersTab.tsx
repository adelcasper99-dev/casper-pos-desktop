"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, Truck, Phone, Mail, MapPin, Check, Search } from "lucide-react";
import { createSupplier, updateSupplier, deleteSupplier, paySupplier } from "@/actions/inventory";
import { formatCurrency } from "@/lib/utils";
import GlassModal from "../ui/GlassModal";
import { Loader2 } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";

export default function SuppliersTab({ suppliers, csrfToken, currency = "EGP" }: { suppliers: any[], csrfToken?: string, currency?: string }) {
    const t = useTranslations('Purchasing.Suppliers');
    const tCommon = useTranslations('Common');
    const router = useRouter();
    const [isAddMode, setIsAddMode] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Form State (Uncontrolled via FormData usually better for actions, but controlled for pre-filling edit)
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [address, setAddress] = useState("");
    const [createError, setCreateError] = useState("");
    const [duplicateSupplier, setDuplicateSupplier] = useState<any>(null);

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.phone?.includes(searchTerm)
    );

    function resetForm() {
        setName("");
        setPhone("");
        setEmail("");
        setAddress("");
        setEditingId(null);
        setIsAddMode(false);
        setCreateError("");
        setDuplicateSupplier(null);
    }

    async function handleSave() {
        if (!name.trim()) return;
        setLoading(true);
        setCreateError("");
        setDuplicateSupplier(null);

        const data = {
            name,
            phone,
            email,
            address,
            csrfToken
        };

        let res;
        if (editingId) {
            res = await updateSupplier(editingId, data);
        } else {
            res = await createSupplier(data);
        }

        setLoading(false);

        if (res?.success) {
            resetForm();
        } else {
            setCreateError(res?.error || "Failed to save supplier");
            if (res?.duplicateSupplier) {
                setDuplicateSupplier(res.duplicateSupplier);
            }
        }
    }

    async function handleDelete(id: string) {
        if (confirm(t('confirmDelete'))) {
            setLoading(true);
            const res = await deleteSupplier({ id, csrfToken });
            setLoading(false);

            if (res?.success) {
                // Success - data will refresh automatically via revalidation
            } else {
                alert(res?.error || "Failed to delete supplier");
            }
        }
    }

    function startEdit(s: any) {
        setEditingId(s.id);
        setName(s.name);
        setPhone(s.phone || "");
        setEmail(s.email || "");
        setAddress(s.address || "");
        setIsAddMode(true);
    }

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState("");
    const [selectedSupplierForPayment, setSelectedSupplierForPayment] = useState<any>(null);

    function startPayment(s: any) {
        setSelectedSupplierForPayment(s);
        setPaymentAmount("");
        setIsPaymentModalOpen(true);
    }

    async function handlePayment() {
        if (!selectedSupplierForPayment || !paymentAmount) return;
        setLoading(true);
        await paySupplier(selectedSupplierForPayment.id, parseFloat(paymentAmount));
        setLoading(false);
        setIsPaymentModalOpen(false);
        setSelectedSupplierForPayment(null);
    }

    return (
        <div className="space-y-4 animate-fly-in" dir="rtl">
            {/* ... Header & Search ... */}

            {/* List */}
            {/* HEADER AND SEARCH CODE IS UNCHANGED - INSERTED HERE FOR CONTEXT ONLY IF NEEDED, BUT WE ARE REPLACING WHOLE FILE CONTENT BLOCK FOR SIMPLICITY IF CHUNKED, OR JUST APPENDING MODAL */}
            {/* ACTUALLY, I NEED TO INJECT THE MODAL AT THE END AND THE BUTTON IN THE TABLE */}

            {/* Header */}
            <div className="flex justify-between items-center bg-muted/50 p-4 rounded-xl border border-border">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Truck className="w-5 h-5 text-indigo-400" />
                        {t('title')}
                    </h2>
                    <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
                </div>
                <button
                    onClick={() => setIsAddMode(true)}
                    className="bg-cyan-500 text-black font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-cyan-400 ml-24"
                >
                    <Plus className="w-4 h-4" />
                    {t('new')}
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute start-4 top-3 text-muted-foreground w-5 h-5" />
                <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t('search')}
                    className="w-full glass-input ps-12 py-3"
                />
            </div>

            <div className="glass-card overflow-hidden bg-card border border-border">
                <table className="w-full text-start">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                        <tr>
                            <th className="p-3 text-start">{t('table.supplier')}</th>
                            <th className="p-3 text-start">{t('table.contact')}</th>
                            <th className="p-3 text-start">{t('table.address')}</th>
                            <th className="p-3 text-end">{t('table.balance')}</th>
                            <th className="p-3 text-end">{t('table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm">
                        {filteredSuppliers.map((s) => (
                            <tr key={s.id} className="hover:bg-muted/50 transition-colors group cursor-pointer" onClick={() => router.push(`/inventory/suppliers/${s.id}`)}>
                                <td className="p-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold text-xs">
                                            {s.name.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="font-bold text-sm text-foreground">{s.name}</div>
                                    </div>
                                </td>
                                <td className="p-3 text-muted-foreground">
                                    <div className="flex flex-col gap-0.5 text-xs">
                                        <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {s.phone || "-"}</span>
                                        <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {s.email || "-"}</span>
                                    </div>
                                </td>
                                <td className="p-3 text-muted-foreground max-w-[180px] truncate text-xs">
                                    {s.address ? <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {s.address}</span> : "-"}
                                </td>
                                <td className="p-3 text-end font-mono font-bold text-sm">
                                    <span className={s.balance > 0 ? 'text-red-500' : 'text-green-500'}>
                                        {formatCurrency(s.balance, currency)}
                                    </span>
                                </td>
                                <td className="p-3 text-end">
                                    <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => startEdit(s)} className="p-1.5 hover:bg-muted rounded-lg text-cyan-500">
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-muted rounded-lg text-red-500">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredSuppliers.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                        {t('empty')}
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            <GlassModal
                isOpen={isAddMode}
                onClose={resetForm}
                title={editingId ? t('editSupplier') : t('new')}
            >
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('companyName')}</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="glass-input w-full"
                            placeholder={t('companyName')}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('phone')}</label>
                            <input
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="glass-input w-full"
                                placeholder={t('phonePlaceholder')}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('email')}</label>
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="glass-input w-full"
                                placeholder={t('emailPlaceholder')}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('address')}</label>
                        <textarea
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            className="glass-input w-full h-20 resize-none"
                            placeholder={t('addressPlaceholder')}
                        />
                    </div>

                    {createError && (
                        <div className="space-y-2">
                            <p className="text-xs text-red-400 bg-red-400/10 p-2 rounded-lg border border-red-400/20">{createError}</p>
                            {duplicateSupplier && (
                                <button
                                    onClick={() => {
                                        router.push(`/inventory/suppliers/${duplicateSupplier.id}`);
                                        resetForm();
                                    }}
                                    className="w-full flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all text-right"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                            <Truck className="w-4 h-4" />
                                        </div>
                                        <div className="text-xs text-right">
                                            <div className="font-bold text-white">{duplicateSupplier.name}</div>
                                            <div className="text-indigo-400/70">{duplicateSupplier.phone}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs bg-indigo-500 text-white px-3 py-1 rounded-full font-bold">
                                        {tCommon('view') || "عرض"}
                                    </div>
                                </button>
                            )}
                        </div>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={loading || !name}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Check />}
                        {t('saveSupplier')}
                    </button>
                </div>
            </GlassModal>

            {/* Payment Modal */}
            <GlassModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                title={t('payTitle', { name: selectedSupplierForPayment?.name })}
            >
                <div className="space-y-4">
                    <div className="bg-muted/50 p-4 rounded-xl text-center border border-border">
                        <div className="text-muted-foreground text-xs uppercase mb-1">{t('currentBalance')}</div>
                        <div className={`text-2xl font-mono font-bold ${selectedSupplierForPayment?.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {formatCurrency(selectedSupplierForPayment?.balance || 0, currency)}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('payAmount')}</label>
                        <input
                            type="number"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            className="glass-input w-full text-xl font-bold"
                            placeholder={t('paymentPlaceholder')}
                            autoFocus
                        />
                    </div>

                    <button
                        onClick={handlePayment}
                        disabled={loading || !paymentAmount}
                        className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Check />}
                        {t('confirmPay')}
                    </button>
                </div>
            </GlassModal>
        </div>
    );
}
