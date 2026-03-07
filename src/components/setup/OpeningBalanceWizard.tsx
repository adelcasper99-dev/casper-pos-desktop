"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { setOpeningBalances } from "@/actions/accounting-setup";
import { Calculator, CheckCircle2, Landmark, Package, Users, Building2, Briefcase } from "lucide-react";
import Decimal from "decimal.js";

export default function OpeningBalanceWizard() {
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const [balances, setBalances] = useState({
        cash: "0",
        bank: "0",
        inventory: "0",
        receivables: "0",
        payables: "0",
        equity: "0" // Auto-calculated to balance
    });

    // Auto-calculate equity to balance the accounting equation: Assets = Liabilities + Equity
    // Assets: Cash + Bank + Inventory + Receivables
    // Liabilities: Payables
    // Equity = Assets - Liabilities
    useEffect(() => {
        try {
            const assets = new Decimal(balances.cash || 0)
                .plus(balances.bank || 0)
                .plus(balances.inventory || 0)
                .plus(balances.receivables || 0);

            const liabilities = new Decimal(balances.payables || 0);
            const calculatedEquity = assets.minus(liabilities);

            setBalances(prev => ({
                ...prev,
                equity: calculatedEquity.toFixed(2)
            }));
        } catch (e) {
            // Ignore invalid num inputs gracefully
        }
    }, [balances.cash, balances.bank, balances.inventory, balances.receivables, balances.payables]);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const payload = {
                cash: parseFloat(balances.cash || "0"),
                bank: parseFloat(balances.bank || "0"),
                inventory: parseFloat(balances.inventory || "0"),
                receivables: parseFloat(balances.receivables || "0"),
                payables: parseFloat(balances.payables || "0"),
                equity: parseFloat(balances.equity || "0")
            };

            const res = await setOpeningBalances(payload);
            if (res.success) {
                toast.success("تم تسجيل الأرصدة الافتتاحية بنجاح");
                setDone(true);
            } else {
                toast.error(res.error || "حدث خطأ أثناء حفظ الأرصدة");
            }
        } catch (error: any) {
            toast.error(error.message || "فشل الاتصال بالخادم");
        } finally {
            setLoading(false);
        }
    };

    if (done) {
        return (
            <Card className="shadow-xl border-border max-w-2xl mx-auto mt-8 animate-in zoom-in duration-500">
                <CardContent className="py-12 text-center space-y-6 text-foreground">
                    <div className="flex justify-center">
                        <div className="p-4 bg-green-500/20 rounded-full border border-green-500/30">
                            <CheckCircle2 className="w-16 h-16 text-green-500" />
                        </div>
                    </div>
                    <h2 className="text-3xl font-bold">تم حفظ الأرصدة الافتتاحية</h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                        تم تكوين القيد الافتتاحي بنجاح في النظام المحاسبي. الأرصدة الآن جاهزة لبدء العمليات.
                    </p>
                    <Button onClick={() => window.location.reload()} className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold">
                        إغلاق
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="shadow-xl border-border max-w-3xl mx-auto mt-8">
            <CardHeader className="bg-muted/30 border-b border-border">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500 rounded-lg shrink-0">
                        <Calculator className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-bold">الأرصدة الافتتاحية</CardTitle>
                        <CardDescription className="text-muted-foreground text-sm">
                            أدخل الأرصدة الافتتاحية لشركتك. سيقوم النظام بإنشاء قيد محاسبي مزدوج (Double-Entry) لضبط الميزانية تلقائياً. المبالغ بالعملة المحلية.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
                <div className="grid md:grid-cols-2 gap-8">
                    {/* Assets Section */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold border-b pb-2 text-cyan-500 flex items-center gap-2">
                            <Landmark className="w-5 h-5" /> الأصول (Assets)
                        </h3>

                        <div className="space-y-2">
                            <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-1">
                                النقدية بالخزينة
                            </Label>
                            <Input
                                type="number" step="0.01"
                                className="glass-input font-mono text-lg"
                                value={balances.cash}
                                onChange={e => setBalances(prev => ({ ...prev, cash: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> أرصدة البنوك
                            </Label>
                            <Input
                                type="number" step="0.01"
                                className="glass-input font-mono text-lg"
                                value={balances.bank}
                                onChange={e => setBalances(prev => ({ ...prev, bank: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-1">
                                <Package className="w-3 h-3" /> قيمة المخزون الحالي
                            </Label>
                            <Input
                                type="number" step="0.01"
                                className="glass-input font-mono text-lg"
                                value={balances.inventory}
                                onChange={e => setBalances(prev => ({ ...prev, inventory: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-1">
                                <Users className="w-3 h-3" /> ديون على العملاء (مستحقات لنا)
                            </Label>
                            <Input
                                type="number" step="0.01"
                                className="glass-input font-mono text-lg"
                                value={balances.receivables}
                                onChange={e => setBalances(prev => ({ ...prev, receivables: e.target.value }))}
                            />
                        </div>
                    </div>

                    {/* Liabilities & Equity Section */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold border-b pb-2 text-red-400 flex items-center gap-2">
                            <Briefcase className="w-5 h-5" /> الالتزامات (Liabilities)
                        </h3>

                        <div className="space-y-2">
                            <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-1">
                                ديون للموردين (مستحقات علينا)
                            </Label>
                            <Input
                                type="number" step="0.01"
                                className="glass-input font-mono text-lg"
                                value={balances.payables}
                                onChange={e => setBalances(prev => ({ ...prev, payables: e.target.value }))}
                            />
                        </div>

                        <div className="pt-6">
                            <h3 className="text-lg font-bold border-b pb-2 text-indigo-400">
                                حقوق الملكية (Equity)
                            </h3>
                            <div className="mt-4 p-4 bg-muted/30 rounded-xl border border-border">
                                <Label className="text-xs uppercase font-bold text-muted-foreground mb-1 block">
                                    رأس المال (محسوب تلقائياً)
                                </Label>
                                <div className="text-2xl font-mono font-bold text-foreground">
                                    {balances.equity}
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    رأس المال = الأصول - الالتزامات
                                    (لضمان توازن القيد الافتتاحي)
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t border-border p-6 flex justify-end">
                <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-8 shadow-lg shadow-cyan-500/20"
                >
                    {loading ? <CasperLoader width={20} /> : "حفظ وإنشاء القيد الافتتاحي"}
                </Button>
            </CardFooter>
        </Card>
    );
}
