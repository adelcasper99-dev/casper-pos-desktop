'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n-mock';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { addSparePart } from '@/actions/spare-parts';
import GlassModal from '@/components/ui/GlassModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    brands: string[];
}

export function AddPartDialog({ open, onOpenChange, brands }: Props) {
    const t = useTranslations('SpareParts');
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);

    const [formData, setFormData] = useState({
        productName: '',
        brand: '',
        quantity: '',
        costPrice: '0',
        sellPrice: '0',
        price1: '0',
        price2: '0',
        price3: '0',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsPending(true);

        try {
            const result = await addSparePart(formData);
            if (result.success) {
                toast.success(t('addSuccess'));
                onOpenChange(false);
                setFormData({
                    productName: '',
                    brand: '',
                    quantity: '',
                    costPrice: '0',
                    sellPrice: '0',
                    price1: '0',
                    price2: '0',
                    price3: '0',
                });
                router.refresh();
            } else {
                toast.error(t('addError'));
            }
        } catch (error) {
            toast.error(t('addError'));
            console.error('Error adding part:', error);
        } finally {
            setIsPending(false);
        }
    };

    return (
        <GlassModal
            isOpen={open}
            onClose={() => onOpenChange(false)}
            title={t('addPart')}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="productName">{t('productName')}</Label>
                    <Input
                        id="productName"
                        value={formData.productName}
                        onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                        placeholder={t('productNamePlaceholder')}
                        required
                        className="glass-input"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="brand">{t('brand')}</Label>
                        <Input
                            id="brand"
                            list="brands-list"
                            value={formData.brand}
                            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                            placeholder={t('brandPlaceholder')}
                            required
                            className="glass-input"
                        />
                        <datalist id="brands-list">
                            {brands.map((brand) => (
                                <option key={brand} value={brand} />
                            ))}
                        </datalist>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="quantity">{t('quantity')}</Label>
                        <Input
                            id="quantity"
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                            placeholder={t('quantityPlaceholder')}
                            required
                            className="glass-input"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="costPrice">{t('costPrice')}</Label>
                        <Input
                            id="costPrice"
                            type="number"
                            step="0.01"
                            value={formData.costPrice}
                            onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                            placeholder="0.00"
                            required
                            className="glass-input"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="sellPrice">{t('sellPrice')}</Label>
                        <Input
                            id="sellPrice"
                            type="number"
                            step="0.01"
                            value={formData.sellPrice}
                            onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })}
                            placeholder="0.00"
                            required
                            className="glass-input"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="price1">{t('price1')}</Label>
                        <Input
                            id="price1"
                            type="number"
                            step="0.01"
                            value={formData.price1}
                            onChange={(e) => setFormData({ ...formData, price1: e.target.value })}
                            placeholder="0.00"
                            className="glass-input"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="price2">{t('price2')}</Label>
                        <Input
                            id="price2"
                            type="number"
                            step="0.01"
                            value={formData.price2}
                            onChange={(e) => setFormData({ ...formData, price2: e.target.value })}
                            placeholder="0.00"
                            className="glass-input"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="price3">{t('price3')}</Label>
                        <Input
                            id="price3"
                            type="number"
                            step="0.01"
                            value={formData.price3}
                            onChange={(e) => setFormData({ ...formData, price3: e.target.value })}
                            placeholder="0.00"
                            className="glass-input"
                        />
                    </div>
                </div>

                <Button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold" disabled={isPending}>
                    {isPending ? t('saving') : (
                        <><Plus className="mr-2 h-4 w-4" /> {t('addPart')}</>
                    )}
                </Button>
            </form>
        </GlassModal>
    );
}
