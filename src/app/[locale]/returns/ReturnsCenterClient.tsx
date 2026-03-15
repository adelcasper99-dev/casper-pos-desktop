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
}[] = [
  {
    key: "SALES",
    label: "مرتجع مبيعات",
    labelEn: "Sales Return",
    icon: ShoppingCart,
    placeholder: "البحث بالاسم، الهاتف، أو رقم الفاتورة...",
    activeColor: "bg-emerald-500/15 border-emerald-500/60 text-emerald-300 shadow-emerald-900/30",
  },
  {
    key: "PURCHASES",
    label: "مرتجع مشتريات",
    labelEn: "Purchase Return",
    icon: Undo2,
    placeholder: "البحث باسم المورد أو رقم أمر الشراء...",
    activeColor: "bg-sky-500/15 border-sky-500/60 text-sky-300 shadow-sky-900/30",
  },
  {
    key: "MAINTENANCE",
    label: "مرتجع صيانة",
    labelEn: "Ticket Return",
    icon: Wrench,
    placeholder: "البحث باسم العميل، الهاتف، أو رقم التذكرة...",
    activeColor: "bg-violet-500/15 border-violet-500/60 text-violet-300 shadow-violet-900/30",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReturnsCenterClient({ csrfToken, features }: ReturnsCenterClientProps) {
  // Filter available return types based on module state
  const returnTypes = ALL_RETURN_TYPES.filter(type => {
    if (type.key === "SALES" && features.pos === false) return false;
    if (type.key === "MAINTENANCE" && features.maintenance === false) return false;
    if (type.key === "PURCHASES" && features.purchasing === false) return false;
    return true;
  });

  const [returnType, setReturnType] = useState<ReturnType>(() => {
    // Default to the first available return type
    return returnTypes[0]?.key || "SALES";
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedDocument, setFetchedDocument] = useState<FetchedDocument | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Unified Date Filtering
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Protected activeConfig
  const activeConfig = returnTypes.find((t) => t.key === returnType) || returnTypes[0];

  // ── Handle ReturnType Fallback ─────────────────────────────────────────────
  useEffect(() => {
    const isCurrentTypeValid = returnTypes.some(t => t.key === returnType);
    if (!isCurrentTypeValid && returnTypes.length > 0) {
      setReturnType(returnTypes[0].key);
    }
  }, [features, returnTypes, returnType]);

  // ── Debounced Search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConfig) return; // Guard for no available modules

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

  // ── Close results on click outside ────────────────────────────────────────
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

  if (returnTypes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-zinc-900/50 rounded-2xl border border-white/5">
        <Undo2 size={48} className="text-zinc-600 mb-4" />
        <h2 className="text-xl font-bold text-zinc-300">لا توجد موديولات مفعلة</h2>
        <p className="text-zinc-500 mt-2">يرجى تفعيل موديول المبيعات أو المشتريات أو الصيانة لاستخدام مركز المرتجعات</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* ── Type Toggle ── */}
      <div className={cn("grid gap-3", returnTypes.length === 1 ? "grid-cols-1" : returnTypes.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {returnTypes.map(({ key, label, labelEn, icon: Icon, activeColor }) => {
          const isActive = returnType === key;
          return (
            <button
              key={key}
              onClick={() => handleTypeSwitch(key)}
              className={`
                flex flex-col items-center justify-center gap-2 rounded-xl border px-4 py-4
                text-sm font-medium transition-all duration-200 cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-white/20
                ${isActive ? `${activeColor} shadow-lg scale-[1.02]` : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"}
              `}
            >
              <Icon size={22} strokeWidth={1.8} />
              <span className="text-base">{label}</span>
              <span className="text-[11px] opacity-60">{labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* ── Search Bar & Filters (Inline) ── */}
      <div className="flex flex-col xl:flex-row gap-4 items-start">
        <div className="relative flex-1 w-full" ref={searchContainerRef}>
          <div className="relative group/search">
            <Search size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within/search:text-white transition-colors pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => (searchQuery.length >= 2 || dateRange?.from) && setShowResults(true)}
              placeholder={activeConfig?.placeholder || ""}
              className="w-full rounded-2xl border border-white/5 bg-white/5 py-4 pr-12 pl-4 text-base text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/10 transition-all font-medium"
            />
            {isSearching && <Loader2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 animate-spin text-zinc-500" />}
          </div>

          {/* Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl border border-white/10 bg-[#141417]/95 backdrop-blur-xl shadow-2xl max-h-[400px] overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-2 space-y-1">
                <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                  {searchQuery ? "نتائج البحث" : "مستندات حديثة"}
                </div>
                {searchResults.map((res) => (
                  <button
                    key={res.id}
                    onClick={() => selectDocument(res.id)}
                    className="w-full flex items-center justify-between gap-4 p-3.5 rounded-xl hover:bg-white/10 text-right transition-all group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-zinc-100 truncate group-hover:text-white">{res.label}</span>
                      </div>
                      <span className="text-xs text-zinc-500 block truncate">{res.subLabel}</span>
                    </div>
                    <div className="text-left shrink-0">
                      <span className="text-sm font-mono font-bold text-zinc-400 group-hover:text-emerald-400 transition-colors">
                        {res.total.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Premium Date Filter Bar */}
        <div className="flex items-center gap-1.5 bg-zinc-900/40 p-1.5 rounded-2xl border border-white/5 w-fit shrink-0">
          <div className="flex items-center">
            {["today", "yesterday", "week", "month"].map((filter) => (
              <Button
                key={filter}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 px-4 text-sm font-bold rounded-xl transition-all",
                  dateFilter === filter ? "text-emerald-400 bg-emerald-500/10" : "text-zinc-500 hover:text-zinc-200"
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

          <div className="w-px h-5 bg-white/10 mx-1" />

          <div className="relative group">
            <FlatpickrRangePicker
              onRangeChange={(dates) => {
                if (dates.length === 2) {
                  setDateRange({ from: dates[0], to: dates[1] });
                  setDateFilter("custom");
                } else if (dates.length === 1) {
                  setDateRange({ from: dates[0], to: undefined });
                  setDateFilter("custom");
                } else {
                  setDateRange(undefined);
                  setDateFilter("all");
                }
              }}
              onClear={() => {
                setDateRange(undefined);
                setDateFilter("all");
              }}
              initialDates={dateRange?.from ? [dateRange.from, ...(dateRange.to ? [dateRange.to] : [])] : []}
              placeholder="...اختر الفترة الزمنية"
              className="w-56"
            />
          </div>
        </div>
      </div>

      {/* ── Feedback Banners ── */}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 size={18} className="shrink-0" />
          {successMessage}
        </div>
      )}

      {fetchError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={18} className="shrink-0" />
          {fetchError}
        </div>
      )}

      {isPending && !isSearching && (
         <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-zinc-600" />
         </div>
      )}

      {/* ── Document Preview ── */}
      {fetchedDocument && !isPending && (
        <DocumentPreviewBadge doc={fetchedDocument} />
      )}

      {/* ── Return Cart ── */}
      {fetchedDocument && !isPending && (
        <>
          {fetchedDocument.type === "SALES" && (
            <ReturnCart
              returnType="SALES"
              data={fetchedDocument.data as FetchedSale}
              csrfToken={csrfToken}
              onSuccess={handleSuccess}
            />
          )}
          {fetchedDocument.type === "PURCHASES" && (
            <ReturnCart
              returnType="PURCHASES"
              data={fetchedDocument.data as FetchedPurchase}
              csrfToken={csrfToken}
              onSuccess={handleSuccess}
            />
          )}
          {fetchedDocument.type === "MAINTENANCE" && (
            <ReturnCart
              returnType="MAINTENANCE"
              data={fetchedDocument.data as FetchedTicket}
              csrfToken={csrfToken}
              onSuccess={handleSuccess}
            />
          )}
        </>
      )}
    </div>
  );
}

function DocumentPreviewBadge({ doc }: { doc: FetchedDocument }) {
  const commonCls = "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-5 py-4 text-sm animate-in fade-in slide-in-from-bottom-2 duration-300";
  const labelCls = "text-zinc-500 text-xs block mb-0.5";
  const valueCls = "text-zinc-200 font-medium";

  const DataItem = ({ label, value, mono = false, color = "text-zinc-200" }: any) => (
    <div>
      <span className={labelCls}>{label}</span>
      <span className={`${valueCls} ${mono ? "font-mono" : ""} ${color}`}>{value}</span>
    </div>
  );

  if (doc.type === "SALES") {
    const d = doc.data;
    return (
      <div className={`${commonCls} border-emerald-500/25 bg-emerald-500/8`}>
        <DataItem label="رقم الفاتورة" value={d.invoiceNumber ?? d.id.slice(0, 8).toUpperCase()} color="text-emerald-300" />
        <DataItem label="العميل" value={d.customerName ?? "—"} />
        <DataItem label="الحالة" value={d.status} />
        <DataItem label="العناصر" value={`${d.items.length} صنف`} />
        <DataItem label="الإجمالي" value={`${d.totalAmount.toFixed(2)} ج.م`} mono />
      </div>
    );
  }

  if (doc.type === "PURCHASES") {
    const d = doc.data;
    return (
      <div className={`${commonCls} border-sky-500/25 bg-sky-500/8`}>
        <DataItem label="أمر الشراء" value={d.invoiceNumber ?? d.id.slice(0, 8).toUpperCase()} color="text-sky-300" />
        <DataItem label="المورد" value={d.supplierName} />
        <DataItem label="الحالة" value={d.status} />
        <DataItem label="العناصر" value={`${d.items.length} صنف`} />
        <DataItem label="الإجمالي" value={`${d.totalAmount.toFixed(2)} ج.م`} mono />
      </div>
    );
  }

  const d = doc.data;
  return (
    <div className={`${commonCls} border-violet-500/25 bg-violet-500/8`}>
      <DataItem label="رقم التذكرة" value={d.ticketNumber ?? d.id.slice(0, 8).toUpperCase()} color="text-violet-300" />
      <DataItem label="العميل" value={d.customerName ?? "—"} />
      <DataItem label="الحالة" value={d.status} />
      <DataItem label="البنود" value={`${d.items.length} بند`} />
      <DataItem label="الإجمالي" value={`${d.totalAmount.toFixed(2)} ج.م`} mono />
    </div>
  );
}
