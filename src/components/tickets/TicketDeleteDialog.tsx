'use client'

import { useState } from 'react';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { softDeleteTicket } from "@/actions/ticket-actions"
import { Loader2, Trash2, AlertTriangle } from "lucide-react"
import { useTranslations } from '@/lib/i18n-mock';
import { useCSRF } from "@/contexts/CSRFContext";

interface TicketDeleteDialogProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: any;
    onSuccess: () => void;
}

export default function TicketDeleteDialog({ isOpen, onClose, ticket, onSuccess }: TicketDeleteDialogProps) {
    const t = useTranslations('Ticket.deleteDialog');
    const tCommon = useTranslations('Common');
    const { token: csrfToken } = useCSRF();

    const [loading, setLoading] = useState(false);
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleDelete = async () => {
        if (!reason.trim()) {
            setError(t('reasonError'));
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await softDeleteTicket({
                ticketId: ticket.id,
                reason: reason.trim(),
                csrfToken: csrfToken ?? undefined
            });

            if (res.success) {
                onSuccess();
                onClose();
            } else {
                setError(res.message || t('deleteError'));
            }
        } catch (err: any) {
            setError(err.message || t('deleteError'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-zinc-800 text-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-500">
                        <Trash2 className="h-5 w-5" /> {t('title', { barcode: ticket?.barcode })}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        {t('warning')}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-sm text-red-200 flex gap-2">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
                        <div>
                            {t('auditLog')}
                        </div>
                    </div>

                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">{t('reasonRequired')}</label>
                        <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={t('placeholder')}
                            className="bg-black/50 border-zinc-700 text-white"
                        />
                    </div>

                    {error && (
                        <div className="text-xs text-red-400 font-medium">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} className="text-zinc-400">{tCommon('cancel')}</Button>
                    <Button
                        onClick={handleDelete}
                        disabled={loading || !reason.trim()}
                        className="bg-red-600 hover:bg-red-500 text-white"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                        {t('confirmDelete')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
