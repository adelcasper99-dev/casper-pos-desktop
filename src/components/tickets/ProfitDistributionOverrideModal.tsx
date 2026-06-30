"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Database, Loader2, Calculator } from "lucide-react";
import GlassModal from "@/components/ui/GlassModal";
import { overrideProfitDistribution } from "@/actions/ticket-actions";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useCSRF } from "@/contexts/CSRFContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProfitDistributionOverrideModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticketId: string;
    laborPoolAmount: number;
    currentTechCommission: number;
    onSuccess?: () => void;
}

export default function ProfitDistributionOverrideModal({
    isOpen,
    onClose,
    ticketId,
    laborPoolAmount,
    currentTechCommission,
    onSuccess,
}: ProfitDistributionOverrideModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [targetType, setTargetType] = useState<'TECH' | 'CENTER'>('CENTER');
    const [inputValue, setInputValue] = useState("");
    const [inputPercentage, setInputPercentage] = useState("");
    const { token: csrfToken } = useCSRF();

    // Reset state to match current ticket values when modal opens
    useEffect(() => {
        if (isOpen) {
            setTargetType('CENTER');
            const currentCenterAmt = laborPoolAmount - currentTechCommission;
            setInputValue(currentCenterAmt.toString());
            const pct = laborPoolAmount !== 0 ? (currentCenterAmt / laborPoolAmount) * 100 : 0;
            setInputPercentage(pct.toString());
        }
    }, [isOpen, laborPoolAmount, currentTechCommission]);

    // Calculate actual commission amount based on input mode and target
    const parsedInput = Number(inputValue || 0);
    
    let calculatedCommission = 0;
    let calculatedCenterProfit = 0;

    if (targetType === 'TECH') {
        calculatedCommission = parsedInput;
        calculatedCenterProfit = laborPoolAmount - calculatedCommission;
    } else {
        calculatedCenterProfit = parsedInput;
        calculatedCommission = laborPoolAmount - calculatedCenterProfit;
    }

    const getBoxStyles = (val: number, type: 'TECH' | 'CENTER') => {
        if (val < 0) return 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400';
        if (type === 'TECH') return 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400';
        return 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400';
    };

    const getLabelStyles = (val: number, type: 'TECH' | 'CENTER') => {
        if (val < 0) return 'text-red-700 dark:text-red-500';
        if (type === 'TECH') return 'text-emerald-700 dark:text-emerald-500';
        return 'text-cyan-700 dark:text-cyan-500';
    };

    const handleSubmit = async () => {
        if (isNaN(calculatedCommission)) {
            toast.error("Invalid amount");
            return;
        }

        setIsLoading(true);
        try {
            const response = await overrideProfitDistribution({
                ticketId,
                newTechCommissionAmount: calculatedCommission,
                csrfToken: csrfToken ?? undefined
            });

            if (response.success) {
                toast.success('تم الحفظ', { description: 'تم تحديث توزيعه الأرباح والقيود المحاسبية بنجاح' });
                if (onSuccess) onSuccess();
                onClose();
            } else {
                toast.error(response?.error || "حدث خطأ أثناء التحديث");
            }
        } catch (error: any) {
            toast.error(error?.message || "حدث خطأ غير متوقع");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title="تجاوز توزيع الأرباح النهائي">
            <div className="space-y-6">
                {/* Warning message */}
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                    <p className="text-[11px] text-yellow-600 dark:text-yellow-400 font-bold leading-relaxed">
                        هذا الإجراء سيقوم بتعديل عمولة المهندس وربح المركز بشكل استثنائي لهذه التذكرة فقط، وسيتم تعديل القيود المحاسبية تلقائياً. لن يؤثر ذلك على النسبة الأساسية للمهندس.
                    </p>
                </div>

                {/* Labor Pool (Fixed) */}
                <div className={`flex justify-between items-center p-3 rounded-xl border ${laborPoolAmount < 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                    <div className="flex items-center gap-2">
                        <Database className={`w-4 h-4 ${laborPoolAmount < 0 ? 'text-red-500' : 'text-slate-500'}`} />
                        <span className="text-xs font-bold text-slate-600 dark:text-zinc-400">إجمالي وعاء المصنعية</span>
                    </div>
                    <span className={`text-lg font-black ${laborPoolAmount < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                        {laborPoolAmount.toLocaleString()} <span className="text-xs opacity-60">EGP</span>
                    </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                    <div className="space-y-2 flex-1">
                        <Label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300">الطرف المراد تعديله</Label>
                        <Select value={targetType} onValueChange={(val: 'TECH' | 'CENTER') => { 
                            setTargetType(val); 
                            const amt = val === 'CENTER' ? laborPoolAmount - currentTechCommission : currentTechCommission;
                            setInputValue(amt.toString());
                            const pct = laborPoolAmount !== 0 ? (amt / laborPoolAmount) * 100 : 0;
                            setInputPercentage(pct.toString());
                        }}>
                            <SelectTrigger className="h-10 text-xs font-bold">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="CENTER" className="text-xs font-bold text-cyan-600 dark:text-cyan-400">صافي ربح المركز</SelectItem>
                                <SelectItem value="TECH" className="text-xs font-bold text-emerald-600 dark:text-emerald-400">عمولة المهندس</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Amount and Percentage Inputs */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                            {targetType === 'CENTER' ? "صافي ربح المركز" : "عمولة المهندس"} (القيمة)
                        </Label>
                        <div className="relative">
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px] font-bold z-10">EGP</span>
                            <Input
                                type="number"
                                value={inputValue}
                                onChange={(e) => {
                                    const valStr = e.target.value;
                                    setInputValue(valStr);
                                    const valNum = parseFloat(valStr) || 0;
                                    const pct = laborPoolAmount !== 0 ? (valNum / laborPoolAmount) * 100 : 0;
                                    setInputPercentage(valStr === "" ? "" : pct.toString());
                                }}
                                className={`h-14 bg-black/5 dark:bg-black/20 border-2 font-black text-center text-xl shadow-inner ${
                                    Number(inputValue) < 0 
                                        ? 'text-red-600 dark:text-red-400 border-red-500/30 focus-visible:ring-red-500/50' 
                                        : 'text-slate-900 dark:text-white border-slate-200 dark:border-white/10 focus-visible:ring-cyan-500/50'
                                }`}
                                placeholder="0"
                                dir="ltr"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                            {targetType === 'CENTER' ? "نسبة المركز" : "نسبة المهندس"} (%)
                        </Label>
                        <div className="relative">
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px] font-bold z-10">%</span>
                            <Input
                                type="number"
                                value={inputPercentage}
                                onChange={(e) => {
                                    const pctStr = e.target.value;
                                    setInputPercentage(pctStr);
                                    const pctNum = parseFloat(pctStr) || 0;
                                    const amt = laborPoolAmount * (pctNum / 100);
                                    setInputValue(pctStr === "" ? "" : amt.toString());
                                }}
                                className={`h-14 bg-black/5 dark:bg-black/20 border-2 font-black text-center text-xl shadow-inner ${
                                    Number(inputPercentage) < 0 
                                        ? 'text-red-600 dark:text-red-400 border-red-500/30 focus-visible:ring-red-500/50' 
                                        : 'text-slate-900 dark:text-white border-slate-200 dark:border-white/10 focus-visible:ring-cyan-500/50'
                                }`}
                                placeholder="0"
                                dir="ltr"
                            />
                        </div>
                    </div>
                </div>

                {/* Live Preview */}
                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-200 dark:border-white/10">
                    <div className={`p-3 rounded-xl flex flex-col items-center justify-center transition-colors ${getBoxStyles(calculatedCenterProfit, 'CENTER')}`}>
                        <span className={`text-[10px] font-bold uppercase ${getLabelStyles(calculatedCenterProfit, 'CENTER')}`}>صافي ربح المركز</span>
                        <span className="text-lg font-black">
                            {calculatedCenterProfit.toLocaleString()} <span className="text-[10px] font-bold opacity-70">EGP</span>
                        </span>
                    </div>
                    <div className={`p-3 rounded-xl flex flex-col items-center justify-center transition-colors ${getBoxStyles(calculatedCommission, 'TECH')}`}>
                        <span className={`text-[10px] font-bold uppercase ${getLabelStyles(calculatedCommission, 'TECH')}`}>عمولة المهندس</span>
                        <span className="text-lg font-black">
                            {calculatedCommission.toLocaleString()} <span className="text-[10px] font-bold opacity-70">EGP</span>
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="flex-1 font-bold"
                        disabled={isLoading}
                    >
                        إلغاء
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-black shadow-lg shadow-cyan-500/20"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "حفظ التعديلات"}
                    </Button>
                </div>
            </div>
        </GlassModal>
    );
}
