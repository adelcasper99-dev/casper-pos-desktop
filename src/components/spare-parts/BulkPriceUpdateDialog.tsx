'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n-mock';
import { Percent, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { bulkUpdateSparePartPrices } from '@/actions/spare-parts';
import GlassModal from '@/components/ui/GlassModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    totalAffected: number;
    currentBrand?: string;
    currentSearch?: string;
}

export function BulkPriceUpdateDialog({ 
    open, 
    onOpenChange, 
    totalAffected,
    currentBrand,
    currentSearch 
}: Props) {
    const t = useTranslations('SpareParts');
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);
    const [mode, setMode] = useState<'increase' | 'discount'>('increase');
    const [percentage, setPercentage] = useState<string>('5');
    const [priceType, setPriceType] = useState<'all' | 'sellPrice' | 'price1' | 'price2' | 'price3'>('sellPrice');
    const [confirmText, setConfirmText] = useState('');

    const isValid = confirmText === t('confirmText') && parseFloat(percentage) > 0;

    const handleBulkUpdate = async () => {
        if (!isValid) return;
        
        setIsPending(true);
        try {
            const finalPercentage = mode === 'increase' ? parseFloat(percentage) : -parseFloat(percentage);
            const result = await bulkUpdateSparePartPrices({
                percentage: finalPercentage,
                brand: currentBrand,
                search: currentSearch,
                priceType
            });

            if (result.success) {
                toast.success(`${t('bulkUpdateSuccess')} (${result.count})`);
                onOpenChange(false);
                setConfirmText('');
                router.refresh();
            } else {
                toast.error(t('bulkUpdateError'));
            }
        } catch (error) {
            toast.error(t('bulkUpdateError'));
            console.error('Bulk update error:', error);
        } finally {
            setIsPending(false);
        }
    };

    return (
        <GlassModal
            isOpen={open}
            onClose={() => onOpenChange(false)}
            title={t('bulkPriceUpdate')}
            className="max-w-md"
        >
            <div className="space-y-6 py-2" dir="rtl">
                {/* Impact Info */}
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-xl">
                        <div className="flex -space-x-1 rtl:space-x-reverse">
                             <Percent className="w-5 h-5 text-primary" />
                        </div>
                    </div>
                    <div>
                        <p className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-1">
                            {t('affectedItems')}
                        </p>
                        <p className="text-2xl font-black text-foreground leading-none">
                            {totalAffected}
                        </p>
                    </div>
                </div>

                {/* Mode Toggle */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-muted/30 rounded-2xl border border-border">
                    <Button
                        onClick={() => setMode('increase')}
                        className={cn(
                            "h-10 rounded-xl font-bold transition-all",
                            mode === 'increase' 
                                ? "bg-cyan-500 text-black shadow-lg" 
                                : "bg-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {t('increaseTab')}
                    </Button>
                    <Button
                        onClick={() => setMode('discount')}
                        className={cn(
                            "h-10 rounded-xl font-bold transition-all",
                            mode === 'discount' 
                                ? "bg-rose-500 text-white shadow-lg" 
                                : "bg-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {t('discountTab')}
                    </Button>
                </div>

                {/* Percentage Section */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">
                            {t('percentageLabel')}
                        </Label>
                        <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-black",
                            mode === 'increase' ? "bg-cyan-500/10 text-cyan-600" : "bg-rose-500/10 text-rose-600"
                        )}>
                            {mode === 'increase' ? "قيمة إضافية" : "خصم مباشر"}
                        </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {['5', '10', '20'].map((p) => (
                            <Button
                                key={p}
                                type="button"
                                variant="outline"
                                onClick={() => setPercentage(p)}
                                className={cn(
                                    "h-11 rounded-xl font-black transition-all",
                                    percentage === p 
                                        ? (mode === 'increase' 
                                            ? "bg-cyan-500/10 border-cyan-500 text-cyan-600 shadow-sm" 
                                            : "bg-rose-500/10 border-rose-500 text-rose-600 shadow-sm")
                                        : "bg-muted/10 border-border hover:bg-muted"
                                )}
                            >
                                {p}%
                            </Button>
                        ))}
                    </div>
                    <Input
                        type="number"
                        value={percentage}
                        onChange={(e) => setPercentage(e.target.value)}
                        placeholder="0.00"
                        className={cn(
                            "h-11 border-border rounded-xl font-black text-center text-lg",
                            mode === 'increase' ? "focus:ring-cyan-500" : "focus:ring-rose-500"
                        )}
                    />
                </div>

                {/* Price Type Section */}
                <div className="space-y-3">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">
                        {t('targetPriceLabel')}
                    </Label>
                    <Select value={priceType} onValueChange={(v: any) => setPriceType(v)}>
                        <SelectTrigger className="h-11 bg-muted/20 border-border rounded-xl font-black">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="glass-card border-border shadow-2xl rounded-xl z-[1001]">
                            <SelectItem value="sellPrice" className="font-bold">{t('sellPrice')}</SelectItem>
                            <SelectItem value="price1" className="font-bold">{t('price1')}</SelectItem>
                            <SelectItem value="price2" className="font-bold">{t('price2')}</SelectItem>
                            <SelectItem value="price3" className="font-bold">{t('price3')}</SelectItem>
                            <SelectItem value="all" className="font-bold text-primary">{t('allPrices')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Warning Section */}
                <div className={cn(
                    "p-4 border rounded-2xl space-y-2",
                    mode === 'increase' ? "bg-amber-500/5 border-amber-500/20" : "bg-rose-500/5 border-rose-500/20"
                )}>
                    <div className={cn(
                        "flex items-center gap-2 font-black text-xs uppercase tracking-tight",
                        mode === 'increase' ? "text-amber-500" : "text-rose-500"
                    )}>
                        <AlertTriangle className="w-4 h-4" />
                        تنبيه هام
                    </div>
                    <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                        {mode === 'increase' 
                            ? `هذه العملية ستؤدي إلى زيادة الأسعار لجميع الأصناف المحددة بنسبة ${percentage}% بشكل نهائي.`
                            : `هذه العملية ستؤدي إلى خصم بنسبة ${percentage}% من الأسعار لجميع الأصناف المحددة.`
                        } لا يوجد زر تراجع لهذا الإجراء.
                    </p>
                </div>

                {/* Safety Confirmation */}
                <div className="space-y-3">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">
                        {t('confirmTextLabel')}
                    </Label>
                    <Input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={t('confirmText')}
                        className={cn(
                            "h-11 bg-muted/20 border-border rounded-xl font-black text-center",
                            isValid && mode === 'increase' ? "text-cyan-600" : (isValid ? "text-rose-600" : "")
                        )}
                    />
                </div>

                <Button
                    onClick={handleBulkUpdate}
                    disabled={!isValid || isPending}
                    className={cn(
                        "w-full h-14 rounded-2xl font-black text-lg transition-all active:scale-95 shadow-2xl",
                        isValid 
                            ? (mode === 'increase' 
                                ? "bg-cyan-500 hover:bg-cyan-400 text-black shadow-cyan-500/20" 
                                : "bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20")
                            : "bg-muted text-muted-foreground grayscale cursor-not-allowed"
                    )}
                >
                    {isPending ? (
                        <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5" />
                            {mode === 'increase' ? "تطبيق الزيادة الآن" : "تطبيق الخصم الآن"}
                        </div>
                    )}
                </Button>
            </div>
        </GlassModal>
    );
}
