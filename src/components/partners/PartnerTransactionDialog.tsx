"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createPartnerTransaction } from "@/features/partners/api/partner-service";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { getTreasuries } from "@/actions/treasury";
import { PartnerWithBalances } from "@/features/partners/types";
import Decimal from "decimal.js";

interface PartnerTransactionDialogProps {
    partner: PartnerWithBalances | null;
    type: "DEPOSIT" | "DRAWING";
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function PartnerTransactionDialog({ partner, type, open, onOpenChange, onSuccess }: PartnerTransactionDialogProps) {
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [treasuryId, setTreasuryId] = useState("");
    const [treasuries, setTreasuries] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setAmount("");
            setDescription("");
            fetchTreasuries();
        }
    }, [open]);

    const fetchTreasuries = async () => {
        const res = await getTreasuries();
        if (res.success && res.data) {
            setTreasuries(res.data);
            const defaultT = res.data.find((t: any) => t.isDefault);
            if (defaultT) setTreasuryId(defaultT.id);
            else if (res.data.length > 0) setTreasuryId(res.data[0].id);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!partner) {
            toast.error("الرجاء اختيار الشريك");
            return;
        }
        
        let val: number;
        try {
            const sanitizedAmount = amount.replace(/,/g, "").trim();
            const decVal = new Decimal(sanitizedAmount);
            if (decVal.lte(0)) {
                toast.error("الرجاء إدخال مبلغ صحيح أكبر من الصفر");
                return;
            }
            val = decVal.toNumber();
        } catch (err) {
            toast.error("الرجاء إدخال مبلغ صحيح");
            return;
        }
        if (!treasuryId) {
            toast.error("الرجاء اختيار الخزينة/البنك");
            return;
        }

        setLoading(true);
        const res = await createPartnerTransaction({
            partnerId: partner.id,
            type,
            amount: val,
            treasuryId,
            description: description || undefined
        });

        if (res.success) {
            toast.success(`تم تسجيل ${type === "DEPOSIT" ? "الإيداع" : "السحب"} بنجاح`);
            onSuccess();
            onOpenChange(false);
        } else {
            toast.error(res.error || "حدث خطأ أثناء التنفيذ");
        }
        setLoading(false);
    };

    if (!partner) return null;

    const isDeposit = type === "DEPOSIT";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className={isDeposit ? "text-green-500" : "text-red-500"}>
                        {isDeposit ? "إيداع شريك" : "سحب شريك"} - {partner.name}
                    </DialogTitle>
                    <DialogDescription>
                        {isDeposit 
                            ? "سيؤدي ذلك لزيادة حساب رأس مال الشريك وزيادة النقدية بالخزينة." 
                            : "سيؤدي ذلك لتخفيض الحساب الجاري للشريك وتقليل النقدية بالخزينة."}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label>المبلغ *</Label>
                        <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" className="font-mono text-lg" />
                    </div>
                    
                    <div className="space-y-2">
                        <Label>الخزينة / البنك *</Label>
                        <Select value={treasuryId} onValueChange={setTreasuryId}>
                            <SelectTrigger>
                                <SelectValue placeholder="اختر الخزينة" />
                            </SelectTrigger>
                            <SelectContent>
                                {treasuries.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name} (رصيد: {t.balance})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>البيان / الوصف (اختياري)</Label>
                        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={isDeposit ? "زيادة رأس مال نقدية..." : "سحب مصاريف شخصية..."} />
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            إلغاء
                        </Button>
                        <Button type="submit" disabled={loading} className={isDeposit ? "bg-green-500 hover:bg-green-600 text-white" : "bg-red-500 hover:bg-red-600 text-white"}>
                            {loading ? <CasperLoader width={20} /> : "تأكيد"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
