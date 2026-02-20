'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { reportWastage } from '@/actions/inventory';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

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
            toast.error('Quantity must be greater than 0');
            return;
        }

        if (formData.quantity > product.stock) {
            toast.error(`Cannot report more than available stock (${product.stock})`);
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
                toast.success(`Wastage reported: ${formData.quantity}x ${product.name}`);
                onOpenChange(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to report wastage');
            }
        } catch (error: any) {
            console.error('Wastage error:', error);
            toast.error(error.message || 'Failed to report wastage');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Report Stock Wastage</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    {/* Product Info */}
                    <div className="p-3 bg-muted rounded-lg">
                        <div className="text-sm font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">SKU: {product.sku}</div>
                        <div className="text-xs text-muted-foreground">Available Stock: {product.stock}</div>
                    </div>

                    {/* Quantity */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Quantity *
                        </label>
                        <input
                            type="number"
                            min="1"
                            max={product.stock}
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary"
                            required
                            disabled={loading}
                        />
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Reason *
                        </label>
                        <select
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value as any })}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary"
                            required
                            disabled={loading}
                        >
                            <option value="DAMAGED">Damaged</option>
                            <option value="EXPIRED">Expired</option>
                            <option value="THEFT">Theft</option>
                            <option value="QUALITY_ISSUE">Quality Issue</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Notes (Optional)
                        </label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary resize-none"
                            placeholder="Additional details about the wastage..."
                            disabled={loading}
                        />
                    </div>

                    {/* Warning */}
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-900">
                        <div className="flex gap-2">
                            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                This will permanently deduct {formData.quantity} unit(s) from your inventory.
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <Button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-red-600 hover:bg-red-700"
                        >
                            {loading ? 'Reporting...' : 'Report Wastage'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
