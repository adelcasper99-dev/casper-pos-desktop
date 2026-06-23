"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createPartner } from "@/features/partners/api/partner-service";
import { CasperLoader } from "@/components/ui/CasperLoader";
import Decimal from "decimal.js";

interface AddPartnerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function AddPartnerDialog({ open, onOpenChange, onSuccess }: AddPartnerDialogProps) {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [profitShare, setProfitShare] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        let share: number;
        try {
            const sanitizedShare = profitShare.replace(/,/g, "").trim();
            const decShare = new Decimal(sanitizedShare);
            if (decShare.lte(0) || decShare.gt(100)) {
                toast.error("الرجاء إدخال نسبة مئوية صحيحة بين 1 و 100");
                return;
            }
            share = decShare.toNumber();
        } catch (err) {
            toast.error("الرجاء إدخال نسبة مئوية صحيحة");
            return;
        }
        if (!name.trim()) {
            toast.error("الرجاء إدخال اسم الشريك");
            return;
        }

        setLoading(true);
        const res = await createPartner({
            name,
            phone,
            profitShare: share
        });

        if (res.success) {
            toast.success("تم إضافة الشريك بنجاح وتهيئة حساباته المحاسبية");
            setName("");
            setPhone("");
            setProfitShare("");
            onSuccess();
            onOpenChange(false);
        } else {
            toast.error(res.error || "حدث خطأ أثناء الإضافة");
        }
        setLoading(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>إضافة شريك جديد</DialogTitle>
                    <DialogDescription>
                        سيتم إنشاء حساب رأس مال وحساب جاري للشريك تلقائياً في دليل الحسابات.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label>اسم الشريك *</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} required placeholder="مثال: أحمد محمود" />
                    </div>
                    <div className="space-y-2">
                        <Label>رقم الهاتف</Label>
                        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
                    </div>
                    <div className="space-y-2">
                        <Label>نسبة الأرباح/الخسائر (%) *</Label>
                        <Input type="number" step="0.01" value={profitShare} onChange={e => setProfitShare(e.target.value)} required placeholder="مثال: 60" />
                        <p className="text-xs text-muted-foreground">يجب ألا يتجاوز إجمالي نسب الشركاء 100%</p>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            إلغاء
                        </Button>
                        <Button type="submit" disabled={loading} className="bg-cyan-500 hover:bg-cyan-400 text-black">
                            {loading ? <CasperLoader width={20} /> : "حفظ الشريك"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
