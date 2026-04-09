"use client";

import { useState, useRef, useCallback, useEffect, KeyboardEvent, forwardRef } from "react";
import { createPortal } from "react-dom";
import { Trash2, History, Loader2, Sparkles, Tag, ChevronDown, Plus, Pencil } from "lucide-react";
import { clsx } from "clsx";
import { safeRandomUUID } from "@/lib/utils";
import { getProductPriceHistory, generateNextSku, updateCategory, deleteCategory, updateModel, deleteModel, updateAttribute, deleteAttribute, updateUnitOfMeasure, deleteUnitOfMeasure } from "@/actions/inventory";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n-mock";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { InvoiceItem } from "@/hooks/usePurchaseForm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GridRow {
    id: string;
    productId?: string;
    itemCode: string;
    itemName: string;
    categoryId: string;
    modelId?: string;
    modelName?: string;
    attributeId?: string;
    attributeName?: string;
    isNewModel?: boolean;
    isNewAttribute?: boolean;
    unit: string;
    quantity: number;
    unitPrice: number;
    subTotal: number;
    // Carry-over for submission
    sellPrice?: number;
    sellPrice2?: number;
    sellPrice3?: number;
    isNew: boolean;
    isDevice?: boolean;
    deviceType?: string;
    condition?: string;
    imei?: string;
    unitOfMeasureId?: string;
    conversionFactor: number;
}

interface ProductOption {
    id: string;
    name: string;
    sku: string;
    costPrice: number;
    sellPrice: number;
    sellPrice2?: number;
    sellPrice3?: number;
    stock: number;
}

interface CategoryOption {
    id: string;
    name: string;
}

interface UnitOption {
    id: string;
    name: string;
    conversionFactor?: number | any;
}

interface ModelOption {
    id: string;
    name: string;
    categoryId: string;
}

interface AttributeOption {
    id: string;
    name: string;
}

interface PurchaseDataGridProps {
    products: ProductOption[];
    categories: CategoryOption[];
    models: ModelOption[];
    attributes: AttributeOption[];
    units: UnitOption[];
    rows: GridRow[];
    onRowsChange: (rows: GridRow[]) => void;
    currencySymbol?: string;
    onQuickCreateCategory?: (name: string, callback: (id: string) => void) => void;
    onQuickCreateModel?: (name: string, categoryId: string, callback: (id: string) => void) => void;
    onQuickCreateAttribute?: (name: string, callback: (id: string) => void) => void;
    onQuickCreateUnit?: (name: string, callback: (id: string, name: string) => void) => void;
    csrfToken?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// "categoryId" is skipped in Tab for existing rows — handled in handleKeyDown
const ALL_EDITABLE_COLS = ["itemCode", "categoryId", "modelId", "attributeId", "itemName", "unit", "conversionFactor", "quantity", "unitPrice", "sellPrice", "sellPrice2", "sellPrice3"] as const;
type EditableCol = (typeof ALL_EDITABLE_COLS)[number];

const CELL_CLS = "border-e border-slate-200 dark:border-white/10 last:border-e-0 truncate px-3 py-2 transition-colors";
const HEADER_CELL_CLS = "px-4 py-3 text-start font-black text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-e border-slate-200 dark:border-white/10 last:border-e-0 bg-zinc-50 dark:bg-zinc-900/50 relative group/h";

function createEmptyRow(): GridRow {
    return {
        id: safeRandomUUID(),
        productId: undefined,
        itemCode: "",
        itemName: "",
        categoryId: "",
        modelId: "",
        attributeId: "",
        unit: "قطعة",
        quantity: 1,
        unitPrice: 0,
        subTotal: 0,
        conversionFactor: 1,
        isNew: true, // Default to true for empty rows to allow category selection
    };
}

function computeSubTotal(qty: number, price: number): number {
    return Math.round(qty * price * 100) / 100;
}

// Returns the next editable col, skipping categoryId for existing products
function nextEditableCol(current: EditableCol, isNew: boolean): EditableCol | null {
    const cols = ALL_EDITABLE_COLS;
    let idx = cols.indexOf(current) + 1;
    while (idx < cols.length) {
        const col = cols[idx];
        // Skip categoryId for existing items
        if (col === "categoryId" && !isNew) { idx++; continue; }
        // Skip auto-generated itemName for new items to speed up flow
        if (col === "itemName" && isNew) { idx++; continue; }
        // Skip conversionFactor for new items (defaults to 1) for rapid entry
        if (col === "conversionFactor" && isNew) { idx++; continue; }
        return col;
    }
    return null;
}

function prevEditableCol(current: EditableCol, isNew: boolean): EditableCol | null {
    const cols = ALL_EDITABLE_COLS;
    let idx = cols.indexOf(current) - 1;
    while (idx >= 0) {
        const col = cols[idx];
        // Skip categoryId for existing items
        if (col === "categoryId" && !isNew) { idx--; continue; }
        // Skip auto-generated itemName for new items
        if (col === "itemName" && isNew) { idx--; continue; }
        // Skip conversionFactor for new items
        if (col === "conversionFactor" && isNew) { idx--; continue; }
        return col;
    }
    return null;
}

/**
 * Excel-style Auto-fit: Measures text width using Canvas API for performance.
 */
function getTextWidth(text: string, font: string = "bold 11px Cairo, sans-serif"): number {
    if (typeof document === "undefined") return 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return 0;
    context.font = font;
    return context.measureText(text).width;
}

const DEFAULT_WIDTHS = [24, 100, 110, 110, 110, 250, 60, 60, 60, 90, 85, 85, 85, 100, 32];
const STORAGE_KEY = "casper-purchase-grid-widths-v1";

// ─── Price History Popover ─────────────────────────────────────────────────────

// ─── Price History Popover ─────────────────────────────────────────────────────

function PriceHistoryPopover({ productId, name }: { productId: string; name: string }) {
    const [history, setHistory] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);

    const handleOpen = async (open: boolean) => {
        if (open && !history) {
            setLoading(true);
            const res = await getProductPriceHistory(productId);
            if (res.success && res.history) setHistory(res.history);
            setLoading(false);
        }
    };

    return (
        <Popover onOpenChange={handleOpen}>
            <PopoverTrigger asChild>
                <button type="button" className="p-1 hover:bg-cyan-500/10 text-cyan-500/60 hover:text-cyan-500 rounded transition-colors" title="سجل الأسعار" tabIndex={-1}>
                    <History className="w-3 h-3" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0 bg-popover border border-border shadow-2xl rounded-xl overflow-hidden" align="end">
                <div className="bg-muted/50 p-2.5 border-b border-border">
                    <h4 className="text-xs font-bold flex items-center gap-2">
                        <History className="w-3.5 h-3.5 text-cyan-500" />سجل الأسعار
                    </h4>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{name}</p>
                </div>
                <div className="p-1 max-h-52 overflow-y-auto">
                    {loading ? (
                        <div className="p-6 flex flex-col items-center gap-2 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                    ) : !history || history.length === 0 ? (
                        <div className="p-5 text-center text-muted-foreground text-[10px] italic">لا يوجد سجل</div>
                    ) : (
                        <div className="divide-y divide-border">
                            {history.map((h) => (
                                <div key={h.id} className="p-2 hover:bg-muted/30 text-[11px] flex justify-between items-center">
                                    <div>
                                        <div className="font-bold text-foreground">{h.supplierName}</div>
                                        <div className="text-[9px] text-muted-foreground">{new Date(h.date).toLocaleDateString("ar-EG")}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold font-mono text-cyan-500">{h.unitCost?.toFixed(2)}</div>
                                        <div className="text-[9px] text-muted-foreground">{h.invoiceNumber}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ─── Category Selection Dropdown (Premium) ───────────────────────────────────

interface CategoryDropdownProps {
    value: string;
    options: CategoryOption[];
    onChange: (val: string) => void;
    onEdit?: (id: string, currentName: string) => void;
    onDelete?: (id: string) => void;
    triggerRef?: (el: HTMLElement | null) => void; 
    onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
    onFocus?: () => void;
    onQuickCreate?: (name: string) => void;
}

function CategoryDropdown({ value, options = [], onChange, onEdit, onDelete, triggerRef, onKeyDown, onFocus, onQuickCreate }: CategoryDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
    const localRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()));
    const canQuickCreate = query.trim().length > 0 && !options.some(o => o.name.toLowerCase() === query.toLowerCase().trim()) && !!onQuickCreate;
    const totalItems = filtered.length + (canQuickCreate ? 1 : 0);

    const openMenu = (initialQuery: string = "") => {
        const el = localRef.current;
        if (el) {
            const rect = el.getBoundingClientRect();
            setCoords({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width
            });
            setQuery(initialQuery);
            setSelectedIndex(0);
            setIsOpen(true);
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current?.contains(e.target as Node)) return;
            if (localRef.current?.contains(e.target as Node)) return;
            setIsOpen(false);
        };

        window.addEventListener("mousedown", handleClickOutside, { capture: true });
        return () => window.removeEventListener("mousedown", handleClickOutside, { capture: true });
    }, [isOpen]);

    const selectedName = options.find(o => o.id === value)?.name || "-- اختر الفئة --";

    return (
        <div className="w-full relative h-full flex items-center" onFocus={onFocus}>
            <button
                type="button"
                ref={(el) => {
                    (localRef as any).current = el;
                    if (triggerRef) triggerRef(el);
                }}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openMenu();
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        openMenu();
                    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        // Start typing to open
                        e.preventDefault();
                        e.stopPropagation();
                        openMenu(e.key);
                    } else if (onKeyDown) {
                        onKeyDown(e);
                    }
                }}
                className={clsx(
                    "w-full h-full text-start px-2 py-1.5 text-[11px] outline-none transition-all cursor-pointer font-bold flex items-center group/cat",
                    "focus:bg-emerald-500/10 focus:ring-1 focus:ring-emerald-500/50 rounded",
                    !value ? "text-rose-400 italic" : "text-emerald-500"
                )}
            >
                <span className="truncate">{selectedName}</span>
            </button>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed bg-zinc-900/95 backdrop-blur-2xl border-2 border-white/10 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[999999] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
                    style={{
                        top: `${coords.top + 6}px`,
                        left: `${coords.left}px`,
                        minWidth: `${Math.max(coords.width, 180)}px`
                    }}
                >
                    {/* Inline Search */}
                    <div className="p-2 border-b border-white/5 bg-white/5">
                        <input 
                            autoFocus
                            className="w-full bg-transparent text-[11px] text-white outline-none px-1"
                            placeholder="ابحث عن فئة..."
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setSelectedIndex(0);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setSelectedIndex(prev => (prev + 1) % totalItems);
                                } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems);
                                } else if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (selectedIndex < filtered.length) {
                                        onChange(filtered[selectedIndex].id);
                                        setIsOpen(false);
                                    } else if (canQuickCreate) {
                                        onQuickCreate!(query.trim());
                                        setIsOpen(false);
                                    }
                                } else if (e.key === "Escape") {
                                    setIsOpen(false);
                                }
                            }}
                        />
                    </div>

                    <div className="max-h-52 overflow-y-auto py-1">
                        {filtered.map((opt, idx) => (
                            <div 
                                key={opt.id}
                                className={clsx(
                                    "group/item w-full flex items-center justify-between px-4 py-2 text-xs font-black transition-all border-b border-white/5 last:border-0",
                                    selectedIndex === idx
                                        ? "bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                                        : opt.id === value 
                                            ? "bg-emerald-500/20 text-emerald-500"
                                            : "text-zinc-400 hover:bg-emerald-500/10 hover:text-emerald-500"
                                )}
                                onMouseEnter={() => setSelectedIndex(idx)}
                            >
                                <button
                                    type="button"
                                    className="flex-1 text-right h-full outline-none"
                                    onClick={() => { onChange(opt.id); setIsOpen(false); }}
                                >
                                    {opt.name}
                                </button>
                                
                                {onEdit && onDelete && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                        <button 
                                            className="p-1 hover:bg-black/10 rounded transition-colors"
                                            onClick={(e) => { e.stopPropagation(); onEdit(opt.id, opt.name); }}
                                        >
                                            <Pencil className="w-3 h-3 opacity-50 hover:opacity-100" />
                                        </button>
                                        <button 
                                            className="p-1 hover:bg-black/10 rounded transition-colors"
                                            onClick={(e) => { e.stopPropagation(); onDelete(opt.id); }}
                                        >
                                            <Trash2 className="w-3 h-3 opacity-50 hover:text-rose-500 hover:opacity-100" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}

                        {canQuickCreate && (
                            <button
                                type="button"
                                onMouseEnter={() => setSelectedIndex(filtered.length)}
                                onClick={() => { onQuickCreate!(query.trim()); setIsOpen(false); }}
                                className={clsx(
                                    "w-full flex items-center gap-2 px-4 py-3 transition-colors text-start group border-t border-white/5",
                                    selectedIndex === filtered.length ? "bg-emerald-500/20" : "hover:bg-emerald-500/10"
                                )}
                            >
                                <span className={clsx(
                                    "flex-shrink-0 p-1 rounded-md transition-colors",
                                    selectedIndex === filtered.length ? "bg-emerald-500 text-black" : "bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20"
                                )}>
                                    <Plus className="w-3 h-3" />
                                </span>
                                <div>
                                    <div className={clsx(
                                        "text-[10px] font-black",
                                        selectedIndex === filtered.length ? "text-white" : "text-emerald-500"
                                    )}>إضافة فئة جديدة</div>
                                    <div className="text-[9px] text-zinc-500 truncate max-w-[10rem]">"{query.trim()}"</div>
                                </div>
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
// ─── Model Selection Dropdown (Premium Cascading) ───────────────────────

interface ModelDropdownProps {
    value?: string;
    categoryId: string;
    options: ModelOption[];
    categories: CategoryOption[];
    onChange: (id: string) => void;
    onEdit?: (id: string, currentName: string) => void;
    onDelete?: (id: string) => void;
    triggerRef?: (el: HTMLElement | null) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
    onFocus?: () => void;
    onQuickCreate?: (name: string) => void;
}

function ModelDropdown({ value, categoryId, options = [], categories = [], onChange, onEdit, onDelete, triggerRef, onKeyDown, onFocus, onQuickCreate }: ModelDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
    const localRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filteredOptions = options.filter(o => o.categoryId === categoryId);
    const filtered = filteredOptions.filter(o => o.name.toLowerCase().includes(query.toLowerCase()));
    const canQuickCreate = query.trim().length > 0 && !filteredOptions.some(o => o.name.toLowerCase() === query.toLowerCase().trim()) && !!onQuickCreate;
    const totalItems = filtered.length + (canQuickCreate ? 1 : 0);

    const openMenu = (initialQuery: string = "") => {
        if (!categoryId) return; // Cannot open if no category
        const el = localRef.current;
        if (el) {
            const rect = el.getBoundingClientRect();
            setCoords({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width
            });
            setQuery(initialQuery);
            setSelectedIndex(0);
            setIsOpen(true);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current?.contains(e.target as Node)) return;
            if (localRef.current?.contains(e.target as Node)) return;
            setIsOpen(false);
        };
        window.addEventListener("mousedown", handleClickOutside, { capture: true });
        return () => window.removeEventListener("mousedown", handleClickOutside, { capture: true });
    }, [isOpen]);

    const selectedBrand = filteredOptions.find(o => o.id === value);
    const selectedCat = categories.find(c => c.id === categoryId);
    
    let selectedName = "";
    if (selectedBrand) {
        selectedName = selectedCat ? `${selectedCat.name} - ${selectedBrand.name}` : selectedBrand.name;
    } else {
        selectedName = categoryId ? "-- اختر موديل --" : "-- اختر فئة أولاً --";
    }

    return (
        <div className="w-full relative h-full flex items-center" onFocus={onFocus}>
            <button
                type="button"
                disabled={!categoryId}
                ref={(el) => {
                    (localRef as any).current = el;
                    if (triggerRef) triggerRef(el);
                }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); openMenu(); }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault(); e.stopPropagation(); openMenu();
                    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && categoryId) {
                        e.preventDefault(); e.stopPropagation(); openMenu(e.key);
                    } else if (onKeyDown) {
                        onKeyDown(e);
                    }
                }}
                className={clsx(
                    "w-full h-full text-start px-2 py-1.5 text-[11px] outline-none transition-all cursor-pointer font-bold flex items-center group/model",
                    "focus:bg-violet-500/10 focus:ring-1 focus:ring-violet-500/50 rounded",
                    !value ? "text-amber-400 italic" : "text-violet-500",
                    !categoryId && "opacity-30 cursor-not-allowed"
                )}
            >
                <span className="truncate">{selectedName}</span>
            </button>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed bg-zinc-900/95 backdrop-blur-2xl border-2 border-white/10 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[999999] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
                    style={{
                        top: `${coords.top + 6}px`,
                        left: `${coords.left}px`,
                        minWidth: `${Math.max(coords.width, 160)}px`
                    }}
                >
                    <div className="p-2 border-b border-white/5 bg-white/5">
                        <input
                            autoFocus
                            className="w-full bg-transparent text-[11px] text-white outline-none px-1"
                            placeholder="ابحث..."
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setSelectedIndex(0);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setSelectedIndex(prev => (prev + 1) % totalItems);
                                } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems);
                                } else if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (selectedIndex < filtered.length) {
                                        onChange(filtered[selectedIndex].id);
                                        setIsOpen(false);
                                    } else if (canQuickCreate) {
                                        onQuickCreate!(query.trim());
                                        setIsOpen(false);
                                    }
                                } else if (e.key === "Escape") {
                                    setIsOpen(false);
                                }
                            }}
                        />
                    </div>

                    <div className="max-h-52 overflow-y-auto py-1">
                        {filtered.map((opt, idx) => {
                            const cat = categories.find(c => c.id === opt.categoryId);
                            return (
                            <div
                                key={opt.id}
                                className={clsx(
                                    "group/item w-full flex items-center justify-between px-4 py-2 text-xs font-black transition-all border-b border-white/5 last:border-0",
                                    selectedIndex === idx
                                        ? "bg-violet-500 text-black shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                                        : opt.id === value
                                            ? "bg-violet-500/20 text-violet-500"
                                            : "text-zinc-400 hover:bg-violet-500/10 hover:text-violet-500"
                                )}
                                onMouseEnter={() => setSelectedIndex(idx)}
                            >
                                <button
                                    type="button"
                                    className="flex-1 text-right h-full outline-none"
                                    onClick={() => { onChange(opt.id); setIsOpen(false); }}
                                >
                                    {cat ? `${cat.name} - ` : ""}{opt.name}
                                </button>

                                {onEdit && onDelete && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                        <button 
                                            className="p-1 hover:bg-black/10 rounded transition-colors"
                                            onClick={(e) => { e.stopPropagation(); onEdit(opt.id, opt.name); }}
                                        >
                                            <Pencil className="w-3 h-3 opacity-50 hover:opacity-100" />
                                        </button>
                                        <button 
                                            className="p-1 hover:bg-black/10 rounded transition-colors"
                                            onClick={(e) => { e.stopPropagation(); onDelete(opt.id); }}
                                        >
                                            <Trash2 className="w-3 h-3 opacity-50 hover:text-rose-500 hover:opacity-100" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            );
                        })}

                        {canQuickCreate && (
                            <button
                                type="button"
                                onMouseEnter={() => setSelectedIndex(filtered.length)}
                                onClick={() => { onQuickCreate!(query.trim()); setIsOpen(false); }}
                                className={clsx(
                                    "w-full flex items-center gap-2 px-4 py-3 transition-colors text-start group border-t border-white/5",
                                    selectedIndex === filtered.length ? "bg-violet-500/20" : "hover:bg-violet-500/10"
                                )}
                            >
                                <span className={clsx(
                                    "flex-shrink-0 p-1 rounded-md transition-colors",
                                    selectedIndex === filtered.length ? "bg-violet-500 text-black" : "bg-violet-500/10 text-violet-500 group-hover:bg-violet-500/20"
                                )}>
                                    <Plus className="w-3 h-3" />
                                </span>
                                <div>
                                    <div className={clsx(
                                        "text-[10px] font-black",
                                        selectedIndex === filtered.length ? "text-white" : "text-violet-500"
                                    )}>إضافة موديل: "{query.trim()}"</div>
                                </div>
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

// ─── Attribute Selection Dropdown (Premium) ───────────────────────────

interface AttributeDropdownProps {
    value?: string;
    options: AttributeOption[];
    onChange: (id: string, name: string) => void;
    onEdit?: (id: string, currentName: string) => void;
    onDelete?: (id: string) => void;
    triggerRef?: (el: HTMLElement | null) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
    onFocus?: () => void;
    onQuickCreate?: (name: string) => void;
}

function AttributeDropdown({ value, options = [], onChange, onEdit, onDelete, triggerRef, onKeyDown, onFocus, onQuickCreate }: AttributeDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
    const localRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()));
    const canQuickCreate = query.trim().length > 0 && !options.some(o => o.name.toLowerCase() === query.toLowerCase().trim()) && !!onQuickCreate;
    const totalItems = filtered.length + (canQuickCreate ? 1 : 0);

    const openMenu = (initialQuery: string = "") => {
        const el = localRef.current;
        if (el) {
            const rect = el.getBoundingClientRect();
            setCoords({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width
            });
            setQuery(initialQuery);
            setSelectedIndex(0);
            setIsOpen(true);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current?.contains(e.target as Node)) return;
            if (localRef.current?.contains(e.target as Node)) return;
            setIsOpen(false);
        };
        window.addEventListener("mousedown", handleClickOutside, { capture: true });
        return () => window.removeEventListener("mousedown", handleClickOutside, { capture: true });
    }, [isOpen]);

    const selectedAttr = options.find(o => o.id === value);
    const selectedName = selectedAttr?.name || "-- الصف/النوع --";

    return (
        <div className="w-full relative h-full flex items-center" onFocus={onFocus}>
            <button
                type="button"
                ref={(el) => {
                    (localRef as any).current = el;
                    if (triggerRef) triggerRef(el);
                }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); openMenu(); }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault(); e.stopPropagation(); openMenu();
                    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        e.preventDefault(); e.stopPropagation(); openMenu(e.key);
                    } else if (onKeyDown) {
                        onKeyDown(e);
                    }
                }}
                className={clsx(
                    "w-full h-full text-start px-2 py-1.5 text-[11px] outline-none transition-all cursor-pointer font-bold flex items-center group/attr",
                    "focus:bg-rose-500/10 focus:ring-1 focus:ring-rose-500/50 rounded",
                    !value ? "text-amber-400 italic" : "text-rose-500"
                )}
            >
                <span className="truncate">{selectedName}</span>
            </button>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed bg-zinc-900/95 backdrop-blur-2xl border-2 border-white/10 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[999999] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
                    style={{
                        top: `${coords.top + 6}px`,
                        left: `${coords.left}px`,
                        minWidth: `${Math.max(coords.width, 160)}px`
                    }}
                >
                    <div className="p-2 border-b border-white/5 bg-white/5">
                        <input
                            autoFocus
                            className="w-full bg-transparent text-[11px] text-white outline-none px-1"
                            placeholder="ابحث..."
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setSelectedIndex(0);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setSelectedIndex(prev => (prev + 1) % totalItems);
                                } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems);
                                } else if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (selectedIndex < filtered.length) {
                                        onChange(filtered[selectedIndex].id, filtered[selectedIndex].name);
                                        setIsOpen(false);
                                    } else if (canQuickCreate) {
                                        onQuickCreate!(query.trim());
                                        setIsOpen(false);
                                    }
                                } else if (e.key === "Escape") {
                                    setIsOpen(false);
                                }
                            }}
                        />
                    </div>

                    <div className="max-h-52 overflow-y-auto py-1">
                        {filtered.map((opt, idx) => (
                            <div
                                key={opt.id}
                                className={clsx(
                                    "group/item w-full flex items-center justify-between px-4 py-2 text-xs font-black transition-all border-b border-white/5 last:border-0",
                                    selectedIndex === idx
                                        ? "bg-rose-500 text-black shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                                        : opt.id === value
                                            ? "bg-rose-500/20 text-rose-500"
                                            : "text-zinc-400 hover:bg-rose-500/10 hover:text-rose-500"
                                )}
                                onMouseEnter={() => setSelectedIndex(idx)}
                            >
                                <button
                                    type="button"
                                    className="flex-1 text-right h-full outline-none"
                                    onClick={() => { onChange(opt.id, opt.name); setIsOpen(false); }}
                                >
                                    {opt.name}
                                </button>

                                {onEdit && onDelete && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                        <button 
                                            className="p-1 hover:bg-black/10 rounded transition-colors"
                                            onClick={(e) => { e.stopPropagation(); onEdit(opt.id, opt.name); }}
                                        >
                                            <Pencil className="w-3 h-3 opacity-50 hover:opacity-100" />
                                        </button>
                                        <button 
                                            className="p-1 hover:bg-black/10 rounded transition-colors"
                                            onClick={(e) => { e.stopPropagation(); onDelete(opt.id); }}
                                        >
                                            <Trash2 className="w-3 h-3 opacity-50 hover:text-rose-500 hover:opacity-100" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}

                        {canQuickCreate && (
                            <button
                                type="button"
                                onMouseEnter={() => setSelectedIndex(filtered.length)}
                                onClick={() => { onQuickCreate!(query.trim()); setIsOpen(false); }}
                                className={clsx(
                                    "w-full flex items-center gap-2 px-4 py-3 transition-colors text-start group border-t border-white/5",
                                    selectedIndex === filtered.length ? "bg-rose-500/20" : "hover:bg-rose-500/10"
                                )}
                            >
                                <span className={clsx(
                                    "flex-shrink-0 p-1 rounded-md transition-colors",
                                    selectedIndex === filtered.length ? "bg-rose-500 text-black" : "bg-rose-500/10 text-rose-500 group-hover:bg-rose-500/20"
                                )}>
                                    <Plus className="w-3 h-3" />
                                </span>
                                <div>
                                    <div className={clsx(
                                        "text-[10px] font-black",
                                        selectedIndex === filtered.length ? "text-white" : "text-rose-500"
                                    )}>إضافة صفة جديدة</div>
                                    <div className="text-[9px] text-zinc-500 truncate max-w-[10rem]">"{query.trim()}"</div>
                                </div>
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

// ─── Cell Input — shared styled input ────────────────────────────────────────

const CellInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className, ...props }, ref) => {
        return (
            <input
                ref={ref}
                className={clsx(
                    "w-full bg-transparent px-2 py-2 text-xs outline-none transition-all placeholder:text-muted-foreground/30",
                    "focus:bg-cyan-500/5 focus:ring-1 focus:ring-cyan-500/50",
                    className
                )}
                {...props}
            />
        );
    }
);
CellInput.displayName = "CellInput";

// ─── Autocomplete Dropdown with Quick-Create ──────────────────────────────────

interface NameDropdownProps {
    query: string;
    products: ProductOption[];
    searchBy: "sku" | "name";
    onSelectExisting: (product: ProductOption) => void;
    onQuickCreate: (name: string) => void;
    triggerElement: HTMLElement | null;
    onClose: () => void;
}

function ItemDropdown({ query, products, searchBy, onSelectExisting, onQuickCreate, triggerElement, onClose }: NameDropdownProps) {
    const [mounted, setMounted] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
        if (triggerElement) {
            const rect = triggerElement.getBoundingClientRect();
            setCoords({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width
            });
        }
        
        const handleClickOutside = (e: MouseEvent) => {
            // If the event is captured and is not inside our dropdown or trigger, close it.
            if (dropdownRef.current?.contains(e.target as Node)) return;
            if (triggerElement?.contains(e.target as Node)) return;

            onClose();
        };

        // Use capture phase to ensure we catch the event before any stopPropagation()
        window.addEventListener("mousedown", handleClickOutside, { capture: true });
        return () => window.removeEventListener("mousedown", handleClickOutside, { capture: true });
    }, [triggerElement, onClose, query]); 

    if (!query || query.length < 1 || !mounted) return null;

    const matches = products
        .slice(0, 100) // Performance filter first
        .filter((p) => {
            const q = query.toLowerCase();
            return (
                p.name.toLowerCase().includes(q) || 
                p.sku.toLowerCase().includes(q)
            );
        })
        .slice(0, 18);

    const exactMatch = products.some((p) =>
        p.name.toLowerCase() === query.toLowerCase() ||
        p.sku.toLowerCase() === query.toLowerCase()
    );

    const showCreate = !exactMatch && searchBy === "name" && query.trim().length >= 2;

    if (matches.length === 0 && !showCreate) return null;

    return createPortal(
        <div 
            ref={dropdownRef}
            className="fixed bg-popover border-2 border-cyan-500/20 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[999999] overflow-hidden max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200"
            style={{ 
                top: `${coords.top + 6}px`, 
                left: `${coords.left}px`, 
                minWidth: `${coords.width}px`,
                maxWidth: '24rem'
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {matches.map((p) => (
                <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSelectExisting(p); }}
                    className="w-full flex justify-between items-center px-3 py-2 hover:bg-muted font-cairo transition-colors text-sm text-start gap-4 border-b border-white/5 last:border-0"
                >
                    <div className="min-w-0">
                        <div className="font-black text-foreground truncate text-xs">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{p.sku}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                        <div className={clsx("text-xs font-bold font-mono", p.stock > 0 ? "text-cyan-500" : "text-rose-500")}>{p.stock}</div>
                        <div className="text-[9px] text-muted-foreground uppercase">مخزون</div>
                    </div>
                </button>
            ))}

            {showCreate && (
                <>
                    {matches.length > 0 && <div className="h-px bg-border/50 mx-2" />}
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onQuickCreate(query.trim()); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-emerald-500/10 transition-colors text-start group"
                    >
                        <span className="flex-shrink-0 p-1 bg-emerald-500/10 text-emerald-500 rounded-md group-hover:bg-emerald-500/20">
                            <Sparkles className="w-3 h-3" />
                        </span>
                        <div>
                            <div className="text-xs font-black text-emerald-500">إضافة صنف جديد</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[14rem]">"{query.trim()}"</div>
                        </div>
                    </button>
                </>
            )}
        </div>,
        document.body
    );
}

// ─── Unit Selection Dropdown (Premium) ───────────────────────────────────

interface UnitDropdownProps {
    value: string;
    options: UnitOption[];
    onChange: (name: string, id?: string, factor?: number) => void;
    onEdit?: (id: string, current: UnitOption) => void;
    onDelete?: (id: string) => void;
    triggerRef?: (el: HTMLElement | null) => void; 
    onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
    onFocus?: () => void;
    onQuickCreate?: (name: string) => void;
}

function UnitDropdown({ value, options = [], onChange, onEdit, onDelete, triggerRef, onKeyDown, onFocus, onQuickCreate }: UnitDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
    const localRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()));
    const canQuickCreate = query.trim().length > 0 && !options.some(o => o.name.toLowerCase() === query.toLowerCase().trim()) && !!onQuickCreate;
    const totalItems = filtered.length + (canQuickCreate ? 1 : 0);

    const openMenu = (initialQuery: string = "") => {
        const el = localRef.current;
        if (el) {
            const rect = el.getBoundingClientRect();
            setCoords({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width
            });
            setQuery(initialQuery);
            setSelectedIndex(0);
            setIsOpen(true);
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current?.contains(e.target as Node)) return;
            if (localRef.current?.contains(e.target as Node)) return;
            setIsOpen(false);
        };

        window.addEventListener("mousedown", handleClickOutside, { capture: true });
        return () => window.removeEventListener("mousedown", handleClickOutside, { capture: true });
    }, [isOpen]);

    const selectedName = value || "-- اختر --";

    return (
        <div className="w-full relative h-full flex items-center" onFocus={onFocus}>
            <button
                type="button"
                ref={(el) => {
                    (localRef as any).current = el;
                    if (triggerRef) triggerRef(el);
                }}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openMenu();
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        openMenu();
                    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        openMenu(e.key);
                    } else if (onKeyDown) {
                        onKeyDown(e);
                    }
                }}
                className={clsx(
                    "w-full h-full text-start px-2 py-1.5 text-[11px] outline-none transition-all cursor-pointer font-bold flex items-center justify-between group/unit",
                    "focus:bg-blue-500/10 focus:ring-1 focus:ring-blue-500/50 rounded",
                    !value ? "text-amber-400 italic" : "text-blue-500"
                )}
            >
                <span className="truncate">{selectedName}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground opacity-30 group-hover/unit:opacity-100 transition-opacity" />
            </button>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed bg-zinc-900/95 backdrop-blur-2xl border-2 border-white/10 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[999999] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
                    style={{
                        top: `${coords.top + 6}px`,
                        left: `${coords.left}px`,
                        minWidth: `${Math.max(coords.width, 140)}px`
                    }}
                >
                    {/* Inline Search */}
                    <div className="p-2 border-b border-white/5 bg-white/5">
                        <input 
                            autoFocus
                            className="w-full bg-transparent text-[11px] text-white outline-none px-1"
                            placeholder="ابحث..."
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setSelectedIndex(0);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setSelectedIndex(prev => (prev + 1) % totalItems);
                                } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems);
                                } else if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (selectedIndex < filtered.length) {
                                        const opt = filtered[selectedIndex];
                                        onChange(opt.name, opt.id, opt.conversionFactor);
                                        setIsOpen(false);
                                    } else if (canQuickCreate) {
                                        onQuickCreate!(query.trim());
                                        setIsOpen(false);
                                    }
                                } else if (e.key === "Escape") {
                                    setIsOpen(false);
                                }
                            }}
                        />
                    </div>

                    <div className="max-h-52 overflow-y-auto py-1">
                        {filtered.map((opt, idx) => (
                            <div
                                key={opt.id}
                                className={clsx(
                                    "group/item w-full flex items-center justify-between px-4 py-2 text-xs font-black transition-all border-b border-white/5 last:border-0",
                                    selectedIndex === idx
                                        ? "bg-blue-500 text-black shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                                        : opt.name === value 
                                            ? "bg-blue-500/20 text-blue-500"
                                            : "text-zinc-400 hover:bg-blue-500/10 hover:text-blue-500"
                                )}
                                onMouseEnter={() => setSelectedIndex(idx)}
                            >
                                <button
                                    type="button"
                                    className="flex-1 text-right h-full outline-none"
                                    onClick={() => { onChange(opt.name, opt.id, opt.conversionFactor); setIsOpen(false); }}
                                >
                                    {opt.name}
                                </button>

                                {onEdit && onDelete && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                        <button 
                                            className="p-1 hover:bg-black/10 rounded transition-colors"
                                            onClick={(e) => { e.stopPropagation(); onEdit(opt.id, opt); }}
                                        >
                                            <Pencil className="w-3 h-3 opacity-50 hover:opacity-100" />
                                        </button>
                                        <button 
                                            className="p-1 hover:bg-black/10 rounded transition-colors"
                                            onClick={(e) => { e.stopPropagation(); onDelete(opt.id); }}
                                        >
                                            <Trash2 className="w-3 h-3 opacity-50 hover:text-rose-500 hover:opacity-100" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}

                        {canQuickCreate && (
                            <button
                                type="button"
                                onMouseEnter={() => setSelectedIndex(filtered.length)}
                                onClick={() => { onQuickCreate!(query.trim()); setIsOpen(false); }}
                                className={clsx(
                                    "w-full flex items-center gap-2 px-4 py-3 transition-colors text-start group border-t border-white/5",
                                    selectedIndex === filtered.length ? "bg-blue-500/20" : "hover:bg-blue-500/10"
                                )}
                            >
                                <span className={clsx(
                                    "flex-shrink-0 p-1 rounded-md transition-colors",
                                    selectedIndex === filtered.length ? "bg-blue-500 text-black" : "bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20"
                                )}>
                                    <Plus className="w-3 h-3" />
                                </span>
                                <div>
                                    <div className={clsx(
                                        "text-[10px] font-black",
                                        selectedIndex === filtered.length ? "text-white" : "text-blue-500"
                                    )}>إضافة وحدة جديدة</div>
                                    <div className="text-[9px] text-zinc-500 truncate max-w-[10rem]">"{query.trim()}"</div>
                                </div>
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

// ─── Main Grid ────────────────────────────────────────────────────────────────

export function PurchaseDataGrid({
    products,
    categories,
    models,
    units,
    rows,
    onRowsChange,
    currencySymbol = "IQD",
    onQuickCreateCategory,
    onQuickCreateModel,
    onQuickCreateAttribute,
    onQuickCreateUnit,
    attributes,
    csrfToken
}: PurchaseDataGridProps) {
    const router = useRouter();
    const t = useTranslations("Inventory.Purchasing");
    const [focusCell, setFocusCell] = useState<[number, EditableCol] | null>(null);
    const [autocompleteKey, setAutocompleteKey] = useState<{ rowIdx: number; col: "itemCode" | "itemName" } | null>(null);
    const [skuLoadingRow, setSkuLoadingRow] = useState<number | null>(null);
    const [columnWidths, setColumnWidths] = useState<number[]>(DEFAULT_WIDTHS);
    const [resizingIdx, setResizingIdx] = useState<number | null>(null);
    const [isAutoFitting, setIsAutoFitting] = useState(false);

    // ── Load/Save Persistence ───────────────────────────────────────────────
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length === DEFAULT_WIDTHS.length) {
                    setColumnWidths(parsed);
                }
            } catch (e) {
                console.error("Failed to parse saved grid widths", e);
            }
        }
    }, []);

    const saveWidths = useCallback((widths: number[]) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
    }, []);

    // ── Column Resizing Logic ───────────────────────────────────────────────
    const handleResizeStart = (e: React.MouseEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();
        setResizingIdx(index);
    };

    useEffect(() => {
        if (resizingIdx === null) return;

        const handleMouseMove = (e: MouseEvent) => {
            setColumnWidths(prev => {
                const newWidths = [...prev];
                const delta = e.movementX;
                // Add for LTR, Subtract for RTL? 
                // The app is RTL (Arabic). Dragging right usually means SHRINKING the column to the left.
                // Wait, movementX is positive when moving mouse right.
                // In RTL, the "right" boundary of a cell is actually the visually left side of the next cell.
                // Let's assume standard behavior for now and adjust.
                const isRTL = document.dir === 'rtl' || document.documentElement.dir === 'rtl';
                const actualDelta = isRTL ? -delta : delta;

                newWidths[resizingIdx] = Math.max(20, newWidths[resizingIdx] + actualDelta);
                return newWidths;
            });
        };

        const handleMouseUp = () => {
            setResizingIdx(null);
            saveWidths(columnWidths);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizingIdx, columnWidths, saveWidths]);

    const autoFitColumn = (index: number) => {
        setIsAutoFitting(true);
        // Col mapping to row properties
        const colMap: Record<number, keyof GridRow> = {
            1: "itemCode",
            2: "categoryId",
            3: "modelId",
            4: "attributeId",
            5: "itemName",
            6: "unit",
            7: "conversionFactor",
            8: "quantity",
            9: "unitPrice",
            10: "sellPrice",
            11: "sellPrice2",
            12: "sellPrice3",
            13: "subTotal"
        };

        const headerLabels = ["#", "الكود", "اسم الصنف", "الفئة", "الوحدة", "الكمية", "التكلفة", "الإجمالي", "Action"];
        const headerWidth = getTextWidth(headerLabels[index]) + 24; // text + padding

        let maxContentWidth = headerWidth;

        rows.forEach(row => {
            let text = "";
            const prop = colMap[index];
            if (prop) {
                if (prop === "categoryId") {
                    text = categories.find(c => c.id === row.categoryId)?.name || "";
                } else {
                    text = String(row[prop] || "");
                }
            }
            const w = getTextWidth(text) + 20; // text + padding
            if (w > maxContentWidth) maxContentWidth = w;
        });

        const newWidths = [...columnWidths];
        newWidths[index] = Math.ceil(maxContentWidth);
        setColumnWidths(newWidths);
        saveWidths(newWidths);
        setIsAutoFitting(false);
    };

    // inputRefs[rowIdx][col] — includes inputs and div containers for positioning
    const inputRefs = useRef<Record<number, Partial<Record<EditableCol | "itemCodeContainer" | "itemNameContainer", HTMLInputElement | HTMLSelectElement | HTMLDivElement | null>>>>({});

    const getInputRef = useCallback(
        (rowIdx: number, col: EditableCol) => (el: HTMLInputElement | HTMLSelectElement | null) => {
            if (!inputRefs.current[rowIdx]) inputRefs.current[rowIdx] = {};
            inputRefs.current[rowIdx][col] = el;
        },
        []
    );

    const focusInput = useCallback((rowIdx: number, col: EditableCol) => {
        const el = inputRefs.current[rowIdx]?.[col];
        if (el) {
            el.focus();
            if ((el as HTMLInputElement).select) (el as HTMLInputElement).select();
        }
        setFocusCell([rowIdx, col]);
    }, []);

    // ── Row update ───────────────────────────────────────────────────────────

    const updateRow = useCallback(
        (rowIdx: number, updates: Partial<GridRow>) => {
            onRowsChange(
                rows.map((r, i) => {
                    if (i !== rowIdx) return r;
                    let merged = { ...r, ...updates };

                    // Centralized Naming Logic for New Products
                    if (merged.isNew) {
                         const hasHierarchyChange = 
                            updates.hasOwnProperty('categoryId') || 
                            updates.hasOwnProperty('modelId') || 
                            updates.hasOwnProperty('attributeId');

                        if (hasHierarchyChange) {
                            const catName = categories.find(c => c.id === merged.categoryId)?.name || "";
                            const modName = models.find(m => m.id === merged.modelId)?.name || "";
                            const attrName = attributes.find(a => a.id === merged.attributeId)?.name || "";
                            
                            // Use " - " separator for cleaner hierarchical naming
                            merged.itemName = [catName, modName, attrName]
                                .filter(Boolean)
                                .join(" - ")
                                .trim();
                        }
                    }

                    merged.subTotal = computeSubTotal(merged.quantity, merged.unitPrice);
                    return merged;
                })
            );
        },
        [rows, onRowsChange, categories, models, attributes]
    );

    // ── Select existing product from autocomplete ────────────────────────────

    const handleProductSelect = useCallback(
        (rowIdx: number, product: ProductOption) => {
            onRowsChange(
                rows.map((r, i) => {
                    if (i !== rowIdx) return r;
                    return {
                        ...r,
                        productId: product.id,
                        itemCode: product.sku,
                        itemName: product.name,
                        unit: "قطعة",
                        unitPrice: product.costPrice,
                        subTotal: computeSubTotal(r.quantity, product.costPrice),
                        sellPrice: product.sellPrice,
                        sellPrice2: product.sellPrice2,
                        sellPrice3: product.sellPrice3,
                        isNew: false,
                        categoryId: (product as any).categoryId || r.categoryId,
                        modelId: (product as any).modelId || r.modelId,
                        attributeId: (product as any).attributeId || r.attributeId,
                    };
                })
            );
            setAutocompleteKey(null);
            setTimeout(() => focusInput(rowIdx, "quantity"), 0);
        },
        [rows, onRowsChange, focusInput]
    );

    // ── Keyboard navigation ──────────────────────────────────────────────────

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>, rowIdx: number, col: EditableCol) => {
            if (e.key === "Escape") { setAutocompleteKey(null); return; }

            const row = rows[rowIdx];

            if (e.key === "Tab") {
                e.preventDefault();
                const next = nextEditableCol(col, row?.isNew ?? false);
                if (next) {
                    focusInput(rowIdx, next);
                } else {
                    const targetRowIdx = rowIdx + 1;
                    if (targetRowIdx >= rows.length) {
                        const newRow = createEmptyRow();
                        onRowsChange([...rows, newRow]);
                        setTimeout(() => focusInput(targetRowIdx, "itemCode"), 0);
                    } else {
                        focusInput(targetRowIdx, "itemCode");
                    }
                }
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();

                // Advanced scanner support: auto-select if there are matches in code/name fields
                if (col === "itemCode" || col === "itemName") {
                    const query = col === "itemCode" ? row.itemCode : row.itemName;
                    if (query.trim().length > 0) {
                        const q = query.toLowerCase();
                        const matches = products.filter(p => 
                            p.name.toLowerCase().includes(q) || 
                            p.sku.toLowerCase().includes(q)
                        );
                        if (matches.length > 0) {
                            handleProductSelect(rowIdx, matches[0]);
                            return;
                        }
                    }
                }

                const next = nextEditableCol(col, row?.isNew ?? false);
                if (!next) {
                    // Validation: Sell price must not be less than cost price
                    if (row.unitPrice > 0 && (
                        ((row.sellPrice || 0) > 0 && (row.sellPrice || 0) < row.unitPrice) ||
                        ((row.sellPrice2 || 0) > 0 && (row.sellPrice2 || 0) < row.unitPrice) ||
                        ((row.sellPrice3 || 0) > 0 && (row.sellPrice3 || 0) < row.unitPrice)
                    )) {
                        toast.error("تنبيه: سعر البيع أقل من سعر التكلفة! يرجى مراجعة الأسعار قبل إضافة سطر جديد.");
                        focusInput(rowIdx, "sellPrice");
                        return;
                    }

                    const newRow = createEmptyRow();
                    onRowsChange([...rows, newRow]);
                    setTimeout(() => focusInput(rows.length, "itemCode"), 0);
                } else {
                    focusInput(rowIdx, next);
                }
                return;
            }

            // Global '+' shortcut
            if (e.key === "+") {
                // Ignore if in numeric fields
                const numericCols: EditableCol[] = ["quantity", "unitPrice", "sellPrice", "sellPrice2", "sellPrice3", "conversionFactor"];
                if (numericCols.includes(col)) return;

                e.preventDefault();
                e.stopPropagation();

                if (col === "categoryId" && onQuickCreateCategory) {
                    onQuickCreateCategory("", (id) => updateRow(rowIdx, { categoryId: id }));
                } else if (col === "modelId" && onQuickCreateModel && row.categoryId) {
                    onQuickCreateModel("", row.categoryId, (id) => updateRow(rowIdx, { modelId: id }));
                } else if (col === "attributeId" && onQuickCreateAttribute) {
                    onQuickCreateAttribute("", (id) => updateRow(rowIdx, { attributeId: id }));
                } else if (col === "unit" && onQuickCreateUnit) {
                    onQuickCreateUnit("", (id, name) => updateRow(rowIdx, { unit: name, unitOfMeasureId: id, conversionFactor: 1 }));
                } else if (col === "itemName") {
                    handleQuickCreate(rowIdx, "");
                } else if (col === "itemCode") {
                    // Start new row or similar? Let's just trigger item creation
                    handleQuickCreate(rowIdx, "");
                }
                return;
            }

            if (e.key === "Delete") {
                const activeEl = document.activeElement as HTMLInputElement;
                if (activeEl && activeEl.tagName === 'INPUT' && activeEl.value.length > 0) return;

                if (rows.length > 1) {
                    e.preventDefault();
                    const newRows = rows.filter((_, i) => i !== rowIdx);
                    onRowsChange(newRows);
                    const targetIdx = Math.max(0, rowIdx - 1);
                    setTimeout(() => focusInput(targetIdx, col), 0);
                }
                return;
            }

            if (e.key === "ArrowDown") { e.preventDefault(); if (rowIdx + 1 < rows.length) focusInput(rowIdx + 1, col); return; }
            if (e.key === "ArrowUp")   { e.preventDefault(); if (rowIdx - 1 >= 0)           focusInput(rowIdx - 1, col); return; }

            // RTL-aware horizontal navigation
            if (e.key === "ArrowLeft") {
                const next = nextEditableCol(col, row?.isNew ?? false);
                if (next) { e.preventDefault(); focusInput(rowIdx, next); }
                else if (rowIdx + 1 < rows.length) { e.preventDefault(); focusInput(rowIdx + 1, "itemCode"); }
                return;
            }
            if (e.key === "ArrowRight") {
                const prev = prevEditableCol(col, row?.isNew ?? false);
                if (prev) { e.preventDefault(); focusInput(rowIdx, prev); }
                else if (rowIdx - 1 >= 0) { 
                    e.preventDefault(); 
                    // Go to last editable col of previous row
                    const lastCol = ALL_EDITABLE_COLS[ALL_EDITABLE_COLS.length - 1];
                    focusInput(rowIdx - 1, lastCol);
                }
                return;
            }
        },
        [rows, onRowsChange, focusInput, products, handleProductSelect]
    );

    // ── Quick-Create: new product on the fly ─────────────────────────────────

    const handleAutoSku = useCallback(
        async (rowIdx: number, initialUpdates?: Partial<GridRow>) => {
            const row = rows[rowIdx];
            
            // If we have initialUpdates (like category change), we must apply them immediately
            // But we also want to avoid redundant SKU generation if one exists.
            
            setSkuLoadingRow(rowIdx);
            const existingSKUs = rows.filter(r => r.itemCode).map(r => r.itemCode);
            const res = await generateNextSku({ existingSKUs });
            const autoSku = (res as any)?.sku ?? "";
            setSkuLoadingRow(null);
            
            updateRow(rowIdx, { ...initialUpdates, itemCode: autoSku });
            return autoSku;
        },
        [rows, updateRow]
    );

    // ── Quick-Create: new product on the fly ─────────────────────────────────

    const handleQuickCreate = useCallback(
        async (rowIdx: number, typedName: string) => {
            setAutocompleteKey(null);
            const autoSku = await handleAutoSku(rowIdx);

            onRowsChange(
                rows.map((r, i) => {
                    if (i !== rowIdx) return r;
                    return {
                        ...r,
                        productId: undefined,
                        itemCode: autoSku,
                        itemName: typedName,
                        isNew: true,
                        categoryId: "",
                        sellPrice: r.unitPrice, // sensible default
                    };
                })
            );

            // Focus the category cell immediately
            setTimeout(() => focusInput(rowIdx, "categoryId"), 0);
        },
        [rows, onRowsChange, focusInput]
    );

    const removeRow = useCallback(
        (rowIdx: number) => {
            const newRows = rows.filter((_, i) => i !== rowIdx);
            onRowsChange(newRows.length === 0 ? [createEmptyRow()] : newRows);
        },
        [rows, onRowsChange]
    );

    useEffect(() => {
        if (rows.length === 0) onRowsChange([createEmptyRow()]);
    }, [rows, onRowsChange]);

    // ── Management Handlers (CRUD) ───────────────────────────────────────────

    const handleEditCategory = async (id: string, currentName: string) => {
        const newName = window.prompt("تعديل اسم الفئة:", currentName);
        if (newName && newName.trim() !== currentName) {
            const res = await updateCategory({ id, name: newName.trim(), isHidden: false, csrfToken });
            if (res.success) {
                toast.success("تم التعديل بنجاح");
                router.refresh();
            } else {
                toast.error("فشل التعديل");
            }
        }
    };

    const handleDeleteCategory = async (id: string) => {
        if (window.confirm("هل أنت متأكد من حذف هذه الفئة؟")) {
            const res = await deleteCategory({ id, csrfToken });
            if (res.success) {
                toast.success("تم الحذف بنجاح");
                router.refresh();
            } else {
                toast.error(res.error || "لا يمكن الحذف - الفئة مرتبطة بمنتجات.");
            }
        }
    };

    const handleEditModel = async (id: string, currentName: string) => {
        const newName = window.prompt("تعديل اسم الموديل:", currentName);
        if (newName && newName.trim() !== currentName) {
            // Finding the model to get its current categoryId
            const model = models.find(m => m.id === id);
            if (!model) return;
            const res = await updateModel({ id, name: newName.trim(), categoryId: model.categoryId, csrfToken });
            if (res.success) {
                toast.success("تم التعديل بنجاح");
                router.refresh();
            }
        }
    };

    const handleDeleteModel = async (id: string) => {
        if (window.confirm("هل أنت متأكد من حذف هذا الموديل؟")) {
            const res = await deleteModel({ id, csrfToken });
            if (res.success) {
                toast.success("تم الحذف بنجاح");
                router.refresh();
            } else {
                toast.error(res.error || "خطأ أثناء الحذف");
            }
        }
    };

    const handleEditAttribute = async (id: string, currentName: string) => {
        const newName = window.prompt("تعديل الوصف:", currentName);
        if (newName && newName.trim() !== currentName) {
            const res = await updateAttribute({ id, name: newName.trim(), csrfToken });
            if (res.success) {
                toast.success("تم التعديل بنجاح");
                router.refresh();
            }
        }
    };

    const handleDeleteAttribute = async (id: string) => {
        if (window.confirm("تحذير: هل أنت متأكد من حذف هذا الوصف؟")) {
            const res = await deleteAttribute({ id, csrfToken });
            if (res.success) {
                toast.success("تم الحذف بنجاح");
                router.refresh();
            } else {
                toast.error(res.error || "لا يمكن الحذف");
            }
        }
    };

    const handleEditUnit = async (id: string, current: UnitOption) => {
        const newName = window.prompt("تعديل اسم الوحدة:", current.name);
        if (newName && newName.trim()) {
            const res = await updateUnitOfMeasure({ 
                id, 
                name: newName.trim(), 
                abbreviation: current.name.slice(0, 2),
                code: current.name.toUpperCase(),
                conversionFactor: current.conversionFactor || 1,
                isActive: true,
                csrfToken
            });
            if (res.success) {
                toast.success("تم التعديل");
                router.refresh();
            }
        }
    };

    const handleDeleteUnit = async (id: string) => {
        if (window.confirm("حذف الوحدة؟")) {
            const res = await deleteUnitOfMeasure({ id, csrfToken });
            if (res.success) {
                toast.success("تم الحذف");
                router.refresh();
            } else {
                toast.error(res.error || "خطأ");
            }
        }
    };

    // ─────────────────────────────────────────────────────────────────────────

    const gridTemplate = columnWidths.map(w => `${w}px`).join(' ');

    return (
        <div 
            className="w-full bg-white dark:bg-zinc-900/50 text-[11px] sm:text-xs overflow-hidden border border-slate-200 dark:border-white/10 rounded-[2.5rem] shadow-sm font-cairo shadow-inner"
            style={{ 
                flex: '1 1 0%', 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0,
                userSelect: resizingIdx !== null ? 'none' : 'auto'
            }}
        >
            {/* ── Header (Sticky) ───────────────────────────────────────────── */}
            <div 
                className={clsx("grid bg-zinc-50 dark:bg-zinc-900/50 border-b border-slate-200 dark:border-white/10 sticky top-0 z-20 shrink-0 w-full")}
                style={{ gridTemplateColumns: gridTemplate }}
            >
                {[
                    "#", "الكود", "الفئة", "الموديل", "الوصف (الصفة)", "اسم المنتج النهائي", "الوحدة", "العبوة", "الكمية", "التكلفة", "سعر 1", "سعر 2", "سعر 3", "الإجمالي", ""
                ].map((label, i) => (
                    <div 
                        key={i} 
                        className={clsx(HEADER_CELL_CLS, i === 0 && "text-center px-1")}
                        onDoubleClick={() => i > 0 && i < 8 && autoFitColumn(i)}
                    >
                        {label}
                        {i < 8 && (
                            <div 
                                className={clsx(
                                    "absolute top-0 bottom-0 w-1 cursor-col-resize z-30 transition-colors hover:bg-cyan-500",
                                    resizingIdx === i ? "bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" : "bg-transparent group-hover/h:bg-slate-300 dark:group-hover/h:bg-white/10",
                                    "end-0"
                                )}
                                onMouseDown={(e) => handleResizeStart(e, i)}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* ── Body ── */}
            <div className="flex-1 divide-y divide-slate-200 dark:divide-white/10 min-h-0 overflow-auto custom-scrollbar w-full">
                {rows.map((row, rowIdx) => {
                    const isRowFocused = focusCell?.[0] === rowIdx;
                    const showCodeAC = autocompleteKey?.rowIdx === rowIdx && autocompleteKey?.col === "itemCode";
                    const showNameAC = autocompleteKey?.rowIdx === rowIdx && autocompleteKey?.col === "itemName";
                    const isSKULoading = skuLoadingRow === rowIdx;

                    return (
                        <div
                            key={row.id}
                            className={clsx(
                                "grid w-full items-stretch transition-colors group/row border-b border-slate-200 dark:border-white/10 hover:z-10",
                                isRowFocused
                                    ? "bg-cyan-500/[0.08]"
                                    : rowIdx % 2 === 1
                                        ? "bg-slate-100/50 dark:bg-white/5 hover:bg-slate-200/50 dark:hover:bg-white/10"
                                        : "bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                            )}
                            style={{ gridTemplateColumns: gridTemplate }}
                        >
                            {/* ── # index ─────────────────────────────────── */}
                            <div className={clsx(CELL_CLS, "flex items-center justify-center px-1 py-1.5 select-none")}>
                                <span className="text-[10px] font-mono text-muted-foreground/50">{rowIdx + 1}</span>
                            </div>

                            {/* ── Item Code ───────────────────────────────── */}
                            <div 
                                className={clsx(CELL_CLS, "relative flex items-center")}
                                ref={(el) => {
                                    if (!inputRefs.current[rowIdx]) inputRefs.current[rowIdx] = {};
                                    inputRefs.current[rowIdx]["itemCodeContainer"] = el;
                                }}
                            >
                                {isSKULoading && (
                                    <span className="absolute start-2 top-1/2 -translate-y-1/2 z-10">
                                        <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                                    </span>
                                )}
                                <CellInput
                                    ref={getInputRef(rowIdx, "itemCode") as (el: HTMLInputElement | null) => void}
                                    type="text"
                                    value={row.itemCode}
                                    placeholder={isSKULoading ? "" : "باركود..."}
                                    className={clsx(
                                        "font-mono",
                                        row.isNew && "text-emerald-500",
                                        isSKULoading && "opacity-0"
                                    )}
                                    readOnly={isSKULoading}
                                    onChange={(e) => {
                                        updateRow(rowIdx, { itemCode: e.target.value, productId: undefined, isNew: true });
                                        setAutocompleteKey({ rowIdx, col: "itemCode" });
                                    }}
                                    onFocus={() => setFocusCell([rowIdx, "itemCode"])}
                                    onBlur={() => setTimeout(() => setAutocompleteKey(null), 200)}
                                    onKeyDown={(e) => handleKeyDown(e, rowIdx, "itemCode")}
                                />
                                {showCodeAC && (
                                    <ItemDropdown
                                        query={row.itemCode}
                                        products={products}
                                        searchBy="sku"
                                        onSelectExisting={(p) => handleProductSelect(rowIdx, p)}
                                        onQuickCreate={() => {}}
                                        triggerElement={inputRefs.current[rowIdx]?.["itemCodeContainer"] as HTMLElement | null}
                                        onClose={() => setAutocompleteKey(null)}
                                    />
                                )}
                            </div>

                             {/* ── Category ────────────────────────────────── */}
                             <div className={clsx(CELL_CLS, "relative flex items-center")}>
                                 <CategoryDropdown
                                     triggerRef={getInputRef(rowIdx, "categoryId") as any}
                                     value={row.categoryId}
                                     options={categories}
                                     onEdit={handleEditCategory}
                                     onDelete={handleDeleteCategory}
                                     onChange={async (val) => {
                                         if (row.isNew && !row.itemCode) {
                                             await handleAutoSku(rowIdx, { categoryId: val, modelId: "", attributeId: "" });
                                         } else {
                                             updateRow(rowIdx, { categoryId: val, modelId: "", attributeId: "" });
                                         }
                                         setTimeout(() => focusInput(rowIdx, "modelId"), 50);
                                     }}
                                     onQuickCreate={(name) => {
                                         if (onQuickCreateCategory) {
                                             onQuickCreateCategory(name, (newId) => {
                                                 updateRow(rowIdx, { categoryId: newId });
                                                 setTimeout(() => focusInput(rowIdx, "modelId"), 50);
                                             });
                                         }
                                     }}
                                     onFocus={() => setFocusCell([rowIdx, "categoryId"])}
                                     onKeyDown={(e) => handleKeyDown(e, rowIdx, "categoryId")}
                                 />
                             </div>

                             {/* ── Model ───────────────────────────────────── */}
                             <div className={clsx(CELL_CLS, "relative flex items-center")}>
                                 <ModelDropdown
                                     triggerRef={getInputRef(rowIdx, "modelId") as any}
                                     value={row.modelId}
                                     categoryId={row.categoryId}
                                     options={models}
                                     categories={categories}
                                     onEdit={handleEditModel}
                                     onDelete={handleDeleteModel}
                                     onChange={(val) => {
                                         updateRow(rowIdx, { modelId: val, attributeId: "" });
                                         setTimeout(() => focusInput(rowIdx, "attributeId"), 50);
                                     }}
                                     onQuickCreate={(name) => {
                                         if (onQuickCreateModel) {
                                             onQuickCreateModel(name, row.categoryId, (newId) => {
                                                 updateRow(rowIdx, { modelId: newId });
                                                 setTimeout(() => focusInput(rowIdx, "attributeId"), 50);
                                             });
                                         }
                                     }}
                                     onFocus={() => setFocusCell([rowIdx, "modelId"])}
                                     onKeyDown={(e) => handleKeyDown(e, rowIdx, "modelId")}
                                 />
                             </div>

                             {/* ── Attribute ───────────────────────────────── */}
                             <div className={clsx(CELL_CLS, "relative flex items-center")}>
                                 <AttributeDropdown
                                     triggerRef={getInputRef(rowIdx, "attributeId") as any}
                                     value={row.attributeId}
                                     options={attributes}
                                     onEdit={handleEditAttribute}
                                     onDelete={handleDeleteAttribute}
                                     onChange={(id) => {
                                         updateRow(rowIdx, { attributeId: id });
                                         setTimeout(() => focusInput(rowIdx, "unit"), 50);
                                     }}
                                     onQuickCreate={(name) => {
                                         if (onQuickCreateAttribute) {
                                             onQuickCreateAttribute(name, (newId) => {
                                                 updateRow(rowIdx, { attributeId: newId });
                                                 setTimeout(() => focusInput(rowIdx, "unit"), 50);
                                             });
                                         }
                                     }}
                                     onFocus={() => setFocusCell([rowIdx, "attributeId"])}
                                     onKeyDown={(e) => handleKeyDown(e, rowIdx, "attributeId")}
                                 />
                             </div>

                             {/* ── Item Name (Read-Only when hierarchical) ──────────────── */}
                             <div 
                                 className={clsx(CELL_CLS, "relative flex items-center bg-zinc-500/5")}
                                 ref={(el) => {
                                     if (!inputRefs.current[rowIdx]) inputRefs.current[rowIdx] = {};
                                     inputRefs.current[rowIdx]["itemNameContainer"] = el;
                                 }}
                             >
                                 <CellInput
                                     ref={getInputRef(rowIdx, "itemName") as (el: HTMLInputElement | null) => void}
                                     type="text"
                                     value={row.itemName}
                                     readOnly={row.isNew} // Enforce auto-naming for new items
                                     placeholder={row.isNew ? "الاسم يتولد تلقائياً..." : "ابحث..."}
                                     className={clsx(
                                         "font-black opacity-90",
                                         row.isNew ? "text-emerald-500" : row.itemName ? "text-zinc-900 dark:text-zinc-200" : ""
                                     )}
                                     onChange={(e) => {
                                         if (!row.isNew) {
                                            updateRow(rowIdx, { itemName: e.target.value, productId: undefined, isNew: true });
                                            setAutocompleteKey({ rowIdx, col: "itemName" });
                                         }
                                     }}
                                     onFocus={() => {
                                         setFocusCell([rowIdx, "itemName"]);
                                         if (!row.isNew && row.itemName) setAutocompleteKey({ rowIdx, col: "itemName" });
                                     }}
                                     onBlur={() => setTimeout(() => setAutocompleteKey(null), 200)}
                                     onKeyDown={(e) => handleKeyDown(e, rowIdx, "itemName")}
                                 />
                                 {!row.isNew && showNameAC && (
                                     <ItemDropdown
                                         query={row.itemName}
                                         products={products}
                                         searchBy="name"
                                         onSelectExisting={(p) => handleProductSelect(rowIdx, p)}
                                         onQuickCreate={(name) => handleQuickCreate(rowIdx, name)}
                                         triggerElement={inputRefs.current[rowIdx]?.["itemNameContainer"] as HTMLElement | null}
                                         onClose={() => setAutocompleteKey(null)}
                                     />
                                 )}
                             </div>

                            <div className={clsx(CELL_CLS, "relative flex items-center")}>
                                <UnitDropdown
                                    triggerRef={getInputRef(rowIdx, "unit") as any}
                                    value={row.unit}
                                    options={units}
                                    onChange={(name, id, factor) => { updateRow(rowIdx, { unit: name, unitOfMeasureId: id, conversionFactor: factor || 1 }); setTimeout(() => focusInput(rowIdx, "quantity"), 0); }}
                                    onQuickCreate={(name) => {
                                        if (onQuickCreateUnit) {
                                            onQuickCreateUnit(name, (id, unitName) => {
                                                updateRow(rowIdx, { unit: unitName, unitOfMeasureId: id, conversionFactor: 1 });
                                            });
                                        }
                                    }}
                                    onFocus={() => setFocusCell([rowIdx, "unit"])}
                                    onKeyDown={(e) => handleKeyDown(e, rowIdx, "unit")}
                                />
                            </div>

                            {/* ── Package Factor (العبوة) ───────────────────────── */}
                            <div className={clsx(CELL_CLS, "flex items-center")}>
                                <CellInput
                                    ref={getInputRef(rowIdx, "conversionFactor") as any}
                                    type="number"
                                    min="1"
                                    step="1"
                                    disabled={row.unit === "قطعة"}
                                    value={row.conversionFactor}
                                    className={clsx(
                                        "font-black font-mono text-center",
                                        row.unit === "قطعة" ? "opacity-30 cursor-not-allowed" : "text-blue-500"
                                    )}
                                    onChange={(e) => updateRow(rowIdx, { conversionFactor: parseFloat(e.target.value) || 1 })}
                                    onFocus={(e) => { setFocusCell([rowIdx, "conversionFactor"]); e.target.select(); }}
                                    onKeyDown={(e) => handleKeyDown(e, rowIdx, "conversionFactor")}
                                />
                            </div>

                             {/* ── Quantity ─────────────────────────────────── */}
                             <div className={clsx(CELL_CLS, "flex flex-col items-center justify-center py-0.5")}>
                                 <CellInput
                                     ref={getInputRef(rowIdx, "quantity") as any}
                                     type="number"
                                     min="0"
                                     step="1"
                                     value={row.quantity === 0 && focusCell?.[0] !== rowIdx ? "" : row.quantity}
                                     placeholder="1"
                                     className="font-black font-mono text-center"
                                     onChange={(e) => updateRow(rowIdx, { quantity: parseFloat(e.target.value) || 0 })}
                                     onFocus={(e) => { setFocusCell([rowIdx, "quantity"]); e.target.select(); }}
                                     onKeyDown={(e) => handleKeyDown(e, rowIdx, "quantity")}
                                 />
                                 {row.conversionFactor > 1 && row.quantity > 0 && (
                                     <span className="text-[9px] font-black text-emerald-500 animate-in fade-in slide-in-from-top-1 text-center">
                                         {row.quantity * row.conversionFactor} قطعة
                                     </span>
                                 )}
                             </div>

                            {/* ── Unit Price (Cost) ────────────────────────── */}
                            <div className={clsx(CELL_CLS, "flex items-center gap-0.5 ps-1")}>
                                <CellInput
                                    ref={getInputRef(rowIdx, "unitPrice") as any}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={row.unitPrice === 0 && focusCell?.[0] !== rowIdx ? "" : row.unitPrice}
                                    placeholder="0.00"
                                    className="font-black font-mono text-end"
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        updateRow(rowIdx, { unitPrice: val, sellPrice: row.isNew && (row.sellPrice === 0 || !row.sellPrice) ? val : row.sellPrice });
                                    }}
                                    onFocus={(e) => { setFocusCell([rowIdx, "unitPrice"]); e.target.select(); }}
                                    onKeyDown={(e) => handleKeyDown(e, rowIdx, "unitPrice")}
                                />
                            </div>

                            {/* ── Sell Price 1  ─────────────────────────────── */}
                            <div className={clsx(CELL_CLS, "flex items-center gap-0.5 ps-1")}>
                                <CellInput
                                    ref={getInputRef(rowIdx, "sellPrice") as any}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={row.sellPrice === 0 && focusCell?.[0] !== rowIdx ? "" : row.sellPrice}
                                    placeholder="0.00"
                                    className={clsx(
                                        "font-black font-mono text-end text-violet-500",
                                        (row.sellPrice || 0) > 0 && (row.sellPrice || 0) < row.unitPrice && "bg-rose-500/20 text-rose-600 animate-pulse ring-1 ring-rose-500/50"
                                    )}
                                    onChange={(e) => updateRow(rowIdx, { sellPrice: parseFloat(e.target.value) || 0 })}
                                    onFocus={(e) => { setFocusCell([rowIdx, "sellPrice"]); e.target.select(); }}
                                    onKeyDown={(e) => handleKeyDown(e, rowIdx, "sellPrice")}
                                />
                            </div>

                            {/* ── Sell Price 2 ──────────────────────────────── */}
                            <div className={clsx(CELL_CLS, "flex items-center gap-0.5 ps-1")}>
                                <CellInput
                                    ref={getInputRef(rowIdx, "sellPrice2") as any}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={row.sellPrice2 === 0 && focusCell?.[0] !== rowIdx ? "" : row.sellPrice2}
                                    placeholder="0.00"
                                    className={clsx(
                                        "font-black font-mono text-end text-amber-500",
                                        (row.sellPrice2 || 0) > 0 && (row.sellPrice2 || 0) < row.unitPrice && "bg-rose-500/20 text-rose-600 animate-pulse ring-1 ring-rose-500/50"
                                    )}
                                    onChange={(e) => updateRow(rowIdx, { sellPrice2: parseFloat(e.target.value) || 0 })}
                                    onFocus={(e) => { setFocusCell([rowIdx, "sellPrice2"]); e.target.select(); }}
                                    onKeyDown={(e) => handleKeyDown(e, rowIdx, "sellPrice2")}
                                />
                            </div>

                            {/* ── Sell Price 3 ──────────────────────────────── */}
                            <div className={clsx(CELL_CLS, "flex items-center gap-0.5 ps-1")}>
                                <CellInput
                                    ref={getInputRef(rowIdx, "sellPrice3") as any}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={row.sellPrice3 === 0 && focusCell?.[0] !== rowIdx ? "" : row.sellPrice3}
                                    placeholder="0.00"
                                    className={clsx(
                                        "font-black font-mono text-end text-rose-500",
                                        (row.sellPrice3 || 0) > 0 && (row.sellPrice3 || 0) < row.unitPrice && "bg-rose-500/20 text-rose-600 animate-pulse ring-1 ring-rose-500/50"
                                    )}
                                    onChange={(e) => updateRow(rowIdx, { sellPrice3: parseFloat(e.target.value) || 0 })}
                                    onFocus={(e) => { setFocusCell([rowIdx, "sellPrice3"]); e.target.select(); }}
                                    onKeyDown={(e) => handleKeyDown(e, rowIdx, "sellPrice3")}
                                />
                            </div>

                            {/* ── Sub-Total (read-only) ────────────────────── */}
                            <div className={clsx(CELL_CLS, "flex items-center justify-end px-3")}>
                                <span className={clsx(
                                    "text-xs font-black font-mono tabular-nums",
                                    row.subTotal > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/25"
                                )}>
                                    {row.subTotal > 0 ? row.subTotal.toFixed(2) : "—"}
                                </span>
                            </div>

                            {/* ── Delete ───────────────────────────────────── */}
                            <div className="flex items-center justify-center px-1">
                                <button
                                    type="button"
                                    onClick={() => removeRow(rowIdx)}
                                    tabIndex={-1}
                                    className="p-1.5 text-rose-500/30 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover/row:opacity-100 active:scale-90"
                                    title="حذف السطر"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Footer ─────────────────────────────────────────────────────── */}
            <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-slate-200 dark:border-white/10 flex items-center justify-between font-cairo">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white font-black rounded-xl gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-all active:scale-95"
                    onClick={() => {
                        const lastRow = rows[rows.length - 1];
                        if (lastRow && lastRow.unitPrice > 0 && (
                            ((lastRow.sellPrice || 0) > 0 && (lastRow.sellPrice || 0) < lastRow.unitPrice) ||
                            ((lastRow.sellPrice2 || 0) > 0 && (lastRow.sellPrice2 || 0) < lastRow.unitPrice) ||
                            ((lastRow.sellPrice3 || 0) > 0 && (lastRow.sellPrice3 || 0) < lastRow.unitPrice)
                        )) {
                            toast.error("يرجى تصحيح سعر البيع في السطر الأخير قبل إضافة سطر جديد");
                            focusInput(rows.length - 1, "sellPrice");
                            return;
                        }

                        onRowsChange([...rows, createEmptyRow()]);
                        setTimeout(() => focusInput(rows.length, "itemCode"), 0);
                    }}
                >
                    <Plus className="w-4 h-4 text-emerald-500" />
                    <span>إضافة سطر جديد</span>
                </Button>

                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">عدد الأصناف</span>
                        <span className="text-sm font-black text-zinc-900 dark:text-zinc-200">{rows.filter(r => r.productId || r.itemName).length}</span>
                    </div>
                    <div className="w-px h-8 bg-slate-200 dark:bg-white/10" />
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">إجمالي المشتريات</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                                {rows.reduce((sum, r) => sum + r.subTotal, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] font-black text-zinc-500">EGP</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

export function gridRowsToCartItems(rows: GridRow[]): InvoiceItem[] {
    return rows
        .filter((r) => r.itemName.trim() !== "" && (r.quantity > 0 || r.unitPrice > 0))
        .map((r) => ({
            id: r.id,
            productId: r.productId,
            name: r.itemName,
            sku: r.itemCode,
            categoryId: r.categoryId || undefined,
            quantity: r.quantity || 1,
            unitCost: r.unitPrice,
            sellPrice: r.sellPrice ?? r.unitPrice,
            sellPrice2: r.sellPrice2,
            sellPrice3: r.sellPrice3,
            isNew: r.isNew,
            modelId: r.modelId || undefined,
            attributeId: r.attributeId || undefined,
            isDevice: r.isDevice,
            deviceType: r.deviceType,
            condition: r.condition,
            imei: r.imei,
            unitOfMeasureId: r.unitOfMeasureId,
            conversionFactor: r.conversionFactor || 1,
        }));
}

export function cartItemsToGridRows(items: InvoiceItem[]): GridRow[] {
    return items.map((i) => ({
        id: i.id,
        productId: i.productId,
        itemCode: i.sku,
        itemName: i.name,
        categoryId: i.categoryId ?? "",
        modelId: i.modelId ?? "",
        attributeId: i.attributeId ?? "",
        unit: "قطعة",
        quantity: i.quantity,
        unitPrice: i.unitCost,
        subTotal: computeSubTotal(i.quantity, i.unitCost),
        sellPrice: i.sellPrice,
        sellPrice2: i.sellPrice2,
        sellPrice3: i.sellPrice3,
        isNew: i.isNew ?? false,
        isDevice: i.isDevice,
        deviceType: i.deviceType,
        condition: i.condition,
        imei: i.imei,
        unitOfMeasureId: i.unitOfMeasureId,
        conversionFactor: i.conversionFactor || 1,
    }));
}

// Validate grid before submission — returns an error message or null
export function validateGridRows(rows: GridRow[]): string | null {
    const filledRows = rows.filter((r) => r.itemName.trim() !== "");
    if (filledRows.length === 0) return "لا توجد أصناف في الفاتورة";

    const newWithoutCategory = filledRows.filter((r) => r.isNew && !r.categoryId);
    if (newWithoutCategory.length > 0) {
        const names = newWithoutCategory.map((r) => `"${r.itemName}"`).join("، ");
        return `يجب اختيار الفئة للأصناف الجديدة: ${names}`;
    }

    const zeroPrice = filledRows.filter((r) => r.unitPrice <= 0);
    if (zeroPrice.length > 0) {
        return `يجب إدخال سعر التكلفة لجميع الأصناف`;
    }

    return null;
}
