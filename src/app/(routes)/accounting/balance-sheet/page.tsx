"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Printer, AlertTriangle, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { FlatpickrDatePicker } from "@/components/ui/FlatpickrDatePicker";
import { fetchBalanceSheetData } from "@/actions/balance-sheet-action";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { format } from "date-fns";

export default function BalanceSheetPage() {
    const [asOfDate, setAsOfDate] = useState<Date>(new Date());
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Accordion states for sub-sections
    const [expandedSections, setExpandedSections] = useState({
        currentAssets: true,
        fixedAssets: true,
        currentLiabilities: true,
        capital: true,
        currentAccounts: true,
        retainedEarnings: true
    });

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const loadData = async (date: Date) => {
        setLoading(true);
        setError(null);
        const res = await fetchBalanceSheetData(date);
        if (res.success && res.data) {
            setData(res.data);
        } else {
            setError(res.error || "فشل حساب الميزانية العمومية");
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData(asOfDate);
    }, [asOfDate]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat("ar-EG", {
            style: "currency",
            currency: "EGP",
            minimumFractionDigits: 2
        }).format(val);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto print:p-0 print:max-w-full">
            {/* Header / Filter Row */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <FileText className="w-8 h-8 text-cyan-500" />
                        الميزانية العمومية (Balance Sheet)
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        بيان المركز المالي للشركة وعرض الأصول والخصوم وحقوق الملكية
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-lg border border-border">
                        <Calendar className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm font-medium">حتى تاريخ:</span>
                        <FlatpickrDatePicker
                            defaultValue={format(asOfDate, "yyyy-MM-dd")}
                            onChange={(date) => date && setAsOfDate(date)}
                            className="w-36 h-9 border-0 bg-transparent text-sm font-bold"
                        />
                    </div>
                    <Button onClick={handlePrint} variant="outline" className="border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-400 font-bold h-10">
                        <Printer className="w-4 h-4 mr-2" />
                        طباعة التقرير
                    </Button>
                </div>
            </div>

            {/* Imbalance Alert Banner */}
            {data && !data.isBalanced && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3 text-red-400 print:hidden animate-pulse">
                    <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                    <div>
                        <h4 className="font-bold text-lg">تحذير: الميزانية غير متزنة!</h4>
                        <p className="text-sm opacity-90">
                            هناك فرق قدره <span className="font-mono font-bold">{formatCurrency(data.imbalanceAmount)}</span> بين إجمالي الأصول وإجمالي الخصوم وحقوق الملكية. يرجى التحقق من الأرصدة الافتتاحية أو القيود اليدوية.
                        </p>
                    </div>
                </div>
            )}

            {/* Printable Report Header */}
            <div className="hidden print:block text-center border-b pb-6 mb-6">
                <h1 className="text-3xl font-bold">تقرير الميزانية العمومية</h1>
                <p className="text-lg mt-2">حتى تاريخ: {format(asOfDate, "dd-MM-yyyy")}</p>
                <div className="text-sm text-muted-foreground mt-1">تم الإنشاء تلقائياً بواسطة نظام Casper POS</div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <CasperLoader width={60} />
                    <p className="text-muted-foreground">جاري تحميل بيانات المركز المالي...</p>
                </div>
            ) : error ? (
                <Card className="border-red-500/20 bg-red-500/5">
                    <CardContent className="p-8 text-center text-red-400 space-y-4">
                        <AlertTriangle className="w-12 h-12 mx-auto" />
                        <h3 className="text-xl font-bold">خطأ في تحميل التقرير</h3>
                        <p>{error}</p>
                    </CardContent>
                </Card>
            ) : data ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4">
                    
                    {/* Right Column: Assets (الأصول) */}
                    <div className="space-y-6">
                        <Card className="shadow-xl border-border bg-card overflow-hidden">
                            <CardHeader className="bg-muted/10 border-b py-4">
                                <CardTitle className="text-xl font-bold flex justify-between items-center text-cyan-400">
                                    <span>الأصول (Assets)</span>
                                    <span className="font-mono">{formatCurrency(data.assets.totalAssets)}</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 divide-y divide-border">
                                {/* Current Assets */}
                                <div className="p-4 space-y-2">
                                    <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSection("currentAssets")}>
                                        <h3 className="font-bold flex items-center gap-2 text-foreground/90">
                                            {expandedSections.currentAssets ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                            {data.assets.currentAssets.title}
                                        </h3>
                                        <span className="font-bold font-mono">{formatCurrency(data.assets.currentAssets.total)}</span>
                                    </div>
                                    {expandedSections.currentAssets && (
                                        <div className="pl-6 pr-2 space-y-2 pt-2 text-sm">
                                            {data.assets.currentAssets.items.map((item: any) => (
                                                <div key={item.code} className="flex justify-between items-center text-muted-foreground hover:text-foreground">
                                                    <span>{item.name} <span className="text-xs opacity-50 font-mono">({item.code})</span></span>
                                                    <span className="font-mono">{formatCurrency(item.balance)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Fixed Assets */}
                                <div className="p-4 space-y-2">
                                    <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSection("fixedAssets")}>
                                        <h3 className="font-bold flex items-center gap-2 text-foreground/90">
                                            {expandedSections.fixedAssets ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                            {data.assets.fixedAssets.title}
                                        </h3>
                                        <span className="font-bold font-mono">{formatCurrency(data.assets.fixedAssets.total)}</span>
                                    </div>
                                    {expandedSections.fixedAssets && (
                                        <div className="pl-6 pr-2 space-y-2 pt-2 text-sm">
                                            {data.assets.fixedAssets.items.map((item: any) => (
                                                <div key={item.code} className="flex justify-between items-center text-muted-foreground hover:text-foreground">
                                                    <span>{item.name} <span className="text-xs opacity-50 font-mono">({item.code})</span></span>
                                                    <span className={`font-mono ${item.balance < 0 ? 'text-red-400 font-bold' : ''}`}>{formatCurrency(item.balance)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Left Column: Liabilities & Equity (الخصوم وحقوق الملكية) */}
                    <div className="space-y-6">
                        <Card className="shadow-xl border-border bg-card overflow-hidden">
                            <CardHeader className="bg-muted/10 border-b py-4">
                                <CardTitle className="text-xl font-bold flex justify-between items-center text-green-400">
                                    <span>الخصوم وحقوق الملكية (Liabilities & Equity)</span>
                                    <span className="font-mono">{formatCurrency(data.totalLiabilitiesAndEquity)}</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 divide-y divide-border">
                                
                                {/* Current Liabilities */}
                                <div className="p-4 space-y-2">
                                    <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSection("currentLiabilities")}>
                                        <h3 className="font-bold flex items-center gap-2 text-foreground/90">
                                            {expandedSections.currentLiabilities ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                            {data.liabilities.currentLiabilities.title}
                                        </h3>
                                        <span className="font-bold font-mono">{formatCurrency(data.liabilities.currentLiabilities.total)}</span>
                                    </div>
                                    {expandedSections.currentLiabilities && (
                                        <div className="pl-6 pr-2 space-y-2 pt-2 text-sm">
                                            {data.liabilities.currentLiabilities.items.map((item: any) => (
                                                <div key={item.code} className="flex justify-between items-center text-muted-foreground hover:text-foreground">
                                                    <span>{item.name} <span className="text-xs opacity-50 font-mono">({item.code})</span></span>
                                                    <span className="font-mono">{formatCurrency(item.balance)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Capital Section */}
                                <div className="p-4 space-y-2">
                                    <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSection("capital")}>
                                        <h3 className="font-bold flex items-center gap-2 text-foreground/90">
                                            {expandedSections.capital ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                            {data.equity.capital.title}
                                        </h3>
                                        <span className="font-bold font-mono">{formatCurrency(data.equity.capital.total)}</span>
                                    </div>
                                    {expandedSections.capital && (
                                        <div className="pl-6 pr-2 space-y-2 pt-2 text-sm">
                                            {data.equity.capital.items.map((item: any) => (
                                                <div key={item.code} className="flex justify-between items-center text-muted-foreground hover:text-foreground">
                                                    <span>{item.name} <span className="text-xs opacity-50 font-mono">({item.code})</span></span>
                                                    <span className="font-mono">{formatCurrency(item.balance)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Partner Current Accounts / Drawings */}
                                <div className="p-4 space-y-2">
                                    <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSection("currentAccounts")}>
                                        <h3 className="font-bold flex items-center gap-2 text-foreground/90">
                                            {expandedSections.currentAccounts ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                            {data.equity.currentAccounts.title}
                                        </h3>
                                        <span className="font-bold font-mono">{formatCurrency(data.equity.currentAccounts.total)}</span>
                                    </div>
                                    {expandedSections.currentAccounts && (
                                        <div className="pl-6 pr-2 space-y-2 pt-2 text-sm">
                                            {data.equity.currentAccounts.items.map((item: any) => (
                                                <div key={item.code} className="flex justify-between items-center text-muted-foreground hover:text-foreground">
                                                    <span>{item.name} <span className="text-xs opacity-50 font-mono">({item.code})</span></span>
                                                    <span className={`font-mono ${item.balance < 0 ? 'text-red-400' : 'text-green-400'}`}>{formatCurrency(item.balance)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Retained Earnings */}
                                <div className="p-4 space-y-2">
                                    <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSection("retainedEarnings")}>
                                        <h3 className="font-bold flex items-center gap-2 text-foreground/90">
                                            {expandedSections.retainedEarnings ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                            {data.equity.retainedEarnings.title}
                                        </h3>
                                        <span className="font-bold font-mono">{formatCurrency(data.equity.retainedEarnings.total)}</span>
                                    </div>
                                    {expandedSections.retainedEarnings && (
                                        <div className="pl-6 pr-2 space-y-2 pt-2 text-sm">
                                            {data.equity.retainedEarnings.items.map((item: any) => (
                                                <div key={item.code} className="flex justify-between items-center text-muted-foreground hover:text-foreground">
                                                    <span>{item.name} <span className="text-xs opacity-50 font-mono">({item.code})</span></span>
                                                    <span className="font-mono">{formatCurrency(item.balance)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Current Period Net Profit */}
                                <div className="p-4 flex justify-between items-center bg-cyan-500/5">
                                    <h3 className="font-bold text-foreground/90">صافي ربح/خسارة الفترة الحالية (Current Period Net Profit)</h3>
                                    <span className={`font-bold font-mono ${data.equity.currentPeriodProfit >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                                        {formatCurrency(data.equity.currentPeriodProfit)}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                </div>
            ) : null}
        </div>
    );
}
