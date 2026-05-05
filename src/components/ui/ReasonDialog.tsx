"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/lib/i18n-mock";

interface ReasonDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
    title?: string;
    placeholder?: string;
    defaultValue?: string;
    confirmLabel?: string;
    cancelLabel?: string;
}

export function ReasonDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    placeholder,
    defaultValue = "",
    confirmLabel,
    cancelLabel,
}: ReasonDialogProps) {
    const [reason, setReason] = useState(defaultValue);
    const t = useTranslations("Common");

    const handleConfirm = () => {
        onConfirm(reason);
        onClose();
        setReason("");
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-card border-border text-foreground shadow-2xl rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        {title || t("reasonRequired") || "السبب مطلوب"}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        أدخل سبباً لإتمام هذا الإجراء.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-6">
                    <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={placeholder || t("enterReason") || "أدخل السبب هنا..."}
                        className="bg-muted border-border focus:border-primary min-h-[120px] rounded-xl text-sm leading-relaxed"
                        autoFocus
                    />
                </div>
                <DialogFooter className="flex gap-3 sm:justify-start">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="flex-1 h-12 text-muted-foreground hover:bg-muted font-bold rounded-xl"
                    >
                        {cancelLabel || t("cancel") || "إلغاء"}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className="flex-1 h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold rounded-xl shadow-lg shadow-primary/20"
                    >
                        {confirmLabel || t("confirm") || "تأكيد"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
