'use client'

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { updateTicketDetails } from "@/actions/ticket-actions"
import { getAllTechnicians } from "@/actions/engineer-actions"
import { Loader2, Save, Lock, DollarSign, AlertTriangle, Clock } from "lucide-react"
import { useTranslations } from '@/lib/i18n-mock';
import { useCSRF } from "@/contexts/CSRFContext";

interface TicketQuickEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: any;
    onSuccess: () => void;
}

export default function TicketQuickEditModal({ isOpen, onClose, ticket, onSuccess }: TicketQuickEditModalProps) {
    const t = useTranslations('Ticket.quickEdit');
    const tCommon = useTranslations('Common');
    const { token: csrfToken } = useCSRF();
    const [loading, setLoading] = useState(false);
    const [technicians, setTechnicians] = useState<any[]>([]);

    const [price, setPrice] = useState('');
    const [issue, setIssue] = useState('');
    const [securityCode, setSecurityCode] = useState('');
    const [technicianId, setTechnicianId] = useState<string>('unassigned');
    const [duration, setDuration] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            getAllTechnicians().then((res: any) => {
                if (res?.data?.success || res?.success) {
                    const techData = res.data?.technicians || res.technicians || [];
                    setTechnicians(techData);
                }
            });
        }
    }, [isOpen]);

    useEffect(() => {
        if (ticket) {
            setPrice(ticket.repairPrice?.toString() || '0');
            setIssue(ticket.issueDescription || '');
            setSecurityCode(ticket.securityCode || '');
            setTechnicianId(ticket.technicianId || 'unassigned');
            setDuration(ticket.expectedDuration?.toString() || '');
            setError(null);
        }
    }, [ticket, isOpen]);

    const handleSave = async () => {
        setLoading(true);
        setError(null);

        try {
            const parsedPrice = parseFloat(price);
            if (isNaN(parsedPrice) || parsedPrice < 0) {
                setError(t('invalidPrice'));
                setLoading(false);
                return;
            }

            const res = await updateTicketDetails(ticket.id, {
                repairPrice: Number(price),
                issueDescription: issue,
                securityCode: securityCode,
                technicianId: technicianId === 'unassigned' ? undefined : technicianId,
                expectedDuration: Number(duration),
                csrfToken: csrfToken ?? undefined
            });

            if (res.success) {
                onSuccess();
                onClose();
            } else {
                setError(res.message || t('failedToUpdate'));
            }
        } catch (err: any) {
            setError(err.message || t('failedToUpdate'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-zinc-800 text-white">
                <DialogHeader>
                    <DialogTitle>{t('title', { barcode: ticket?.barcode })}</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        {t('description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right text-sm text-zinc-400">{t('price')}</label>
                        <div className="col-span-3 relative">
                            <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
                            <Input
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                className="pl-8 bg-black/50 border-zinc-700 text-white"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right text-sm text-zinc-400">{t('password')}</label>
                        <div className="col-span-3 relative">
                            <Lock className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
                            <Input
                                value={securityCode}
                                onChange={(e) => setSecurityCode(e.target.value)}
                                placeholder={t('pinPatternPlaceholder')}
                                className="pl-8 bg-black/50 border-zinc-700 text-white"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right text-sm text-zinc-400">{t('tech')}</label>
                        <div className="col-span-3">
                            <Select value={technicianId} onValueChange={setTechnicianId}>
                                <SelectTrigger className="bg-black/50 border-zinc-700 text-white">
                                    <SelectValue placeholder={t('assignTechnician')} />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                                    <SelectItem value="unassigned">{t('unassigned')}</SelectItem>
                                    {technicians.map((t: any) => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 items-start gap-4">
                        <label className="text-right text-sm text-zinc-400 mt-2">{t('expectedDuration')}</label>
                        <div className="col-span-3 space-y-2">
                            <div className="relative">
                                <Clock className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
                                <Input
                                    type="number"
                                    value={duration}
                                    onChange={(e) => setDuration(e.target.value)}
                                    placeholder={t('expectedDuration')}
                                    className="pl-8 bg-black/50 border-zinc-700 text-white"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 h-7 text-[10px] bg-transparent border-zinc-700 text-zinc-400 hover:text-white"
                                    onClick={() => {
                                        const current = parseInt(duration || '0');
                                        setDuration((current + 60).toString());
                                    }}
                                >
                                    +1h
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 h-7 text-[10px] bg-transparent border-zinc-700 text-zinc-400 hover:text-white"
                                    onClick={() => {
                                        const current = parseInt(duration || '0');
                                        setDuration((current + 1440).toString());
                                    }}
                                >
                                    +1d
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm text-zinc-400">{t('issueDescription')}</label>
                        <Textarea
                            value={issue}
                            onChange={(e) => setIssue(e.target.value)}
                            className="bg-black/50 border-zinc-700 text-white min-h-[80px]"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 p-2 rounded text-xs text-red-400 flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3" /> {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} className="text-zinc-400">{tCommon('cancel')}</Button>
                    <Button onClick={handleSave} disabled={loading} className="bg-cyan-600 hover:bg-cyan-500 text-white">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        {t('saveChanges')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
