"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { distributeProfitLoss } from "@/features/partners/api/partner-service";
import { fetchNetProfitData } from "@/actions/balance-sheet-action";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import Decimal from "decimal.js";

interface DistributeProfitDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function DistributeProfitDialog({ open, onOpenChange, onSuccess }: DistributeProfitDialogProps) {
    const [dateRange, setDateRange] = useState<Date[]>([startOfMonth(new Date()), endOfMonth(new Date())]);
    const [loading, setLoading] = useState(false);
    const [calculating, setCalculating] = useState(false);
    const [netAmount, setNetAmount] = useState<number | null>(null);

    // Fetch profit/loss when date changes
    useEffect(() => {
        if (open && dateRange.length === 2) {
            fetchNetProfit(dateRange[0], dateRange[1]);
        }
    }, [open, dateRange]);

    const fetchNetProfit = async (start: Date, end: Date) => {
        setCalculating(true);
        try {
            const result = await fetchNetProfitData(start, end);
            if (result.success && result.data) {
                setNetAmount(result.data.netProfit);
            } else {
                toast.error(result.error || "فشل حساب صافي الربح");
                setNetAmount(null);
            }
        } catch (error) {
            toast.error("فشل حساب صافي الربح");
            setNetAmount(null);
        }
        setCalculating(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (dateRange.length !== 2) {
            toast.error("الرجاء اختيار فترة التوزيع");
            return;
        }

        if (netAmount === null) {
            toast.error("لم يتم حساب الأرباح بعد");
            return;
        }

        if (netAmount === 0) {
            toast.error("الرصيد صفر، لا يوجد شيء لتوزيعه");
            return;
        }

        if (!confirm(`هل أنت متأكد من توزيع ${netAmount > 0 ? 'أرباح' : 'خسائر'} بقيمة ${Math.abs(netAmount)}؟\nهذا الإجراء سيقوم بإنشاء قيود محاسبية ولا يمكن التراجع عنه بسهولة.`)) {
            return;
        }

        setLoading(true);
        const res = await distributeProfitLoss({
            periodFrom: dateRange[0],
            periodTo: dateRange[1],
            netAmount
        });

        if (res.success) {
            toast.success("تم توزيع الأرباح/الخسائر بنجاح");
            onSuccess();
            onOpenChange(false);
        } else {
            toast.error(res.error || "حدث خطأ أثناء التوزيع");
        }
        setLoading(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle>توزيع الأرباح والخسائر</DialogTitle>
                    <DialogDescription>
                        حساب صافي الربح لفترة محددة وتوزيعه تلقائياً على الحسابات الجارية للشركاء بناءً على نسبة كل شريك.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                    <div className="space-y-2">
                        <Label>الفترة المالية</Label>
                        <FlatpickrRangePicker
                            initialDates={dateRange}
                            onRangeChange={(dates: Date[]) => {
                                if (dates && dates.length === 2) {
                                    const start = dates[0];
                                    const end = dates[1];
                                    start.setHours(0, 0, 0, 0);
                                    end.setHours(23, 59, 59, 999);
                                    setDateRange([start, end]);
                                }
                            }}
                            onClear={() => {
                                setDateRange([]);
                            }}
                        />
                    </div>

                    <div className="p-4 bg-muted/30 rounded-xl border border-border text-center space-y-2">
                        <Label className="text-muted-foreground">صافي نتيجة الفترة</Label>
                        {calculating ? (
                            <div className="flex justify-center py-2"><CasperLoader width={24} /></div>
                        ) : netAmount !== null ? (
                            <div className={`text-3xl font-mono font-bold ${netAmount > 0 ? 'text-green-500' : netAmount < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                {netAmount > 0 ? "+" : ""}{netAmount.toLocaleString()}
                                <div className="text-sm font-normal mt-1 text-foreground/70">
                                    {netAmount > 0 ? "أرباح قابلة للتوزيع" : netAmount < 0 ? "خسائر سيتم خصمها" : "لا يوجد أرباح أو خسائر"}
                                </div>
                            </div>
                        ) : (
                            <div className="text-xl text-muted-foreground">---</div>
                        )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            إلغاء
                        </Button>
                        <Button 
                            type="submit" 
                            disabled={loading || calculating || netAmount === null || netAmount === 0} 
                            className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold"
                        >
                            {loading ? <CasperLoader width={20} /> : "تأكيد التوزيع"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
