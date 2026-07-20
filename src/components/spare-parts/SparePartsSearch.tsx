'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { EditPriceDialog } from './EditPriceDialog';
import { ImportCSVModal } from './ImportCSVModal';
import { AddPartDialog } from './AddPartDialog';
import { BulkPriceUpdateDialog } from './BulkPriceUpdateDialog';
import { Edit, Search, Trash2, ChevronLeft, ChevronRight, Plus, Smartphone, Package, Upload, Download, Percent } from 'lucide-react';
import { useTranslations } from '@/lib/i18n-mock';
import { deleteSparePart, getSpareParts } from '@/actions/spare-parts';
import { exportToExcel } from '@/lib/export-utils';
import { toast } from 'sonner';
import clsx from 'clsx';

interface SparePart {
    id: string;
    productName: string;
    brand: string;
    quantity: any;
    costPrice: any;
    sellPrice: any;
    price1?: any;
    price2?: any;
    price3?: any;
}

interface Props {
    initialParts: SparePart[];
    brands: string[];
    initialSearch?: string;
    initialBrand?: string;
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

function SortableBrandButton({
    id,
    label,
    active,
    onClick
}: {
    id: string;
    label: string;
    active: boolean;
    onClick: () => void
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="touch-none"
        >
            <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                }}
                className={clsx(
                    "h-8 px-4 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all cursor-grab active:cursor-grabbing shadow-lg",
                    active
                        ? "bg-primary/20 text-primary border-primary/30 shadow-primary/10"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                )}
            >
                {label}
            </Button>
        </div>
    );
}

export function SparePartsSearch({
    initialParts,
    brands,
    initialSearch = '',
    initialBrand = 'all',
    meta
}: Props) {
    const t = useTranslations('SpareParts');
    const router = useRouter();
    const rawSearchParams = useSearchParams();
    const searchParams = rawSearchParams ? rawSearchParams.toString() : '';
    const [isPending, startTransition] = useTransition();

    const [search, setSearch] = useState(initialSearch);
    const [selectedBrand, setSelectedBrand] = useState(initialBrand);
    const [editingPart, setEditingPart] = useState<SparePart | null>(null);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Sortable brands state
    const [orderedBrands, setOrderedBrands] = useState<string[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Avoid accidental drags when clicking
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Initialize/Load order from localStorage
    useEffect(() => {
        const savedOrder = localStorage.getItem('spare-parts-brand-order');
        if (savedOrder) {
            try {
                const parsed = JSON.parse(savedOrder);
                // Filter out any brands that don't exist in the current list, 
                // and append any new ones.
                const validSaved = parsed.filter((b: string) => brands.includes(b));
                const missing = brands.filter(b => !validSaved.includes(b));
                setOrderedBrands([...validSaved, ...missing]);
            } catch (e) {
                setOrderedBrands(brands);
            }
        } else {
            setOrderedBrands(brands);
        }
    }, [brands]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setOrderedBrands((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over.id as string);
                const newOrder = arrayMove(items, oldIndex, newIndex);
                localStorage.setItem('spare-parts-brand-order', JSON.stringify(newOrder));
                return newOrder;
            });
        }
    };

    const handleSearchChange = (value: string) => {
        setSearch(value);
        startTransition(() => {
            const params = new URLSearchParams(searchParams);
            if (value) params.set('search', value);
            else params.delete('search');
            if (selectedBrand !== 'all') params.set('brand', selectedBrand);
            params.delete('page');
            router.push(`?${params.toString()}`);
        });
    };

    const handleBrandChange = (value: string) => {
        setSelectedBrand(value);
        startTransition(() => {
            const params = new URLSearchParams(searchParams);
            if (value !== 'all') params.set('brand', value);
            else params.delete('brand');
            if (search) params.set('search', search);
            params.delete('page');
            router.push(`?${params.toString()}`);
        });
    };

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > meta.totalPages) return;
        startTransition(() => {
            const params = new URLSearchParams(searchParams);
            params.set('page', newPage.toString());
            router.push(`?${params.toString()}`);
        });
    };

    const handleDelete = async (part: SparePart) => {
        if (!confirm(`${t('confirmDelete')} "${part.productName}"?`)) {
            return;
        }

        try {
            const result = await deleteSparePart(part.id);
            if (result.success) {
                toast.success(t('deleteSuccess'));
                router.refresh();
            } else {
                toast.error(t('deleteError'));
            }
        } catch (error) {
            toast.error(t('deleteError'));
            console.error('Error deleting part:', error);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const result = await getSpareParts({ search, brand: selectedBrand === 'all' ? undefined : selectedBrand, limit: 10000 });
            if (result.success && result.parts) {
                const data = result.parts.map((p: SparePart) => ({
                    'الرقم المرجعي': p.id,
                    'اسم الصنف': p.productName,
                    'الماركة': p.brand,
                    'الكمية': p.quantity?.toString() || '0',
                    'سعر التكلفة': p.costPrice?.toString() || '0',
                    'سعر البيع': p.sellPrice?.toString() || '0',
                    'سعر فرعي 1': p.price1?.toString() || '0',
                    'سعر فرعي 2': p.price2?.toString() || '0',
                    'سعر فرعي 3': p.price3?.toString() || '0'
                }));
                exportToExcel(data, `spare_parts_${new Date().toISOString().split('T')[0]}.xlsx`);
            } else {
                toast.error(t('exportError') || 'فشل التصدير');
            }
        } catch (e) {
            console.error(e);
            toast.error(t('exportError') || 'فشل التصدير');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <AddPartDialog
                open={isAddOpen}
                onOpenChange={setIsAddOpen}
                brands={brands}
            />

            <ImportCSVModal
                open={isImportOpen}
                onOpenChange={setIsImportOpen}
            />

            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 glass-card bg-card/50 backdrop-blur-md p-5 rounded-2xl border border-border shadow-2xl transition-all" dir="rtl">
                <div className="flex items-center gap-4 text-muted-foreground">
                    <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 shadow-inner">
                        <Smartphone className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{t('title')}</h3>
                        <p className="text-xs font-medium text-muted-foreground/60">{t('subtitle')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <Button
                        onClick={() => setIsAddOpen(true)}
                        className="flex-1 md:flex-none bg-primary hover:bg-primary/90 text-white font-black h-11 px-8 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95"
                    >
                        <Plus className="w-4 h-4 ml-2" />
                        {t('addPart')}
                    </Button>
                    <Button
                        onClick={() => setIsBulkUpdateOpen(true)}
                        className="flex-1 md:flex-none border border-primary/20 bg-primary/10 hover:bg-primary/20 text-primary font-black h-11 px-6 rounded-xl transition-all shadow-lg shadow-primary/5 active:scale-95"
                    >
                        <Percent className="w-4 h-4 ml-2" />
                        {t('bulkPriceUpdate')}
                    </Button>
                    <div className="flex gap-2 w-full md:w-auto">
                        <Button
                            onClick={handleExport}
                            disabled={isExporting}
                            variant="outline"
                            className="flex-1 md:flex-none h-11 px-6 rounded-xl border-border bg-muted/20 hover:bg-muted transition-all font-bold"
                        >
                            {isExporting ? <div className="w-4 h-4 ml-2 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" /> : <Download className="w-4 h-4 ml-2" />}
                            {t('exportExcel') || 'تصدير (Excel)'}
                        </Button>
                        <Button
                            onClick={() => setIsImportOpen(true)}
                            variant="outline"
                            className="flex-1 md:flex-none h-11 px-6 rounded-xl border-border bg-muted/20 hover:bg-muted transition-all font-bold"
                        >
                            <Upload className="w-4 h-4 ml-2" />
                            {t('importCSV') || 'استيراد CSV'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 glass-card bg-card/40 backdrop-blur-sm p-6 rounded-2xl border border-border shadow-xl" dir="rtl">
                <div className="sm:col-span-2 space-y-2.5">
                    <Label htmlFor="search" className="text-[10px] uppercase font-black text-muted-foreground tracking-widest mr-1">{t('searchPlaceholder')}</Label>
                    <div className="relative group">
                        <Search className="absolute right-3.5 top-3.5 h-4 w-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                        <Input
                            id="search"
                            type="search"
                            placeholder={t('searchPlaceholder')}
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="h-11 bg-muted/30 border-border rounded-xl pr-11 focus:ring-primary/20 transition-all font-medium placeholder:text-muted-foreground/30"
                        />
                    </div>
                </div>

                <div className="space-y-2.5">
                    <Label htmlFor="brand" className="text-[10px] uppercase font-black text-muted-foreground tracking-widest mr-1">{t('brand')}</Label>
                    <Select value={selectedBrand} onValueChange={handleBrandChange}>
                        <SelectTrigger id="brand" className="h-11 bg-muted/30 border-border rounded-xl focus:ring-primary/20 transition-all font-black text-foreground">
                            <SelectValue placeholder={t('allBrands')} />
                        </SelectTrigger>
                        <SelectContent className="glass-card bg-card border-border shadow-2xl rounded-xl">
                            <SelectItem value="all" className="font-bold">{t('allBrands')}</SelectItem>
                            {brands.map((brand) => (
                                <SelectItem key={brand} value={brand} className="font-bold">
                                    {brand}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-end">
                    <div className="w-full bg-primary/5 border border-primary/20 rounded-xl p-3 text-center shadow-inner">
                        <div className="text-[10px] text-muted-foreground uppercase font-black tracking-tighter leading-none mb-1.5">{t('resultsCountLabel')}</div>
                        <div className="text-lg font-black text-primary leading-none">{meta.total}</div>
                    </div>
                </div>
            </div>

            {/* Fast Brand Search Buttons */}
            <div className="flex flex-wrap gap-2.5 px-1" dir="rtl">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBrandChange('all')}
                    className={clsx(
                        "h-8 px-4 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all shadow-lg",
                        selectedBrand === 'all'
                            ? "bg-primary/20 text-primary border-primary/30"
                            : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                    )}
                >
                    {t('allBrands')}
                </Button>

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={orderedBrands}
                        strategy={horizontalListSortingStrategy}
                    >
                        <div className="flex flex-wrap gap-2">
                            {orderedBrands.map((brand) => (
                                <SortableBrandButton
                                    key={brand}
                                    id={brand}
                                    label={brand}
                                    active={selectedBrand === brand}
                                    onClick={() => handleBrandChange(brand)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>

            {/* Results Table */}
            <div className="glass-card rounded-2xl border border-border bg-card/50 backdrop-blur-xl overflow-hidden shadow-2xl transition-all duration-300" dir="rtl">
                <Table>
                    <TableHeader className="bg-muted/60">
                        <TableRow className="hover:bg-transparent border-border h-14">
                            <TableHead className="text-right text-[10px] uppercase font-black text-foreground/80 tracking-widest">{t('productName')}</TableHead>
                            <TableHead className="w-[120px] text-center text-[10px] uppercase font-black text-foreground/80 tracking-widest">{t('brand')}</TableHead>
                            <TableHead className="w-[100px] text-center text-[10px] uppercase font-black text-foreground/80 tracking-widest">{t('quantity')}</TableHead>
                            <TableHead className="w-[120px] text-center text-[10px] uppercase font-black text-foreground/80 tracking-widest">{t('sellPrice')}</TableHead>
                            <TableHead className="w-[100px] text-center text-[10px] uppercase font-black text-foreground/80 tracking-widest">{t('price1')}</TableHead>
                            <TableHead className="w-[100px] text-center text-[10px] uppercase font-black text-foreground/80 tracking-widest">{t('price2')}</TableHead>
                            <TableHead className="w-[100px] text-center text-[10px] uppercase font-black text-foreground/80 tracking-widest">{t('price3')}</TableHead>
                            <TableHead className="w-[120px] text-center text-[10px] uppercase font-black text-foreground/80 tracking-widest">{t('costPrice')}</TableHead>
                            <TableHead className="w-[100px] text-center text-[10px] uppercase font-black text-foreground/80 tracking-widest">{t('actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {initialParts.map((part) => (
                            <TableRow 
                                key={part.id} 
                                className={cn(
                                    "border-border/40 transition-all group h-14 hover:bg-primary/10",
                                    "even:bg-muted/70"
                                )}
                            >
                                <TableCell className="font-black text-sm text-foreground py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1 h-6 bg-primary/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {part.productName}
                                    </div>
                                </TableCell>
                                <TableCell className="text-center">
                                    <span className="text-[10px] bg-muted border border-border text-muted-foreground px-2.5 py-1 rounded-lg font-black uppercase tracking-tight shadow-sm">
                                        {part.brand}
                                    </span>
                                </TableCell>
                                <TableCell className="text-center font-mono text-sm font-black text-muted-foreground/80">
                                    {part.quantity}
                                </TableCell>
                                <TableCell className="text-center">
                                    <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">{part.sellPrice}</div>
                                </TableCell>
                                <TableCell className="text-center font-mono text-[11px] font-bold text-muted-foreground/60">
                                    {part.price1 || '0'}
                                </TableCell>
                                <TableCell className="text-center font-mono text-[11px] font-bold text-muted-foreground/60">
                                    {part.price2 || '0'}
                                </TableCell>
                                <TableCell className="text-center font-mono text-[11px] font-bold text-muted-foreground/60">
                                    {part.price3 || '0'}
                                </TableCell>
                                <TableCell className="text-center">
                                    <div className="text-sm font-black text-rose-500/80 font-mono">{part.costPrice}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setEditingPart(part)}
                                            className="h-8 w-8 text-muted-foreground hover:text-cyan-400 hover:bg-cyan-400/10"
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDelete(part)}
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {initialParts.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 opacity-30">
                        <Package className="w-12 h-12" />
                        <p className="text-sm font-medium">{t('noResults')}</p>
                    </div>
                )}
            </div>

            {/* Pagination Container */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 glass-card bg-card/60 backdrop-blur-md p-5 rounded-2xl border border-border shadow-xl px-6" dir="rtl">
                <div className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                    {t('showing')} <span className="text-foreground font-black bg-muted px-2 py-1 rounded-lg border border-border mx-1">{(meta.page - 1) * meta.limit + 1}</span> {t('to')} <span className="text-foreground font-black bg-muted px-2 py-1 rounded-lg border border-border mx-1">{Math.min(meta.page * meta.limit, meta.total)}</span> {t('of')} <span className="text-primary font-black mx-1">{meta.total}</span> {t('results')}
                </div>

                <div className="flex items-center gap-6">
                    {isPending && <div className="w-5 h-5 border-[3px] border-primary border-t-transparent animate-spin rounded-full shadow-[0_0_10px_rgba(var(--primary),0.3)]" />}

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(meta.page - 1)}
                            disabled={meta.page <= 1}
                            className="bg-muted/50 hover:bg-muted border-border h-10 px-4 rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
                        >
                            <ChevronRight className="h-4 w-4 ml-1.5" />
                            <span className="font-bold">{t('previous')}</span>
                        </Button>

                        <div className="px-6 h-10 flex items-center bg-muted/30 border border-border rounded-xl text-[11px] font-black text-muted-foreground uppercase tracking-widest shadow-inner">
                            {t('page')} <span className="text-primary font-black mx-2 text-sm">{meta.page}</span> {t('of')} <span className="text-foreground font-black mx-2 text-sm font-mono">{meta.totalPages}</span>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(meta.page + 1)}
                            disabled={meta.page >= meta.totalPages}
                            className="bg-muted/50 hover:bg-muted border-border h-10 px-4 rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
                        >
                            <span className="font-bold">{t('next')}</span>
                            <ChevronLeft className="h-4 w-4 mr-1.5" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Edit Dialog Integration */}
            {editingPart && (
                <EditPriceDialog
                    part={editingPart}
                    open={!!editingPart}
                    onOpenChange={(open) => !open && setEditingPart(null)}
                    brands={brands}
                />
            )}

            <BulkPriceUpdateDialog
                open={isBulkUpdateOpen}
                onOpenChange={setIsBulkUpdateOpen}
                totalAffected={meta.total}
                currentBrand={selectedBrand === 'all' ? undefined : selectedBrand}
                currentSearch={search}
            />
        </div>
    );
}
