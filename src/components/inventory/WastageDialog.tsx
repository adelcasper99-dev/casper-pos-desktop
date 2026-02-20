'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { reportWastage } from '@/actions/inventory';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n-mock';
import { AlertCircle } from 'lucide-react';

interface WastageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    product: {
        id: string;
        name: string;
        sku: string;
        stock: number;
    } | null;
    warehouseId: string;
    csrfToken: string;
}

export function WastageDialog({ product, warehouseId, csrfToken, open, onOpenChange }: WastageDialogProps) {
    const t = useTranslations('Inventory.wastage');
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        quantity: 1,
        reason: 'DAMAGED' as const,
        notes: '',
    });

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setFormData({ quantity: 1, reason: 'DAMAGED', notes: '' });
        }
    }, [open]);

    if (!product) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (formData.quantity <= 0) {
            toast.error(t('qtyError'));
            return;
        }

        if (formData.quantity > product.stock) {
            toast.error(t('stockError', { stock: product.stock }));
            return;
        }

        setLoading(true);

        try {
            const result = await reportWastage({
                productId: product.id,
                warehouseId,
                quantity: formData.quantity,
                reason: formData.reason,
                notes: formData.notes || undefined,
                csrfToken,
            });

            if (result.success) {
                toast.success(t('success', { amount: formData.quantity, name: product.name }));
                onOpenChange(false);
                router.refresh();
            } else {
                toast.error(result.error || t('reportingError') || 'Error');
            }
        } catch (error: any) {
            console.error('Wastage error:', error);
            toast.error(error.message || t('reportingError') || 'Error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4" dir="rtl">
                    {/* Product Info */}
                    <div className="p-3 bg-muted rounded-lg border border-border">
                        <div className="text-sm font-bold text-foreground">{product.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono">SKU: {product.sku}</div>
                        <div className="text-xs text-cyan-500 font-bold mt-1">
                            {t('availableStock', { stock: product.stock })}
                        </div>
                    </div>

                    {/* Quantity */}
                    <div>
                        <label className="block text-sm font-bold mb-1">
                            {t('quantityLabel')}
                        </label>
                        <input
                            type="number"
                            min="1"
                            max={product.stock}
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all"
                            required
                            disabled={loading}
                        />
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-bold mb-1">
                            {t('reasonLabel')}
                        </label>
                        <select
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value as any })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all"
                            required
                            disabled={loading}
                        >
                            <option value="DAMAGED">{t('reasons.DAMAGED')}</option>
                            <option value="EXPIRED">{t('reasons.EXPIRED')}</option>
                            <option value="THEFT">{t('reasons.THEFT')}</option>
                            <option value="QUALITY_ISSUE">{t('reasons.QUALITY_ISSUE')}</option>
                            <option value="OTHER">{t('reasons.OTHER')}</option>
                        </select>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-bold mb-1">
                            {t('notesLabel')}
                        </label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all resize-none"
                            placeholder={t('notesPlaceholder')}
                            disabled={loading}
                        />
                    </div>

                    {/* Warning */}
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <div className="flex gap-2">
                            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                            <p className="text-sm text-yellow-200">
                                {t('warning', { quantity: formData.quantity })}
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <Button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold h-11"
                        >
                            {loading ? t('reporting') : t('reportButton')}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                            className="flex-1 h-11"
                        >
                            {t('cancel') || 'إلغاء'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
