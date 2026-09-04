"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { setOpeningBalances } from "@/actions/accounting-setup";
import { repairAccounting } from "@/actions/accounting";
import { Calculator, CheckCircle2, Landmark, Package, Users, Building2, Briefcase, RefreshCw } from "lucide-react";
import Decimal from "decimal.js";

export default function OpeningBalanceWizard() {
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [repairing, setRepairing] = useState(false);

    const handleRepair = async () => {
        setRepairing(true);
        try {
            const res = await repairAccounting();
            if (res?.success) {
                toast.success("تم مزامنة دليل الحسابات بنجاح ✅");
            } else {
                toast.error(res?.error || "فشل إصلاح الحسابات");
            }
        } catch (e: unknown) {
            toast.error((e as Error)?.message || "خطأ في النظام");
        } finally {
            setRepairing(false);
        }
    };


    const [balances, setBalances] = useState({
        cash: "0",
        bank: "0",
        inventory: "0",
        receivables: "0",
        payables: "0",
        fixedAssets: "0",
        vehicles: "0",
        depreciation: "0",
        equity: "0" // Auto-calculated to balance
    });

    // Auto-calculate equity to balance the accounting equation: Assets = Liabilities + Equity
    // Assets: Cash + Bank + Inventory + Receivables + FixedAssets + Vehicles - Depreciation
    // Liabilities: Payables
    // Equity = Assets - Liabilities
    useEffect(() => {
        try {
            const assets = new Decimal(balances.cash || 0)
                .plus(new Decimal(balances.bank || 0))
                .plus(new Decimal(balances.inventory || 0))
                .plus(new Decimal(balances.receivables || 0))
                .plus(new Decimal(balances.fixedAssets || 0))
                .plus(new Decimal(balances.vehicles || 0))
                .minus(new Decimal(balances.depreciation || 0));

            const liabilities = new Decimal(balances.payables || 0);
            const calculatedEquity = assets.minus(liabilities);

            setBalances(prev => ({
                ...prev,
                equity: calculatedEquity.toFixed(2)
            }));
        } catch (e) {
            // Ignore invalid num inputs gracefully
        }
    }, [balances.cash, balances.bank, balances.inventory, balances.receivables, balances.payables, balances.fixedAssets, balances.vehicles, balances.depreciation]);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const cashDec = new Decimal(balances.cash || "0");
            const bankDec = new Decimal(balances.bank || "0");
            const invDec = new Decimal(balances.inventory || "0");
            const recDec = new Decimal(balances.receivables || "0");
            const fixDec = new Decimal(balances.fixedAssets || "0");
            const vehDec = new Decimal(balances.vehicles || "0");
            const depDec = new Decimal(balances.depreciation || "0");
            const payDec = new Decimal(balances.payables || "0");
            const eqDec = new Decimal(balances.equity || "0");

            const totalAssets = cashDec.plus(bankDec).plus(invDec).plus(recDec).plus(fixDec).plus(vehDec).minus(depDec);
            const totalClaims = payDec.plus(eqDec);

            if (!totalAssets.equals(totalClaims)) {
                toast.error("الميزانية غير متطابقة محاسبياً: الأصول يجب أن تعادل الالتزامات + حقوق الملكية");
                setLoading(false);
                return;
            }

            const payload = {
                cash: cashDec.toNumber(),
                bank: bankDec.toNumber(),
                inventory: invDec.toNumber(),
                receivables: recDec.toNumber(),
                payables: payDec.toNumber(),
                fixedAssets: fixDec.toNumber(),
                vehicles: vehDec.toNumber(),
                depreciation: depDec.toNumber(),
                equity: eqDec.toNumber()
            };

            const res = await setOpeningBalances(payload);
            if (res?.success) {
                toast.success("تم تسجيل الأرصدة الافتتاحية بنجاح");
                setDone(true);
            } else {
                toast.error(res?.error || "حدث خطأ أثناء حفظ الأرصدة");
            }
        } catch (error: unknown) {
            toast.error((error as Error)?.message || "فشل الاتصال بالخادم");
        } finally {
            setLoading(false);
        }
    };

    if (done) {
        return (
            <Card className="shadow-xl border-border max-w-xl mx-auto mt-4 rounded-2xl animate-in zoom-in duration-300">
                <CardContent className="py-8 text-center space-y-4 text-foreground">
                    <div className="flex justify-center">
                        <div className="p-3 bg-green-500/20 rounded-full border border-green-500/30">
                            <CheckCircle2 className="w-10 h-10 text-green-500" />
                        </div>
                    </div>
                    <h2 className="text-xl font-bold">تم حفظ الأرصدة الافتتاحية بنجاح</h2>
                    <p className="text-muted-foreground text-xs max-w-sm mx-auto">
                        تم تكوين القيد الافتتاحي المزدوج بنجاح في النظام المحاسبي. الأرصدة جاهزة لبدء العمليات.
                    </p>
                    <Button onClick={() => window.location.reload()} className="h-8 text-xs bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-6 rounded-xl cursor-pointer">
                        إغلاق
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="max-w-5xl space-y-3 animate-in fade-in duration-500">
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto pr-1 custom-scrollbar space-y-3">
                {/* ── Accounting Tools & Repair ── */}
                <Card className="shadow-sm border-border bg-cyan-500/5 rounded-xl">
                    <CardHeader className="p-2.5 px-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-cyan-500/20 rounded-lg shrink-0">
                                    <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${repairing ? 'animate-spin' : ''}`} />
                                </div>
                                <div>
                                    <CardTitle className="text-xs font-bold text-foreground">أدوات المحاسبة والتطابق</CardTitle>
                                    <CardDescription className="text-[10px] text-muted-foreground">إصلاح وتحديث دليل الحسابات وتطابق الأرصدة</CardDescription>
                                </div>
                            </div>
                            <Button
                                onClick={handleRepair}
                                disabled={repairing}
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs bg-cyan-500 hover:bg-cyan-400 text-black font-bold flex gap-1.5 items-center cursor-pointer"
                            >
                                {repairing ? <CasperLoader width={14} /> : <RefreshCw className="w-3 h-3" />}
                                مزامنة الدليل
                            </Button>
                        </div>
                    </CardHeader>
                </Card>

                {/* ── Main Opening Balance Form ── */}
                <Card className="shadow-md border-border rounded-2xl overflow-hidden">
                    <CardHeader className="bg-muted/20 border-b border-border p-3 pb-2">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-indigo-500/20 rounded-lg shrink-0">
                                <Calculator className="w-4 h-4 text-indigo-400" />
                            </div>
                            <div>
                                <CardTitle className="text-sm font-bold text-foreground">الأرصدة الافتتاحية (Opening Balances)</CardTitle>
                                <CardDescription className="text-[11px] text-muted-foreground">
                                    أدخل الأرصدة لضبط الميزانية تلقائياً عبر قيد مزدوج متوازن. المبالغ بالعملة المحلية.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-3 space-y-3">
                        <div className="grid md:grid-cols-2 gap-3">
                            {/* Assets Section */}
                            <div className="space-y-2.5 p-3 rounded-xl bg-card/40 border border-border/40">
                                <h3 className="text-xs font-bold border-b border-border/40 pb-1.5 text-cyan-400 flex items-center gap-1.5">
                                    <Landmark className="w-3.5 h-3.5" /> الأصول (Assets)
                                </h3>

                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                        النقدية بالخزينة
                                    </Label>
                                    <Input
                                        type="number" step="0.01"
                                        className="h-8 text-xs font-mono bg-background/50"
                                        value={balances.cash}
                                        onChange={e => setBalances(prev => ({ ...prev, cash: e.target.value }))}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                        <Building2 className="w-3 h-3" /> أرصدة البنوك
                                    </Label>
                                    <Input
                                        type="number" step="0.01"
                                        className="h-8 text-xs font-mono bg-background/50"
                                        value={balances.bank}
                                        onChange={e => setBalances(prev => ({ ...prev, bank: e.target.value }))}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                        <Package className="w-3 h-3" /> قيمة المخزون الحالي
                                    </Label>
                                    <Input
                                        type="number" step="0.01"
                                        className="h-8 text-xs font-mono bg-background/50"
                                        value={balances.inventory}
                                        onChange={e => setBalances(prev => ({ ...prev, inventory: e.target.value }))}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                        <Users className="w-3 h-3" /> ديون على العملاء (مستحقات لنا)
                                    </Label>
                                    <Input
                                        type="number" step="0.01"
                                        className="h-8 text-xs font-mono bg-background/50"
                                        value={balances.receivables}
                                        onChange={e => setBalances(prev => ({ ...prev, receivables: e.target.value }))}
                                    />
                                </div>

                                <div className="pt-1 border-t border-border/30 space-y-1.5">
                                    <h4 className="text-[11px] font-bold text-cyan-400">الأصول الثابتة</h4>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                                            معدات وآلات وأثاث
                                        </Label>
                                        <Input
                                            type="number" step="0.01"
                                            className="h-8 text-xs font-mono bg-background/50"
                                            value={balances.fixedAssets}
                                            onChange={e => setBalances(prev => ({ ...prev, fixedAssets: e.target.value }))}
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                                            سيارات ووسائل نقل
                                        </Label>
                                        <Input
                                            type="number" step="0.01"
                                            className="h-8 text-xs font-mono bg-background/50"
                                            value={balances.vehicles}
                                            onChange={e => setBalances(prev => ({ ...prev, vehicles: e.target.value }))}
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase font-bold text-rose-400">
                                            إهلاك متراكم (يخصم من الأصول)
                                        </Label>
                                        <Input
                                            type="number" step="0.01"
                                            className="h-8 text-xs font-mono bg-background/50 text-rose-400"
                                            value={balances.depreciation}
                                            onChange={e => setBalances(prev => ({ ...prev, depreciation: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Liabilities & Equity Section */}
                            <div className="space-y-2.5 p-3 rounded-xl bg-card/40 border border-border/40 flex flex-col justify-between">
                                <div className="space-y-2.5">
                                    <h3 className="text-xs font-bold border-b border-border/40 pb-1.5 text-rose-400 flex items-center gap-1.5">
                                        <Briefcase className="w-3.5 h-3.5" /> الالتزامات (Liabilities)
                                    </h3>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                                            ديون للموردين (مستحقات علينا)
                                        </Label>
                                        <Input
                                            type="number" step="0.01"
                                            className="h-8 text-xs font-mono bg-background/50"
                                            value={balances.payables}
                                            onChange={e => setBalances(prev => ({ ...prev, payables: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-border/40">
                                    <h3 className="text-xs font-bold border-b border-border/40 pb-1.5 text-indigo-400">
                                        حقوق الملكية (Equity)
                                    </h3>
                                    <div className="mt-2 p-2.5 bg-muted/30 rounded-xl border border-border/50">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">
                                            رأس المال (محسوب تلقائياً)
                                        </Label>
                                        <div className="text-lg font-mono font-black text-foreground">
                                            {balances.equity}
                                        </div>
                                        <p className="text-[9px] text-muted-foreground mt-1">
                                            رأس المال = الأصول - الالتزامات (لضمان توازن القيد الافتتاحي بدقة)
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/20 border-t border-border/20 p-2.5 px-3 flex justify-end">
                        <Button
                            onClick={handleSubmit}
                            disabled={loading}
                            size="sm"
                            className="h-8 text-xs bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-5 shadow-xs cursor-pointer"
                        >
                            {loading ? <CasperLoader width={16} /> : "حفظ وإنشاء القيد الافتتاحي"}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
