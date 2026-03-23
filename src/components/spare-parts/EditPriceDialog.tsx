'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n-mock';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { updateSparePartPrices } from '@/actions/spare-parts';
import GlassModal from '@/components/ui/GlassModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface SparePart {
    id: string;
    productName: string;
    brand: string;
    quantity: string;
    costPrice: string;
    sellPrice: string;
    price1?: string;
    price2?: string;
    price3?: string;
}

interface Props {
    part: SparePart;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function EditPriceDialog({ part, open, onOpenChange }: Props) {
    const t = useTranslations('SpareParts');
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);

    const [costPrice, setCostPrice] = useState(part.costPrice);
    const [sellPrice, setSellPrice] = useState(part.sellPrice);
    const [price1, setPrice1] = useState(part.price1 || '0');
    const [price2, setPrice2] = useState(part.price2 || '0');
    const [price3, setPrice3] = useState(part.price3 || '0');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsPending(true);

        try {
            const result = await updateSparePartPrices({
                id: part.id,
                costPrice,
                sellPrice,
                price1,
                price2,
                price3,
            });

            if (result.success) {
                toast.success(t('updateSuccess'));
                onOpenChange(false);
                router.refresh();
            } else {
                toast.error(t('updateError'));
            }
        } catch (error) {
            toast.error(t('updateError'));
            console.error('Error updating prices:', error);
        } finally {
            setIsPending(false);
        }
    };

    return (
        <GlassModal
            isOpen={open}
            onClose={() => onOpenChange(false)}
            title={t('editPrice')}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                    <p className="text-sm font-bold text-foreground">{part.productName}</p>
                    <p className="text-xs text-muted-foreground">{part.brand}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit-costPrice">{t('costPrice')}</Label>
                        <Input
                            id="edit-costPrice"
                            type="number"
                            step="0.01"
                            value={costPrice}
                            onChange={(e) => setCostPrice(e.target.value)}
                            placeholder="0.00"
                            required
                            className="glass-input"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit-sellPrice">{t('sellPrice')}</Label>
                        <Input
                            id="edit-sellPrice"
                            type="number"
                            step="0.01"
                            value={sellPrice}
                            onChange={(e) => setSellPrice(e.target.value)}
                            placeholder="0.00"
                            required
                            className="glass-input"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit-price1">{t('price1')}</Label>
                        <Input
                            id="edit-price1"
                            type="number"
                            step="0.01"
                            value={price1}
                            onChange={(e) => setPrice1(e.target.value)}
                            placeholder="0.00"
                            className="glass-input"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit-price2">{t('price2')}</Label>
                        <Input
                            id="edit-price2"
                            type="number"
                            step="0.01"
                            value={price2}
                            onChange={(e) => setPrice2(e.target.value)}
                            placeholder="0.00"
                            className="glass-input"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit-price3">{t('price3')}</Label>
                        <Input
                            id="edit-price3"
                            type="number"
                            step="0.01"
                            value={price3}
                            onChange={(e) => setPrice3(e.target.value)}
                            placeholder="0.00"
                            className="glass-input"
                        />
                    </div>
                </div>

                <Button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold" disabled={isPending}>
                    {isPending ? t('saving') : (
                        <><Save className="mr-2 h-4 w-4" /> {t('saveChanges')}</>
                    )}
                </Button>
            </form>
        </GlassModal>
    );
}
