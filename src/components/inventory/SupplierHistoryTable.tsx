"use client";

import { format } from "date-fns";
import { ArrowUpRight, ArrowDownLeft, FileText, DollarSign, Calendar, Hash } from "lucide-react";
import { Fragment } from "react";

interface Transaction {
    id: string;
    date: Date;
    type: 'INVOICE' | 'PAYMENT';
    reference: string;
    amount: number;
    status: string;
    isCredit: boolean; // true = reduces debt (Payment), false = increases debt (Invoice)
    method?: string;
    items?: {
        name: string;
        sku: string;
        category: string;
        quantity: number;
        unitCost: number;
    }[];
}

export default function SupplierHistoryTable({ transactions }: { transactions: Transaction[] }) {
    if (transactions.length === 0) {
        return (
            <div className="p-12 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p>No transaction history found.</p>
            </div>
        );
    }

    return (
        <div className="glass-card overflow-hidden bg-card border border-border animate-fade-in-up">
            <div className="overflow-x-auto">
                <table className="w-full text-start">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                        <tr>
                            <th className="p-4 text-start">Date</th>
                            <th className="p-4 text-start">Type</th>
                            <th className="p-4 text-start">Reference</th>
                            <th className="p-4 text-start">Status</th>
                            <th className="p-4 text-end">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm">
                        {transactions.map((tx) => (
                            <Fragment key={tx.id}>
                                <tr className="hover:bg-muted/50 transition-colors group">
                                    <td className="p-4 text-muted-foreground whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-3.5 h-3.5 opacity-70" />
                                            {format(new Date(tx.date), "MMM d, yyyy")}
                                        </div>
                                        <div className="text-xs opacity-50 pl-5.5">
                                            {format(new Date(tx.date), "h:mm a")}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className={`flex items-center gap-2 font-medium ${tx.type === 'INVOICE' ? 'text-amber-500' : 'text-emerald-500'}`}>
                                            {tx.type === 'INVOICE' ? (
                                                <ArrowDownLeft className="w-4 h-4" />
                                            ) : (
                                                <ArrowUpRight className="w-4 h-4" />
                                            )}
                                            {tx.type}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2 text-foreground font-mono">
                                                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                                                {tx.reference}
                                            </div>
                                            {tx.method && (
                                                <div className="text-xs text-muted-foreground uppercase opacity-70">
                                                    via {tx.method}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${tx.status === 'PAID' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                            tx.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                tx.status === 'PARTIAL' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                                    tx.status === 'VOIDED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                        'bg-muted text-muted-foreground border-border'
                                            }`}>
                                            {tx.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-end font-mono text-base font-bold">
                                        <span className={tx.isCredit ? 'text-green-500' : 'text-red-500'}>
                                            {tx.isCredit ? '-' : '+'}${tx.amount.toFixed(2)}
                                        </span>
                                    </td>
                                </tr>
                                {tx.items && tx.items.length > 0 && (
                                    <tr className="bg-muted/5 border-l-4 border-indigo-500/30">
                                        <td colSpan={5} className="p-0">
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-muted/30 text-muted-foreground uppercase">
                                                        <tr>
                                                            <th className="px-14 py-2 text-start">Category</th>
                                                            <th className="px-4 py-2 text-start">SKU</th>
                                                            <th className="px-4 py-2 text-start">Product</th>
                                                            <th className="px-4 py-2 text-end">Qty</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/50">
                                                        {tx.items.map((item, idx) => (
                                                            <tr key={idx} className="hover:bg-muted/10">
                                                                <td className="px-14 py-2 text-indigo-400 font-medium">{item.category}</td>
                                                                <td className="px-4 py-2 font-mono opacity-70">{item.sku}</td>
                                                                <td className="px-4 py-2 text-foreground">{item.name}</td>
                                                                <td className="px-4 py-2 text-end font-bold">{item.quantity}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
