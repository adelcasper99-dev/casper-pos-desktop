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
  activeColor: string;
  glow: string;
}[] = [
  {
    key: "SALES",
    label: "مرتجع مبيعات",
    labelEn: "Sales Return",
    icon: ShoppingCart,
    placeholder: "البحث بالاسم، الهاتف، أو رقم الفاتورة...",
    activeColor: "bg-emerald-500/20 border-emerald-500/60 text-emerald-400",
    glow: "shadow-emerald-500/20",
  },
  {
    key: "PURCHASES",
    label: "مرتجع مشتريات",
    labelEn: "Purchase Return",
    icon: Truck,
    placeholder: "البحث باسم المورد أو رقم أمر الشراء...",
    activeColor: "bg-sky-500/20 border-sky-500/60 text-sky-400",
    glow: "shadow-sky-500/20",
  },
  {
    key: "MAINTENANCE",
    label: "مرتجع صيانة",
    labelEn: "Ticket Return",
    icon: Wrench,
    placeholder: "البحث باسم العميل، الهاتف، أو رقم التذكرة...",
    activeColor: "bg-violet-500/20 border-violet-500/60 text-violet-400",
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
    <div className="space-y-8" dir="rtl">
      {/* ── Type Toggle (Modern Tabs) ── */}
      <div className={cn("grid gap-6", 
        returnTypes.length === 1 ? "grid-cols-1" : 
        returnTypes.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {returnTypes.map(({ key, label, labelEn, icon: Icon, activeColor, glow }) => {
          const isActive = returnType === key;
          return (
            <button
              key={key}
              onClick={() => handleTypeSwitch(key)}
              className={cn(
                "group relative flex flex-col items-center justify-center gap-2 rounded-3xl border px-6 py-6 transition-all duration-500 overflow-hidden",
                isActive 
                  ? `${activeColor} ${glow} shadow-2xl scale-[1.03] z-10 glass-card backdrop-blur-3xl` 
                  : "border-border/40 bg-card/20 text-muted-foreground hover:bg-card/40 hover:border-border transition-colors backdrop-blur-md"
              )}
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
              )}
              <Icon size={32} strokeWidth={1.5} className={cn("transition-transform duration-500 group-hover:scale-110", isActive ? "text-primary" : "text-muted-foreground/50")} />
              <div className="text-center relative z-10">
                <span className="text-base font-black tracking-tight block">{label}</span>
                <span className="text-[10px] uppercase font-black tracking-widest opacity-40">{labelEn}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Search Bar & Premium Filters ── */}
      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="relative flex-1 w-full" ref={searchContainerRef}>
          <div className="glass-card bg-card/40 backdrop-blur-xl border border-border/40 rounded-3xl shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Search size={22} className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => (searchQuery.length >= 2 || dateRange?.from) && setShowResults(true)}
              placeholder={activeConfig?.placeholder || ""}
              className="w-full bg-transparent py-5 pr-14 pl-6 text-lg text-foreground placeholder-muted-foreground/30 focus:outline-none transition-all font-bold"
            />
            {isSearching && <Loader2 size={18} className="absolute left-6 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
          </div>

          {/* Premium Search Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-4 z-50 rounded-3xl border border-border/40 bg-card/95 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] max-h-[450px] overflow-y-auto animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="p-3 space-y-1">
                <div className="px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 border-b border-border/20 mb-2 flex items-center justify-between">
                  <span>{searchQuery ? "نتائج البحث الذكية" : "تاريخ البحث الأخير"}</span>
                  <History className="w-3 h-3" />
                </div>
                {searchResults.map((res, idx) => (
                  <button
                    key={`${res.id}-${idx}`}
                    onClick={() => selectDocument(res.id)}
                    className="w-full flex items-center justify-between gap-6 p-4 rounded-2xl hover:bg-primary/10 transition-all text-right group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-1">
                         <div className="w-2 h-2 rounded-full bg-primary/40 group-hover:bg-primary" />
                         <span className="font-black text-foreground text-base group-hover:text-primary transition-colors">{res.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-medium block truncate mr-5">{res.subLabel}</span>
                    </div>
                    <div className="text-left shrink-0">
                      <span className="text-lg font-black font-mono text-emerald-500 drop-shadow-sm">
                        {res.total.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] font-black text-muted-foreground block mr-1">EGP</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Premium Integrated Filter Bar */}
        <div className="flex items-center gap-2 bg-card/40 backdrop-blur-xl p-2 rounded-3xl border border-border/40 shadow-2xl w-fit">
          <div className="flex items-center">
            {["today", "yesterday", "week", "month"].map((filter) => (
              <Button
                key={filter}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-10 px-5 text-xs font-black rounded-2xl uppercase tracking-widest transition-all",
                  dateFilter === filter ? "text-primary bg-primary/10 shadow-inner" : "text-muted-foreground/60 hover:text-foreground hover:bg-background/40"
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

          <div className="w-px h-6 bg-border/40 mx-2" />

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
              className="w-48 bg-background/20 border-border/20 h-10 rounded-2xl font-black text-[10px] tracking-widest"
            />
          </div>
        </div>
      </div>

      {/* ── Main Data View ── */}
      <div className="glass-card bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl overflow-hidden shadow-2xl relative">
        <div className="p-6 border-b border-white/10 bg-gradient-to-r from-background/20 via-transparent to-transparent flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-foreground flex items-center gap-3">
               <History className="w-5 h-5 text-primary" />
               تفاصيل ومحفوظات الفواتير
            </h3>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">مستندات العمليات الجارية القابلة للاسترجاع</p>
          </div>
          <div className="relative w-full lg:w-[400px]">
             <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <Search size={16} className="text-muted-foreground/40" />
             </div>
            <input
              type="text"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder="البحث في القائمة المعروضة..."
              className="w-full rounded-2xl border border-border/40 bg-background/40 py-3 pr-11 pl-5 text-xs text-foreground font-bold focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-muted/50 border-b border-border/20">
              <tr>
                {["المرجع", "اسم العميل", "رقم العميل", "اسم المنتج", "الكمية", "تاريخ الفاتورة", "سعر الوحدة", "الإجمالي"].map((h) => (
                  <th key={h} className="px-6 py-5 text-right text-[10px] font-black text-muted-foreground uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {displayedRows.map((row, idx) => (
                <tr
                  key={`${row.id}-${idx}`}
                  onClick={() => selectDocument(row.id)}
                  className="transition-all hover:bg-primary/5 even:bg-muted/70 cursor-pointer h-16 group"
                >
                  <td className="px-6 py-4 font-mono font-black text-[11px] text-primary">{row.referenceNumber}</td>
                  <td className="px-6 py-4 font-black text-foreground group-hover:text-primary transition-colors">{row.customerName || "—"}</td>
                  <td className="px-6 py-4 font-bold text-muted-foreground/60">{row.customerPhone || "—"}</td>
                  <td className="px-6 py-4 font-black text-foreground/80">{row.productName || "—"}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-3 py-1 bg-background/60 rounded-lg border border-border/40 font-black">{row.quantity}</span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground/60 font-medium">{new Date(row.invoiceDate).toLocaleDateString("ar-EG")}</td>
                  <td className="px-6 py-4 font-black">{row.unitPrice.toFixed(2)}</td>
                  <td className="px-6 py-4"><span className="text-emerald-500 font-black text-base">{row.total.toFixed(2)}</span></td>
                </tr>
              ))}
              {displayedRows.length === 0 && !isPending && (
                <tr>
                  <td colSpan={8} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center gap-3 grayscale opacity-30">
                       <Info size={40} />
                       <span className="text-sm font-black uppercase tracking-widest">لا توجد سجلات للمطابقة</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Visual Feedbacks ── */}
      <div className="space-y-4">
        {successMessage && (
          <div className="flex items-center gap-4 rounded-3xl glass-card bg-emerald-500/10 border-emerald-500/40 p-5 text-sm text-emerald-400 animate-in zoom-in-95 duration-300">
            <CheckCircle2 size={24} className="shrink-0 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <div className="font-bold">{successMessage}</div>
          </div>
        )}
        {fetchError && (
          <div className="flex items-center gap-4 rounded-3xl glass-card bg-rose-500/10 border-rose-500/40 p-5 text-sm text-rose-400 animate-in zoom-in-95 duration-300">
            <AlertCircle size={24} className="shrink-0 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
            <div className="font-bold">{fetchError}</div>
          </div>
        )}
      </div>

      {(isPending && !isSearching) && (
         <div className="flex items-center justify-center py-20 animate-in fade-in duration-500">
            <Loader2 size={40} className="animate-spin text-primary opacity-40" />
         </div>
      )}

      {/* ── Premium Document Preview Overlay ── */}
      {fetchedDocument && !isPending && (
        <DocumentPreviewBadge doc={fetchedDocument} />
      )}

      {/* ── Integrated Return Cart ── */}
      {fetchedDocument && !isPending && (
        <div className="glass-card bg-card/60 backdrop-blur-3xl border border-primary/20 rounded-[40px] p-8 mt-12 shadow-[0_0_80px_rgba(0,0,0,0.4)] animate-in slide-in-from-bottom-12 duration-700">
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
    "flex flex-wrap items-center gap-x-10 gap-y-4 rounded-3xl border px-8 py-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 glass-card backdrop-blur-2xl relative overflow-hidden group",
    doc.type === "SALES" ? "border-emerald-500/30 bg-emerald-500/5" :
    doc.type === "PURCHASES" ? "border-sky-500/30 bg-sky-500/5" :
    "border-violet-500/30 bg-violet-500/5"
  );

  const DataItem = ({ label, value, mono = false, color = "text-foreground" }: any) => (
    <div className="relative z-10">
      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">{label}</span>
      <span className={cn("text-lg font-black tracking-tight", mono ? "font-mono" : "", color)}>{value}</span>
    </div>
  );

  return (
    <div className={commonCls}>
      <div className={cn("absolute right-0 top-0 w-32 h-full opacity-10 blur-2xl group-hover:opacity-20 transition-opacity", 
        doc.type === "SALES" ? "bg-emerald-500" : doc.type === "PURCHASES" ? "bg-sky-500" : "bg-violet-500")} />
      
      {doc.type === "SALES" && (
        <>
          <DataItem label="نظام المبيعات" value={doc.data.invoiceNumber || doc.data.id.slice(0, 8).toUpperCase()} color="text-emerald-400" />
          <DataItem label="العميل المستهدف" value={doc.data.customerName || "—"} />
          <DataItem label="حالة العملية" value={doc.data.status} />
          <DataItem label="القيمة الإجمالية" value={`${doc.data.totalAmount.toFixed(2)} EGP`} mono color="text-emerald-500" />
        </>
      )}

      {doc.type === "PURCHASES" && (
        <>
          <DataItem label="نظام المشتريات" value={doc.data.invoiceNumber || doc.data.id.slice(0, 8).toUpperCase()} color="text-sky-400" />
          <DataItem label="المورد" value={doc.data.supplierName} />
          <DataItem label="الحالة" value={doc.data.status} />
          <DataItem label="القيمة الإجمالية" value={`${doc.data.totalAmount.toFixed(2)} EGP`} mono color="text-sky-500" />
        </>
      )}

      {doc.type === "MAINTENANCE" && (
        <>
          <DataItem label="نظام الصيانة" value={doc.data.ticketNumber || doc.data.id.slice(0, 8).toUpperCase()} color="text-violet-400" />
          <DataItem label="العميل" value={doc.data.customerName || "—"} />
          <DataItem label="حالة التذكرة" value={doc.data.status} />
          <DataItem label="القيمة الإجمالية" value={`${doc.data.totalAmount.toFixed(2)} EGP`} mono color="text-violet-500" />
        </>
      )}
    </div>
  );
}
