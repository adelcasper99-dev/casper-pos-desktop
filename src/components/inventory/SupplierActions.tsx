"use client";

import { useState } from "react";
import { Wallet, Receipt, Check, Loader2, CreditCard, Banknote, Building2 } from "lucide-react";
import GlassModal from "../ui/GlassModal";
import { paySupplier } from "@/actions/inventory";
import { getStoreSettings } from "@/actions/settings";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n-mock";
import { generateA4StatementHTML } from "./purchasing/A4StatementTemplate";
import { printService } from "@/lib/print-service";
import { useEffect } from "react";

interface Transaction {
    id: string;
    date: Date;
    type: 'INVOICE' | 'PAYMENT';
    reference: string;
    amount: number;
    status: string;
    isCredit: boolean;
    method?: string;
    items?: {
        name: string;
        sku: string;
        category: string;
        quantity: number;
        unitCost: number;
    }[];
}



export default function SupplierActions({
    supplierId,
    supplierName,
    balance,
    phone,
    email,
    address,
    transactions,
    csrfToken
}: {
    supplierId: string,
    supplierName: string,
    balance: number,
    phone?: string | null,
    email?: string | null,
    address?: string | null,
    transactions: Transaction[],
    csrfToken: string
}) {
    const router = useRouter();
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const t = useTranslations('Inventory.Suppliers.Details');
    const tCommon = useTranslations('Common');

    // Payment Form State
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("CASH");
    const [settings, setSettings] = useState<any>(null);

    useEffect(() => {
        getStoreSettings().then((res: any) => {
            if (res.success) setSettings(res.data);
        });
    }, []);

    async function handlePayment() {
        if (!amount || isNaN(parseFloat(amount))) {
            toast.error(tCommon('invalid')); // Fallback to common invalid or specific if available
            return;
        }

        setLoading(true);
        try {
            const res = await paySupplier({ supplierId, amount: parseFloat(amount), method, csrfToken });
            if (res?.success) {
                toast.success(t('paymentModal.success'));
                setIsPaymentModalOpen(false);
                setAmount("");
                setMethod("CASH");
                router.refresh();
            } else {
                toast.error(res?.error || t('paymentModal.error'));
            }
        } catch (error) {
            toast.error("حدث خطأ غير متوقع");
        } finally {
            setLoading(false);
        }
    }

    const handlePrint = async () => {
        const supplierData = {
            name: supplierName,
            phone,
            address,
            balance
        };

        const html = generateA4StatementHTML({ supplierData, transactions, settings });

        try {
            const registry = printService.getRegistry();
            const printer = registry?.a4Printer && registry.a4Printer !== 'none' ? registry.a4Printer : undefined;

            await toast.promise(
                printService.printHTML(html, printer || '', { paperWidthMm: 210 }),
                {
                    loading: 'Preparing print...',
                    success: 'Sent to printer',
                    error: (err: any) => `Print failed: ${err?.message || 'Unknown error'}`
                }
            );
        } catch (e) {
            console.error("Print Error:", e);
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(html);
                printWindow.document.close();
            }
        }
    };

    const PAYMENT_METHODS = [
        { id: 'CASH', label: tCommon('methods.CASH') || 'نقداً', icon: Banknote },
        { id: 'CARD', label: tCommon('methods.VISA') || 'بطاقة', icon: CreditCard },
        { id: 'TRANSFER', label: tCommon('methods.TRANSFER') || 'تحويل', icon: Building2 },
    ];

    return (
        <div className="glass-card p-4 border border-border rounded-xl">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-cyan-500" />
                {t('accountActions')}
            </h3>
            <div className="space-y-3">
                <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="w-full p-3 rounded-lg bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
                >
                    <Wallet className="w-4 h-4" />
                    {t('recordPayment')}
                </button>
                <button
                    onClick={handlePrint}
                    className="w-full p-3 rounded-lg bg-cyan-500/10 text-cyan-500 font-bold hover:bg-cyan-500/20 transition-colors flex items-center justify-center gap-2"
                >
                    <Receipt className="w-4 h-4" />
                    {t('printStatement')}
                </button>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">
                {t('actionsModalNote')}
            </p>

            {/* Payment Modal */}
            <GlassModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                title={t('paymentModal.title', { name: supplierName })}
            >
                <div className="space-y-6">
                    {/* Balance Info */}
                    <div className="bg-muted/50 p-4 rounded-xl text-center border border-border">
                        <div className="text-muted-foreground text-xs uppercase mb-1">{t('currentBalance')}</div>
                        <div className={`text-2xl font-mono font-bold ${balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            ${balance.toFixed(2)}
                        </div>
                    </div>

                    {/* Amount Input */}
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">{t('paymentModal.amountLabel')}</label>
                        <div className="relative">
                            <span className="absolute left-4 top-3 text-muted-foreground font-bold">$</span>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="glass-input w-full pl-8 text-xl font-bold"
                                placeholder="0.00"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Method Selection */}
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-2 block">{t('paymentModal.methodLabel')}</label>
                        <div className="grid grid-cols-2 gap-2">
                            {PAYMENT_METHODS.map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => setMethod(m.id)}
                                    className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${method === m.id
                                        ? 'bg-primary/20 border-primary text-primary'
                                        : 'bg-card border-border hover:border-primary/50 text-muted-foreground'
                                        }`}
                                >
                                    <m.icon className="w-5 h-5" />
                                    <span className="text-xs font-bold">{m.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handlePayment}
                        disabled={loading || !amount}
                        className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Check />}
                        {t('paymentModal.confirm')}
                    </button>
                </div>
            </GlassModal>
        </div>
    );
}
