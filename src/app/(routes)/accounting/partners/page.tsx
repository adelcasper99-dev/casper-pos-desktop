"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HandCoins, PlusCircle, Users } from "lucide-react";
import { getNetProfit } from "@/lib/accounting/net-profit";
import { AddPartnerDialog } from "@/components/partners/AddPartnerDialog";
import { DistributeProfitDialog } from "@/components/partners/DistributeProfitDialog";
import { PartnerTransactionDialog } from "@/components/partners/PartnerTransactionDialog";
import { getPartners } from "@/features/partners/api/partner-service";
import { PartnerWithBalances } from "@/features/partners/types";

// This will be fetched from a Server Action later. Mocking structure for now to establish UI skeleton.
// We'll wire up the real data fetch in the next step.
export default function PartnersPage() {
    const [partners, setPartners] = useState<PartnerWithBalances[]>([]);
    const [loading, setLoading] = useState(true);

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isDistributeOpen, setIsDistributeOpen] = useState(false);
    
    // For transactions (Deposit/Drawing)
    const [selectedPartner, setSelectedPartner] = useState<PartnerWithBalances | null>(null);
    const [transactionType, setTransactionType] = useState<"DEPOSIT" | "DRAWING">("DEPOSIT");

    const fetchPartners = async () => {
        setLoading(true);
        const res = await getPartners();
        if (res.success && res.data) {
            setPartners(res.data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchPartners();
    }, []);

    const handleTransactionClick = (partner: PartnerWithBalances, type: "DEPOSIT" | "DRAWING") => {
        setSelectedPartner(partner);
        setTransactionType(type);
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Users className="w-8 h-8 text-cyan-500" /> 
                        شركاء رأس المال
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        إدارة حسابات الشركاء، الإيداعات، المسحوبات، وتوزيع الأرباح
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setIsAddOpen(true)} className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold">
                        <PlusCircle className="w-4 h-4 mr-2" />
                        إضافة شريك
                    </Button>
                    <Button onClick={() => setIsDistributeOpen(true)} variant="outline" className="border-cyan-500 text-cyan-500 hover:bg-cyan-500/10 font-bold">
                        <HandCoins className="w-4 h-4 mr-2" />
                        توزيع أرباح/خسائر
                    </Button>
                </div>
            </div>

            <Card className="shadow-xl border-border bg-card">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right">
                            <thead className="bg-muted/30 border-b text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-medium">اسم الشريك</th>
                                    <th className="px-4 py-3 font-medium">النسبة (%)</th>
                                    <th className="px-4 py-3 font-medium">حساب رأس المال</th>
                                    <th className="px-4 py-3 font-medium">الحساب الجاري</th>
                                    <th className="px-4 py-3 font-medium text-center">إجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-muted-foreground">جاري التحميل...</td>
                                    </tr>
                                ) : partners.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-muted-foreground">لا يوجد شركاء مضافين بعد</td>
                                    </tr>
                                ) : (
                                    partners.map(p => (
                                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/10">
                                            <td className="px-4 py-3 font-bold">{p.name}</td>
                                            <td className="px-4 py-3 text-cyan-400 font-mono">{p.profitShare}%</td>
                                            <td className="px-4 py-3 font-mono text-muted-foreground">
                                                {p.capitalGlCode} <br />
                                                <span className="text-xs text-foreground/70">رصيد: {p.capitalBalance}</span>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-muted-foreground">
                                                {p.currentGlCode} <br />
                                                <span className={`text-xs ${p.currentBalance < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                    رصيد: {p.currentBalance}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-center gap-2">
                                                    <Button size="sm" variant="outline" className="h-8 text-green-400 border-green-500/30 hover:bg-green-500/10" onClick={() => handleTransactionClick(p, "DEPOSIT")}>
                                                        إيداع
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="h-8 text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => handleTransactionClick(p, "DRAWING")}>
                                                        سحب
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Dialogs */}
            <AddPartnerDialog open={isAddOpen} onOpenChange={setIsAddOpen} onSuccess={fetchPartners} />
            <DistributeProfitDialog open={isDistributeOpen} onOpenChange={setIsDistributeOpen} onSuccess={fetchPartners} />
            <PartnerTransactionDialog partner={selectedPartner} type={transactionType} open={!!selectedPartner} onOpenChange={(o: boolean) => !o && setSelectedPartner(null)} onSuccess={fetchPartners} />
        </div>
    );
}
