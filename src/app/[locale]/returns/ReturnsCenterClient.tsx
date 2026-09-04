"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import {
  ShoppingCart,
  Undo2,
  Wrench,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Box,
  Ticket,
  Truck,
  History,
  Info
} from "lucide-react";
import ReturnCart from "./ReturnCart";
import { Button } from "@/components/ui/button";
import { FlatpickrRangePicker } from "@/components/ui/flatpickr-range-picker";
import { cn } from "@/lib/utils";
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subDays
} from 'date-fns';
import { DateRange } from "react-day-picker";
import {
  getSaleById,
  getPurchaseById,
  getTicketById,
  searchReturns,
  type FetchedSale,
  type FetchedPurchase,
  type FetchedTicket,
  type SearchResult,
} from "../../../actions/returns-fetchers";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReturnType = "SALES" | "PURCHASES" | "MAINTENANCE";

type FetchedDocument =
  | { type: "SALES"; data: FetchedSale }
  | { type: "PURCHASES"; data: FetchedPurchase }
  | { type: "MAINTENANCE"; data: FetchedTicket };

interface ReturnsCenterClientProps {
  csrfToken: string;
  features: any;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ALL_RETURN_TYPES: {
  key: ReturnType;
  label: string;
  labelEn: string;
  icon: React.ElementType;
  placeholder: string;
  activeClass: string;
  inactiveClass: string;
  activeIconClass: string;
  inactiveIconClass: string;
  glow: string;
}[] = [
  {
    key: "SALES",
    label: "مرتجع مبيعات",
    labelEn: "Sales Return",
    icon: ShoppingCart,
    placeholder: "البحث بالاسم، الهاتف، أو رقم الفاتورة...",
    activeClass: "bg-gradient-to-r from-emerald-600 to-emerald-500 border-emerald-400 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400/30",
    inactiveClass: "bg-emerald-950/30 border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/60 hover:border-emerald-500/70 hover:text-emerald-300 shadow-xs",
    activeIconClass: "bg-white/20 text-white",
    inactiveIconClass: "bg-emerald-500/20 text-emerald-400",
    glow: "shadow-emerald-500/20",
  },
  {
    key: "PURCHASES",
    label: "مرتجع مشتريات",
    labelEn: "Purchase Return",
    icon: Truck,
    placeholder: "البحث باسم المورد أو رقم أمر الشراء...",
    activeClass: "bg-gradient-to-r from-sky-600 to-sky-500 border-sky-400 text-white shadow-md shadow-sky-600/30 ring-2 ring-sky-400/30",
    inactiveClass: "bg-sky-950/30 border-sky-500/40 text-sky-400 hover:bg-sky-950/60 hover:border-sky-500/70 hover:text-sky-300 shadow-xs",
    activeIconClass: "bg-white/20 text-white",
    inactiveIconClass: "bg-sky-500/20 text-sky-400",
    glow: "shadow-sky-500/20",
  },
  {
    key: "MAINTENANCE",
    label: "مرتجع صيانة",
    labelEn: "Ticket Return",
    icon: Wrench,
    placeholder: "البحث باسم العميل، الهاتف، أو رقم التذكرة...",
    activeClass: "bg-gradient-to-r from-violet-600 to-violet-500 border-violet-400 text-white shadow-md shadow-violet-600/30 ring-2 ring-violet-400/30",
    inactiveClass: "bg-violet-950/30 border-violet-500/40 text-violet-400 hover:bg-violet-950/60 hover:border-violet-500/70 hover:text-violet-300 shadow-xs",
    activeIconClass: "bg-white/20 text-white",
    inactiveIconClass: "bg-violet-500/20 text-violet-400",
    glow: "shadow-violet-500/20",
  },
];

const getTodayRange = (): DateRange => {
  const now = new Date();
  return { from: startOfDay(now), to: endOfDay(now) };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReturnsCenterClient({ csrfToken, features }: ReturnsCenterClientProps) {
  const returnTypes = ALL_RETURN_TYPES.filter(type => {
    if (type.key === "SALES" && features.pos === false) return false;
    if (type.key === "MAINTENANCE" && features.maintenance === false) return false;
    if (type.key === "PURCHASES" && features.purchasing === false) return false;
    return true;
  });

  const [returnType, setReturnType] = useState<ReturnType>(() => {
    return returnTypes[0]?.key || "SALES";
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [tableFilter, setTableFilter] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedDocument, setFetchedDocument] = useState<FetchedDocument | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [dateFilter, setDateFilter] = useState<string>("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => getTodayRange());

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const activeConfig = returnTypes.find((t) => t.key === returnType) || returnTypes[0];

  useEffect(() => {
    const isCurrentTypeValid = returnTypes.some(t => t.key === returnType);
    if (!isCurrentTypeValid && returnTypes.length > 0) {
      setReturnType(returnTypes[0].key);
    }
  }, [features, returnTypes, returnType]);

  useEffect(() => {
    if (!activeConfig) return;

    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2 || (dateRange?.from && searchQuery.trim().length === 0)) {
        setIsSearching(true);
        startTransition(async () => {
          const res = await searchReturns(
            returnType,
            searchQuery,
            dateRange?.from?.toISOString(),
            dateRange?.to?.toISOString()
          );
          if (res.success) {
            setSearchResults(res.data);
            setShowResults(true);
          }
          setIsSearching(false);
        });
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, returnType, dateRange, activeConfig]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleTypeSwitch = (type: ReturnType) => {
    setReturnType(type);
    setSearchQuery("");
    setSearchResults([]);
    setFetchedDocument(null);
    setFetchError(null);
    setSuccessMessage(null);
  };

  const selectDocument = (id: string) => {
    setShowResults(false);
    setFetchError(null);
    setFetchedDocument(null);

    startTransition(async () => {
      let result: { success: boolean; data?: any; error?: string };
      if (returnType === "SALES") result = await getSaleById(id);
      else if (returnType === "PURCHASES") result = await getPurchaseById(id);
      else result = await getTicketById(id);

      if (result.success && result.data) {
        setFetchedDocument({ type: returnType as any, data: result.data });
        setSearchQuery("");
      } else {
        setFetchError(result.error ?? "حدث خطأ أثناء تحميل المستند");
      }
    });
  };

  const handleSuccess = useCallback((msg: string) => {
    setSuccessMessage(msg);
    setFetchedDocument(null);
    setSearchQuery("");
  }, []);

  const displayedRows = searchResults.filter((row) => {
    const q = tableFilter.trim().toLowerCase();
    if (!q) return true;
    return [
      row.customerName, row.customerPhone, row.productName,
      row.referenceNumber, String(row.quantity), String(row.unitPrice),
      new Date(row.invoiceDate).toLocaleDateString("ar-EG"),
    ].join(" ").toLowerCase().includes(q);
  });

  if (returnTypes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-24 text-center glass-card bg-card/40 backdrop-blur-xl border border-border/40 rounded-3xl shadow-2xl">
        <Undo2 size={48} className="text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-black text-foreground uppercase tracking-widest">لا توجد موديولات مفعلة</h2>
        <p className="text-muted-foreground mt-2 font-medium">يرجى تفعيل القنوات المناسبة لمعالجة المرتجعات</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5" dir="rtl">
      {/* ── Type Toggle (Modern Visible Buttons) ── */}
      <div className={cn("grid gap-2.5", 
        returnTypes.length === 1 ? "grid-cols-1" : 
        returnTypes.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {returnTypes.map(({ key, label, labelEn, icon: Icon, activeClass, inactiveClass, activeIconClass, inactiveIconClass }) => {
          const isActive = returnType === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleTypeSwitch(key)}
              className={cn(
                "group relative flex items-center justify-center gap-3 rounded-xl border-2 px-3 py-2 transition-all duration-200 cursor-pointer h-12 select-none active:scale-[0.98]",
                isActive 
                  ? `${activeClass} font-black scale-[1.01]` 
                  : `${inactiveClass} font-bold`
              )}
            >
              <div className={cn(
                "p-1.5 rounded-lg flex items-center justify-center transition-colors shrink-0",
                isActive ? activeIconClass : inactiveIconClass
              )}>
                <Icon size={18} strokeWidth={2.5} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-black tracking-tight">{label}</span>
                <span className={cn(
                  "text-[10px] uppercase font-bold tracking-wider hidden sm:inline",
                  isActive ? "text-white/85" : "opacity-60"
                )}>
                  ({labelEn})
                </span>
              </div>
              {isActive && (
                <span className="w-2 h-2 rounded-full bg-white shadow-xs animate-pulse mr-auto" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search Bar & Compact Date Filters ── */}
      <div className="flex flex-col md:flex-row gap-2 items-center">
        <div className="relative flex-1 w-full" ref={searchContainerRef}>
          <div className="relative overflow-hidden group">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => (searchQuery.length >= 2 || dateRange?.from) && setShowResults(true)}
              placeholder={activeConfig?.placeholder || ""}
              className="w-full bg-card/40 border border-border/50 rounded-xl py-1.5 pr-9 pl-8 text-xs text-foreground placeholder-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-all font-bold h-9 shadow-xs"
            />
            {isSearching && <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
          </div>

          {/* Search Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border/50 bg-card/95 backdrop-blur-2xl shadow-xl max-h-[360px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-2 space-y-0.5">
                <div className="px-3 py-1.5 text-[10px] uppercase font-black tracking-wider text-muted-foreground border-b border-border/30 mb-1 flex items-center justify-between">
                  <span>{searchQuery ? "نتائج البحث الذكية" : "تاريخ البحث الأخير"}</span>
                  <History className="w-3 h-3" />
                </div>
                {searchResults.map((res, idx) => (
                  <button
                    key={`${res.id}-${idx}`}
                    onClick={() => selectDocument(res.id)}
                    className="w-full flex items-center justify-between gap-4 px-3 py-2 rounded-lg hover:bg-primary/10 transition-all text-right group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                         <div className="w-1.5 h-1.5 rounded-full bg-primary/50 group-hover:bg-primary" />
                         <span className="font-bold text-foreground text-xs group-hover:text-primary transition-colors">{res.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium block truncate mr-3.5">{res.subLabel}</span>
                    </div>
                    <div className="text-left shrink-0">
                      <span className="text-xs font-black font-mono text-emerald-400">
                        {res.total.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[9px] font-bold text-muted-foreground block mr-1">EGP</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Compact Integrated Filter Bar */}
        <div className="flex items-center gap-1.5 bg-card/40 backdrop-blur-md p-1 rounded-xl border border-border/50 shadow-xs w-full md:w-auto shrink-0">
          <div className="flex items-center gap-0.5">
            {["today", "yesterday", "week", "month"].map((filter) => (
              <Button
                key={filter}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2.5 text-[11px] font-bold rounded-lg transition-all",
                  dateFilter === filter ? "text-primary bg-primary/10 shadow-xs font-black" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
                onClick={() => {
                  setDateFilter(filter);
                  let from: Date, to: Date = endOfDay(new Date());
                  if (filter === "today") from = startOfDay(new Date());
                  else if (filter === "yesterday") {
                    const d = subDays(new Date(), 1);
                    from = startOfDay(d);
                    to = endOfDay(d);
                  } else if (filter === "week") from = startOfWeek(new Date(), { weekStartsOn: 6 });
                  else from = startOfMonth(new Date());
                  setDateRange({ from, to });
                }}
              >
                {filter === "today" ? "اليوم" : filter === "yesterday" ? "أمس" : filter === "week" ? "الأسبوع" : "الشهر"}
              </Button>
            ))}
          </div>

          <div className="w-px h-4 bg-border/50 mx-1" />

          <div className="relative group/picker">
            <FlatpickrRangePicker
              onRangeChange={(dates) => {
                if (dates.length === 2) { setDateRange({ from: dates[0], to: dates[1] }); setDateFilter("custom"); }
                else if (dates.length === 1) { setDateRange({ from: dates[0], to: undefined }); setDateFilter("custom"); }
                else { setDateRange(undefined); setDateFilter("all"); }
              }}
              onClear={() => { setDateRange(undefined); setDateFilter("all"); }}
              initialDates={dateRange?.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
              placeholder="تحديد مخصص..."
              className="w-40 bg-transparent border-none h-7 rounded-lg font-bold text-[10px]"
            />
          </div>
        </div>
      </div>

      {/* ── Main Data View ── */}
      <div className="glass-card bg-card/40 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden shadow-xs relative">
        <div className="p-2.5 border-b border-border/30 bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-foreground">تفاصيل ومحفوظات الفواتير</h3>
              <p className="text-[10px] text-muted-foreground">مستندات العمليات الجارية القابلة للاسترجاع</p>
            </div>
          </div>
          <div className="relative w-full sm:w-64">
             <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                <Search size={13} className="text-muted-foreground/50" />
             </div>
            <input
              type="text"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder="البحث في القائمة المعروضة..."
              className="w-full rounded-lg border border-border/40 bg-background/50 py-1 pr-8 pl-3 text-xs text-foreground font-bold focus:ring-1 focus:ring-primary/40 transition-all h-7"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[calc(100vh-270px)] overflow-y-auto">
          <table className="w-full min-w-[850px] text-xs">
            <thead className="bg-muted/60 border-b border-border/30 sticky top-0 z-10 backdrop-blur-md">
              <tr>
                {["المرجع", "اسم العميل", "رقم العميل", "اسم المنتج", "الكمية", "تاريخ الفاتورة", "سعر الوحدة", "الإجمالي"].map((h) => (
                  <th key={h} className="px-3 py-2 text-right text-[10px] font-black text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {displayedRows.map((row, idx) => (
                <tr
                  key={`${row.id}-${idx}`}
                  onClick={() => selectDocument(row.id)}
                  className="transition-all hover:bg-primary/10 even:bg-muted/30 cursor-pointer h-9 group"
                >
                  <td className="px-3 py-1.5 font-mono font-bold text-[11px] text-primary">{row.referenceNumber}</td>
                  <td className="px-3 py-1.5 font-bold text-foreground group-hover:text-primary transition-colors">{row.customerName || "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground font-mono">{row.customerPhone || "—"}</td>
                  <td className="px-3 py-1.5 font-medium text-foreground/80">{row.productName || "—"}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className="px-2 py-0.5 bg-background/60 rounded border border-border/40 font-bold">{row.quantity}</span>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground font-mono">{new Date(row.invoiceDate).toLocaleDateString("ar-EG")}</td>
                  <td className="px-3 py-1.5 font-mono">{row.unitPrice.toFixed(2)}</td>
                  <td className="px-3 py-1.5"><span className="text-emerald-400 font-bold font-mono text-xs">{row.total.toFixed(2)}</span></td>
                </tr>
              ))}
              {displayedRows.length === 0 && !isPending && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center">
                    <div className="flex flex-col items-center gap-1.5 opacity-40">
                       <Info size={24} />
                       <span className="text-xs font-bold">لا توجد سجلات للمطابقة</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Visual Feedbacks ── */}
      <div className="space-y-2">
        {successMessage && (
          <div className="flex items-center gap-2 rounded-xl glass-card bg-emerald-500/10 border-emerald-500/40 p-2.5 text-xs text-emerald-400 animate-in zoom-in-95 duration-200">
            <CheckCircle2 size={16} className="shrink-0" />
            <div className="font-bold">{successMessage}</div>
          </div>
        )}
        {fetchError && (
          <div className="flex items-center gap-2 rounded-xl glass-card bg-rose-500/10 border-rose-500/40 p-2.5 text-xs text-rose-400 animate-in zoom-in-95 duration-200">
            <AlertCircle size={16} className="shrink-0" />
            <div className="font-bold">{fetchError}</div>
          </div>
        )}
      </div>

      {(isPending && !isSearching) && (
         <div className="flex items-center justify-center py-8 animate-in fade-in duration-300">
            <Loader2 size={24} className="animate-spin text-primary opacity-50" />
         </div>
      )}

      {/* ── Premium Document Preview Overlay ── */}
      {fetchedDocument && !isPending && (
        <DocumentPreviewBadge doc={fetchedDocument} />
      )}

      {/* ── Integrated Return Cart ── */}
      {fetchedDocument && !isPending && (
        <div className="glass-card bg-card/60 backdrop-blur-2xl border border-primary/20 rounded-2xl p-4 mt-2 shadow-lg animate-in slide-in-from-bottom-4 duration-500">
          <ReturnCart
            returnType={fetchedDocument.type}
            data={fetchedDocument.data as any}
            csrfToken={csrfToken}
            onSuccess={handleSuccess}
          />
        </div>
      )}
    </div>
  );
}

function DocumentPreviewBadge({ doc }: { doc: FetchedDocument }) {
  const commonCls = cn(
    "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-3 py-2 shadow-xs animate-in fade-in slide-in-from-bottom-2 duration-300 glass-card backdrop-blur-xl relative overflow-hidden group",
    doc.type === "SALES" ? "border-emerald-500/30 bg-emerald-500/5" :
    doc.type === "PURCHASES" ? "border-sky-500/30 bg-sky-500/5" :
    "border-violet-500/30 bg-violet-500/5"
  );

  const DataItem = ({ label, value, mono = false, color = "text-foreground" }: any) => (
    <div className="relative z-10">
      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block mb-0.5">{label}</span>
      <span className={cn("text-xs font-bold tracking-tight", mono ? "font-mono" : "", color)}>{value}</span>
    </div>
  );

  return (
    <div className={commonCls}>
      <div className={cn("absolute right-0 top-0 w-24 h-full opacity-10 blur-xl group-hover:opacity-20 transition-opacity", 
        doc.type === "SALES" ? "bg-emerald-500" : doc.type === "PURCHASES" ? "bg-sky-500" : "bg-violet-500")} />
      
      {doc.type === "SALES" && (
        <>
          <DataItem label="نظام المبيعات" value={doc.data.invoiceNumber || doc.data.id.slice(0, 8).toUpperCase()} color="text-emerald-400" />
          <DataItem label="العميل المستهدف" value={doc.data.customerName || "—"} />
          <DataItem label="حالة العملية" value={doc.data.status} />
          <DataItem label="القيمة الإجمالية" value={`${doc.data.totalAmount.toFixed(2)} EGP`} mono color="text-emerald-400" />
        </>
      )}

      {doc.type === "PURCHASES" && (
        <>
          <DataItem label="نظام المشتريات" value={doc.data.invoiceNumber || doc.data.id.slice(0, 8).toUpperCase()} color="text-sky-400" />
          <DataItem label="المورد" value={doc.data.supplierName} />
          <DataItem label="الحالة" value={doc.data.status} />
          <DataItem label="القيمة الإجمالية" value={`${doc.data.totalAmount.toFixed(2)} EGP`} mono color="text-sky-400" />
        </>
      )}

      {doc.type === "MAINTENANCE" && (
        <>
          <DataItem label="نظام الصيانة" value={doc.data.ticketNumber || doc.data.id.slice(0, 8).toUpperCase()} color="text-violet-400" />
          <DataItem label="العميل" value={doc.data.customerName || "—"} />
          <DataItem label="حالة التذكرة" value={doc.data.status} />
          <DataItem label="القيمة الإجمالية" value={`${doc.data.totalAmount.toFixed(2)} EGP`} mono color="text-violet-400" />
        </>
      )}
    </div>
  );
}
