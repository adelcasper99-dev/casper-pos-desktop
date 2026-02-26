"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
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
            <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle>{title || t("reasonRequired") || "السبب مطلوب"}</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={placeholder || t("enterReason") || "أدخل السبب هنا..."}
                        className="bg-zinc-900 border-white/10 focus:border-indigo-500 min-h-[100px]"
                        autoFocus
                    />
                </div>
                <DialogFooter className="flex gap-2">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="text-zinc-400 hover:text-white"
                    >
                        {cancelLabel || t("cancel") || "إلغاء"}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                        {confirmLabel || t("confirm") || "تأكيد"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
