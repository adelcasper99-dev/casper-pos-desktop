"use client";

import { useState } from "react";
import { Wallet, Receipt, Check, Loader2, CreditCard, Banknote, Building2 } from "lucide-react";
import GlassModal from "../ui/GlassModal";
import { paySupplier } from "@/actions/inventory";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
    transactions
}: {
    supplierId: string,
    supplierName: string,
    balance: number,
    phone?: string | null,
    email?: string | null,
    address?: string | null,
    transactions: Transaction[]
}) {
    const router = useRouter();
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Payment Form State
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("CASH");

    async function handlePayment() {
        if (!amount || isNaN(parseFloat(amount))) {
            toast.error("Please enter a valid amount");
            return;
        }

        setLoading(true);
        try {
            const res = await paySupplier(supplierId, parseFloat(amount), method);
            if (res?.success) {
                toast.success("Payment recorded successfully");
                setIsPaymentModalOpen(false);
                setAmount("");
                setMethod("CASH");
                router.refresh();
            } else {
                toast.error(res?.error || "Failed to record payment");
            }
        } catch (error) {
            toast.error("An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    }

    const handlePrint = () => {
        const printContent = `
            <!DOCTYPE html>
            <html dir="${document.dir || 'ltr'}">
            <head>
                <title>Account Statement - ${supplierName}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #333; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
                    .company-info h1 { margin: 0; color: #06b6d4; }
                    .supplier-info h2 { margin: 0; }
                    .info-grid { display: grid; grid-cols: 2; gap: 20px; margin-bottom: 30px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background-color: #f8f9fa; font-weight: bold; }
                    .text-end { text-align: right; }
                    .status-tag { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
                    .balance-card { background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #ddd; display: inline-block; margin-top: 20px; }
                    .total-amount { font-size: 24px; font-weight: bold; color: ${balance > 0 ? '#ef4444' : '#10b981'}; }
                    @media print {
                        body { padding: 0; }
                        button { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-info">
                        <h1>Casper ERP</h1>
                        <p>Account Statement</p>
                    </div>
                    <div class="text-end">
                        <p>Date: ${new Date().toLocaleDateString()}</p>
                    </div>
                </div>

                <div class="info-grid">
                    <div class="supplier-info">
                        <h2>${supplierName}</h2>
                        ${phone ? `<p>Phone: ${phone}</p>` : ''}
                        ${email ? `<p>Email: ${email}</p>` : ''}
                        ${address ? `<p>Address: ${address}</p>` : ''}
                    </div>
                </div>

                <div class="balance-card">
                    <div style="font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 5px;">Current Balance</div>
                    <div class="total-amount">$${balance.toFixed(2)}</div>
                    <p style="font-size: 12px; margin-top: 5px; color: #666;">
                        ${balance > 0 ? 'Outstanding debt' : 'No outstanding debt'}
                    </p>
                </div>

                <h3>Transaction History (Last 50)</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Reference</th>
                            <th>Method</th>
                            <th class="text-end">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.map(tx => `
                            <tr>
                                <td>${new Date(tx.date).toLocaleDateString()}</td>
                                <td>${tx.type}</td>
                                <td>${tx.reference}</td>
                                <td>${tx.method || '-'}</td>
                                <td class="text-end" style="color: ${tx.isCredit ? '#10b981' : '#ef4444'}">
                                    ${tx.isCredit ? '-' : '+'}$${tx.amount.toFixed(2)}
                                </td>
                            </tr>
                            ${tx.items && tx.items.length > 0 ? `
                                <tr style="background-color: #fafafa; border-bottom: 2px solid #eee;">
                                    <td colspan="5" style="padding: 0;">
                                        <table style="width: 100%; font-size: 11px; margin: 0; border: none;">
                                            <thead style="background-color: #eee; font-weight: bold; color: #666;">
                                                <tr>
                                                    <th style="padding: 5px 10px 5px 60px; text-align: left; border: none;">Category</th>
                                                    <th style="padding: 5px 10px; text-align: left; border: none;">SKU</th>
                                                    <th style="padding: 5px 10px; text-align: left; border: none;">Product</th>
                                                    <th style="padding: 5px 10px; text-align: right; border: none;">Qty</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${tx.items.map(item => `
                                                    <tr>
                                                        <td style="padding: 5px 10px 5px 60px; border: none; color: #06b6d4;">${item.category}</td>
                                                        <td style="padding: 5px 10px; border: none; color: #888;">${item.sku}</td>
                                                        <td style="padding: 5px 10px; border: none;">${item.name}</td>
                                                        <td style="padding: 5px 10px; text-align: right; border: none; font-weight: bold;">${item.quantity}</td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </td>
                                </tr>
                            ` : ''}
                        `).join('')}


                    </tbody>
                </table>

                <div style="margin-top: 50px; border-top: 1px solid #ddd; padding-top: 20px; text-align: center; color: #999; font-size: 12px;">
                    This is an automated statement generated by Casper ERP.
                </div>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
        }
    };

    const PAYMENT_METHODS = [
        { id: 'CASH', label: 'Cash', icon: Banknote },
        { id: 'CARD', label: 'Card / Mada', icon: CreditCard },
        { id: 'TRANSFER', label: 'Bank Transfer', icon: Building2 },
        { id: 'SADAD', label: 'Sadad', icon: Receipt },
    ];

    return (
        <div className="glass-card p-4 border border-border rounded-xl">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-cyan-500" />
                Account Actions
            </h3>
            <div className="space-y-3">
                <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="w-full p-3 rounded-lg bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
                >
                    <Wallet className="w-4 h-4" />
                    Record Payment
                </button>
                <button
                    onClick={handlePrint}
                    className="w-full p-3 rounded-lg bg-cyan-500/10 text-cyan-500 font-bold hover:bg-cyan-500/20 transition-colors flex items-center justify-center gap-2"
                >
                    <Receipt className="w-4 h-4" />
                    Print Statement
                </button>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">
                Actions will open modal dialogs
            </p>

            {/* Payment Modal */}
            <GlassModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                title={`Pay ${supplierName}`}
            >
                <div className="space-y-6">
                    {/* Balance Info */}
                    <div className="bg-muted/50 p-4 rounded-xl text-center border border-border">
                        <div className="text-muted-foreground text-xs uppercase mb-1">Current Balance</div>
                        <div className={`text-2xl font-mono font-bold ${balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            ${balance.toFixed(2)}
                        </div>
                    </div>

                    {/* Amount Input */}
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">Payment Amount</label>
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
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-2 block">Payment Method</label>
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
                        Confirm Payment
                    </button>
                </div>
            </GlassModal>
        </div>
    );
}
