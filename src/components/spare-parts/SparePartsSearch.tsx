'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { AddPartDialog } from './AddPartDialog';
import { Edit, Search, Trash2, ChevronLeft, ChevronRight, Plus, Smartphone, Package } from 'lucide-react';
import { useTranslations } from '@/lib/i18n-mock';
import { deleteSparePart } from '@/actions/spare-parts';
import { toast } from 'sonner';
import clsx from 'clsx';

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
                    "h-7 px-3 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all cursor-grab active:cursor-grabbing",
                    active 
                        ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]" 
                        : "bg-white/5 text-muted-foreground border-transparent hover:bg-white/10"
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
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [search, setSearch] = useState(initialSearch);
    const [selectedBrand, setSelectedBrand] = useState(initialBrand);
    const [editingPart, setEditingPart] = useState<SparePart | null>(null);
    const [isAddOpen, setIsAddOpen] = useState(false);
    
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

    return (
        <div className="space-y-6">
            <AddPartDialog
                open={isAddOpen}
                onOpenChange={setIsAddOpen}
                brands={brands}
            />

            {/* Header Section */}
            <div className="flex justify-between items-center bg-muted/30 p-4 rounded-2xl border border-border" dir="rtl">
                <div className="flex items-center gap-3 text-muted-foreground">
                    <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                        <Smartphone className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{t('title')}</h3>
                        <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
                    </div>
                </div>

                <Button
                    onClick={() => setIsAddOpen(true)}
                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold h-10 px-6 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all"
                >
                    <Plus className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
                    {t('addPart')}
                </Button>
            </div>

            {/* Filters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-muted/20 p-4 rounded-2xl border border-border/50" dir="rtl">
                <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="search" className="text-[10px] uppercase font-bold text-muted-foreground ml-1">{t('searchPlaceholder')}</Label>
                    <div className="relative">
                        <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="search"
                            type="search"
                            placeholder={t('searchPlaceholder')}
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="glass-input pr-10"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="brand" className="text-[10px] uppercase font-bold text-muted-foreground ml-1">{t('brand')}</Label>
                    <Select value={selectedBrand} onValueChange={handleBrandChange}>
                        <SelectTrigger id="brand" className="glass-input">
                            <SelectValue placeholder={t('allBrands')} />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-border">
                            <SelectItem value="all">{t('allBrands')}</SelectItem>
                            {brands.map((brand) => (
                                <SelectItem key={brand} value={brand}>
                                    {brand}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-end pb-0.5">
                    <div className="w-full bg-white/5 border border-white/5 rounded-xl p-2.5 text-center">
                        <div className="text-[10px] text-muted-foreground uppercase font-bold leading-none mb-1">{t('resultsCountLabel')}</div>
                        <div className="text-sm font-bold text-cyan-400 leading-none">{meta.total}</div>
                    </div>
                </div>
            </div>

            {/* Fast Brand Search Buttons */}
            <div className="flex flex-wrap gap-2 px-1" dir="rtl">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBrandChange('all')}
                    className={clsx(
                        "h-7 px-3 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all",
                        selectedBrand === 'all' 
                            ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" 
                            : "bg-white/5 text-muted-foreground border-transparent hover:bg-white/10"
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
            <div className="rounded-2xl border border-border bg-card/50 overflow-hidden" dir="rtl">
                <Table>
                    <TableHeader className="bg-muted/30">
                        <TableRow className="hover:bg-transparent border-border/50">
                            <TableHead className="text-right text-xs uppercase font-bold text-muted-foreground">{t('productName')}</TableHead>
                            <TableHead className="w-[120px] text-center text-xs uppercase font-bold text-muted-foreground">{t('brand')}</TableHead>
                            <TableHead className="w-[100px] text-center text-xs uppercase font-bold text-muted-foreground">{t('quantity')}</TableHead>
                            <TableHead className="w-[120px] text-center text-xs uppercase font-bold text-muted-foreground">{t('sellPrice')}</TableHead>
                            <TableHead className="w-[100px] text-center text-xs uppercase font-bold text-muted-foreground">{t('price1')}</TableHead>
                            <TableHead className="w-[100px] text-center text-xs uppercase font-bold text-muted-foreground">{t('price2')}</TableHead>
                            <TableHead className="w-[100px] text-center text-xs uppercase font-bold text-muted-foreground">{t('price3')}</TableHead>
                            <TableHead className="w-[120px] text-center text-xs uppercase font-bold text-muted-foreground">{t('costPrice')}</TableHead>
                            <TableHead className="w-[100px] text-center text-xs uppercase font-bold text-muted-foreground">{t('actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {initialParts.map((part) => (
                            <TableRow key={part.id} className="border-border/40 hover:bg-white/[0.02] transition-colors group odd:bg-white/[0.01]">
                                <TableCell className="font-bold text-sm text-foreground py-4">
                                    {part.productName}
                                </TableCell>
                                <TableCell className="text-center">
                                    <span className="text-[10px] bg-white/5 text-muted-foreground px-2 py-0.5 rounded-full border border-white/10 font-bold uppercase">
                                        {part.brand}
                                    </span>
                                </TableCell>
                                <TableCell className="text-center font-mono text-sm text-zinc-400">
                                    {part.quantity}
                                </TableCell>
                                <TableCell className="text-center">
                                    <div className="text-sm font-bold text-green-400">{part.sellPrice}</div>
                                </TableCell>
                                <TableCell className="text-center font-mono text-xs text-zinc-400">
                                    {part.price1 || '0'}
                                </TableCell>
                                <TableCell className="text-center font-mono text-xs text-zinc-400">
                                    {part.price2 || '0'}
                                </TableCell>
                                <TableCell className="text-center font-mono text-xs text-zinc-400">
                                    {part.price3 || '0'}
                                </TableCell>
                                <TableCell className="text-center">
                                    <div className="text-sm font-medium text-red-400/70">{part.costPrice}</div>
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
            <div className="flex items-center justify-between px-2 bg-muted/10 p-4 rounded-2xl border border-border/40" dir="rtl">
                <div className="text-xs text-muted-foreground font-medium">
                    {t('showing')} <span className="text-foreground font-bold">{(meta.page - 1) * meta.limit + 1}</span> {t('to')} <span className="text-foreground font-bold">{Math.min(meta.page * meta.limit, meta.total)}</span> {t('of')} <span className="text-foreground font-bold">{meta.total}</span> {t('results')}
                </div>
                
                <div className="flex items-center gap-4">
                    {isPending && <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />}
                    
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(meta.page - 1)}
                            disabled={meta.page <= 1}
                            className="glass-card hover:bg-white/5 border-border/50 h-8"
                        >
                            <ChevronRight className="h-4 w-4 ml-1" />
                            {t('previous')}
                        </Button>
                        
                        <div className="px-4 text-xs font-bold text-muted-foreground">
                            {t('page')} <span className="text-cyan-400">{meta.page}</span> {t('of')} {meta.totalPages}
                        </div>
                        
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(meta.page + 1)}
                            disabled={meta.page >= meta.totalPages}
                            className="glass-card hover:bg-white/5 border-border/50 h-8"
                        >
                            {t('next')}
                            <ChevronLeft className="h-4 w-4 mr-1" />
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
                />
            )}
        </div>
    );
}
