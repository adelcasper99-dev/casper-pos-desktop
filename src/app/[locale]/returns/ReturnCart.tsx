"use client";

import { useState, useMemo, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Banknote,
  CreditCard,
  ShieldX,
  ExternalLink,
  Loader2,
  ChevronRight,
  Info,
} from "lucide-react";
import Decimal from "decimal.js";
import { 
  FetchedSale,
  FetchedPurchase,
  FetchedTicket,
  SaleLineItem,
  PurchaseLineItem,
  TicketLineItem,
} from "../../../actions/returns-fetchers";
import { issueStoreCredit } from "../../../actions/returns-fetchers";
import { partialRefundSale } from "../../../actions/sales-actions";
import { partialReturnPurchase } from "../../../actions/purchase-actions";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "@/lib/i18n-mock";

// ─── Shared Types ─────────────────────────────────────────────────────────────

type RefundMethod = "CASH" | "STORE_CREDIT";

interface SaleCartState {
  [itemId: string]: { qty: number; isDamaged: boolean };
}
interface PurchaseCartState {
  [itemId: string]: { qty: number };
}

// ─── Props ────────────────────────────────────────────────────────────────────

type ReturnCartProps =
  | {
      returnType: "SALES";
      data: FetchedSale;
      csrfToken: string;
      onSuccess: (msg: string) => void;
    }
  | {
      returnType: "PURCHASES";
      data: FetchedPurchase;
      csrfToken: string;
      onSuccess: (msg: string) => void;
    }
  | {
      returnType: "MAINTENANCE";
      data: FetchedTicket;
      csrfToken: string;
      onSuccess: (msg: string) => void;
    };

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReturnCart(props: ReturnCartProps) {
  if (props.returnType === "SALES") return <SalesReturnCart {...props} />;
  if (props.returnType === "PURCHASES") return <PurchaseReturnCart {...props} />;
  return <MaintenanceReturnCart {...props} />;
}

// ══════════════════════════════════════════════════════════════════════════════
// SALES RETURN CART
// ══════════════════════════════════════════════════════════════════════════════

function SalesReturnCart({
  data,
  csrfToken,
  onSuccess,
}: {
  data: FetchedSale;
  csrfToken: string;
  onSuccess: (msg: string) => void;
}) {
  const [cart, setCart] = useState<SaleCartState>(() => {
    const init: SaleCartState = {};
    data.items.forEach((i: any) => {
      init[i.id] = { qty: 0, isDamaged: false };
    });
    return init;
  });
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("CASH");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const setQty = (id: string, val: number, max: number) =>
    setCart((prev) => ({
      ...prev,
      [id]: { ...prev[id], qty: Math.max(0, Math.min(val, max)) },
    }));

  const toggleDamaged = (id: string) =>
    setCart((prev) => ({
      ...prev,
      [id]: { ...prev[id], isDamaged: !prev[id].isDamaged },
    }));

  const totalRefund = useMemo(() => {
    return data.items.reduce((sum: number, item: any) => {
      const { qty } = cart[item.id] ?? { qty: 0 };
      return new Decimal(sum)
        .plus(new Decimal(item.unitPrice).times(qty))
        .toNumber();
    }, 0);
  }, [cart, data.items]);

  const selectedItems = Object.entries(cart).filter(([, v]) => v.qty > 0);
  const canSubmit = selectedItems.length > 0 && !isPending;

  const handleSubmit = () => {
    setError(null);
    const payload = selectedItems.map(([itemId, { qty, isDamaged }]) => ({
      itemId,
      quantity: qty,
      isDamaged,
    }));

    if (refundMethod === "STORE_CREDIT" && !data.customerId) {
      setError("لا يمكن إضافة رصيد لمحفظة العميل: الفاتورة غير مرتبطة بعميل مسجل");
      return;
    }

    startTransition(async () => {
      // 1. First, process the POS return (which handles inventory & basic accounting)
      // Note: We use "ACCOUNT" so the cash drawer isn't impacted
      const result = await partialRefundSale({
        saleId: data.id,
        items: payload,
        refundMethod: refundMethod === "STORE_CREDIT" ? "STORE_CREDIT" : "CASH",
        csrfToken,
      });

      if (!result?.success) {
        setError((result as any)?.error ?? "فشل تنفيذ المرتجع");
        return;
      }

      // 2. If STORE_CREDIT, explicitly top up the customer wallet
      if (refundMethod === "STORE_CREDIT" && data.customerId) {
        const creditRes = await issueStoreCredit({
          sourceId: data.id,
          customerId: data.customerId,
          amount: totalRefund,
          csrfToken,
        });
        if (!creditRes.success) {
          setError(`تم الإرجاع، لكن فشل إضافة الرصيد للمحفظة: ${creditRes.error}`);
          return;
        }
      }

      onSuccess(
        result.message ?? `تم الإرجاع بمبلغ ${totalRefund.toFixed(2)} ج.م`
      );
    });
  };

  return (
    <CartWrapper>
      {/* Items Table */}
      <ItemsTable>
        <TableHead
          cols={["الصنف", "الكمية الأصلية", "المتاح", "السعر", "الكمية المرتجعة", "الحالة"]}
        />
        <tbody>
          {data.items.map((item: any) => {
            const available = item.quantity - item.refundedQty;
            const isService = item.itemType === "SERVICE";
            return (
              <tr
                key={item.id}
                className="border-t border-white/5 hover:bg-white/[0.015] transition-colors"
              >
                <td className="py-3 px-4">
                  <p className="text-zinc-200 font-medium">{item.productName}</p>
                  <p className="text-zinc-500 text-xs font-mono">{item.sku}</p>
                  {isService && (
                    <span className="mt-1 inline-block text-[10px] bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded">
                      خدمة
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-zinc-400 font-mono text-sm">
                  {item.quantity}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`font-mono text-sm ${available > 0 ? "text-zinc-200" : "text-red-400"}`}
                  >
                    {available}
                  </span>
                </td>
                <td className="py-3 px-4 text-zinc-300 font-mono text-sm">
                  {item.unitPrice.toFixed(2)}
                </td>
                <td className="py-3 px-4">
                  <QtyInput
                    value={cart[item.id]?.qty ?? 0}
                    max={available}
                    disabled={available === 0}
                    onChange={(v: number) => setQty(item.id, v, available)}
                  />
                </td>
                <td className="py-3 px-4">
                  {!isService && (
                    <button
                      onClick={() => toggleDamaged(item.id)}
                      disabled={available === 0 || (cart[item.id]?.qty ?? 0) === 0}
                      className={`
                        flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium
                        transition-all border
                        ${
                          cart[item.id]?.isDamaged
                            ? "border-red-500/50 bg-red-500/15 text-red-400"
                            : "border-white/10 bg-white/5 text-zinc-500 hover:text-zinc-300"
                        }
                        disabled:opacity-30 disabled:cursor-not-allowed
                      `}
                    >
                      <AlertTriangle size={12} />
                      {cart[item.id]?.isDamaged ? "تالف (Defective)" : "سليم (Good)"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </ItemsTable>

      {/* Refund Method */}
      <div className="px-4 py-4 border-t border-white/8">
        <p className="text-xs text-zinc-500 mb-3 font-medium uppercase tracking-wide">
          طريقة الاسترداد
        </p>
        <div className="flex gap-3">
          <RefundMethodBtn
            active={refundMethod === "CASH"}
            icon={<Banknote size={16} />}
            label="استرداد نقدي"
            sublabel="Cash"
            onClick={() => setRefundMethod("CASH")}
          />
          <RefundMethodBtn
            active={refundMethod === "STORE_CREDIT"}
            icon={<CreditCard size={16} />}
            label="إضافة لمحفظة العميل"
            sublabel="Store Credit"
            onClick={() => setRefundMethod("STORE_CREDIT")}
          />
        </div>
      </div>

      <CartFooter
        totalRefund={totalRefund}
        error={error}
        isPending={isPending}
        canSubmit={canSubmit}
        onSubmit={handleSubmit}
        submitLabel="تنفيذ مرتجع المبيعات"
      />
    </CartWrapper>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PURCHASE RETURN CART
// ══════════════════════════════════════════════════════════════════════════════

function PurchaseReturnCart({
  data,
  csrfToken,
  onSuccess,
}: {
  data: FetchedPurchase;
  csrfToken: string;
  onSuccess: (msg: string) => void;
}) {
  const [cart, setCart] = useState<PurchaseCartState>(() => {
    const init: PurchaseCartState = {};
    data.items.forEach((i: any) => {
      init[i.id] = { qty: 0 };
    });
    return init;
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const setQty = (id: string, val: number, max: number) =>
    setCart((prev) => ({
      ...prev,
      [id]: { qty: Math.max(0, Math.min(val, max)) },
    }));

  const totalRefund = useMemo(() => {
    return data.items.reduce((sum: number, item: any) => {
      const { qty } = cart[item.id] ?? { qty: 0 };
      return new Decimal(sum)
        .plus(new Decimal(item.unitCost).times(qty))
        .toNumber();
    }, 0);
  }, [cart, data.items]);

  const selectedItems = Object.entries(cart).filter(([, v]) => v.qty > 0);
  const canSubmit = selectedItems.length > 0 && !isPending;

  const handleSubmit = () => {
    setError(null);
    const payload = selectedItems.map(([itemId, { qty }]) => ({
      itemId,
      quantity: qty,
    }));

    startTransition(async () => {
      const result = await partialReturnPurchase({
        purchaseId: data.id,
        items: payload,
        csrfToken,
      });
      if (result?.success) {
        onSuccess(
          result.message ?? `تم الإرجاع بمبلغ ${totalRefund.toFixed(2)} ج.م`
        );
      } else {
        setError((result as any)?.error ?? "فشل تنفيذ المرتجع");
      }
    });
  };

  return (
    <CartWrapper>
      {/* Info Banner */}
      <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-sky-500/25 bg-sky-500/8 px-4 py-3 text-sm text-sky-300">
        <CreditCard size={16} className="shrink-0" />
        <span>
          سيتم خصم إجمالي المرتجع من حساب المورد تلقائياً — لا يوجد استرداد
          نقدي في مرتجعات المشتريات
        </span>
      </div>

      {/* Items Table */}
      <ItemsTable>
        <TableHead
          cols={["الصنف", "الكمية الأصلية", "المتاح", "التكلفة", "الكمية المرتجعة"]}
        />
        <tbody>
          {data.items.map((item: PurchaseLineItem) => {
            const available = item.quantity - item.returnedQty;
            return (
              <tr
                key={item.id}
                className="border-t border-white/5 hover:bg-white/[0.015] transition-colors"
              >
                <td className="py-3 px-4">
                  <p className="text-zinc-200 font-medium">{item.productName}</p>
                  <p className="text-zinc-500 text-xs font-mono">{item.sku}</p>
                </td>
                <td className="py-3 px-4 text-zinc-400 font-mono text-sm">
                  {item.quantity}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`font-mono text-sm ${available > 0 ? "text-zinc-200" : "text-red-400"}`}
                  >
                    {available}
                  </span>
                </td>
                <td className="py-3 px-4 text-zinc-300 font-mono text-sm">
                  {item.unitCost.toFixed(2)}
                </td>
                <td className="py-3 px-4">
                  <QtyInput
                    value={cart[item.id]?.qty ?? 0}
                    max={available}
                    disabled={available === 0}
                    onChange={(v: number) => setQty(item.id, v, available)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </ItemsTable>

      <CartFooter
        totalRefund={totalRefund}
        totalLabel="إجمالي خصم المورد"
        error={error}
        isPending={isPending}
        canSubmit={canSubmit}
        onSubmit={handleSubmit}
        submitLabel="تنفيذ مرتجع المشتريات"
        submitColor="sky"
      />
    </CartWrapper>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAINTENANCE RETURN CART
// ══════════════════════════════════════════════════════════════════════════════

function MaintenanceReturnCart({
  data,
  csrfToken,
  onSuccess,
}: {
  data: FetchedTicket;
  csrfToken: string;
  onSuccess: (msg: string) => void;
}) {
  const [cart, setCart] = useState<SaleCartState>(() => {
    const init: SaleCartState = {};
    data.items.forEach((i: any) => {
      init[i.id] = { qty: 0, isDamaged: false };
    });
    return init;
  });
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("CASH");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const locale = useLocale();

  const setQty = (id: string, val: number, max: number) =>
    setCart((prev) => ({
      ...prev,
      [id]: { ...prev[id], qty: Math.max(0, Math.min(val, max)) },
    }));

  const toggleDamaged = (id: string, isService: boolean) => {
    if (isService) return; // Services cannot be flagged as damaged
    setCart((prev) => ({
      ...prev,
      [id]: { ...prev[id], isDamaged: !prev[id].isDamaged },
    }));
  };

  const totalRefund = useMemo(() => {
    return data.items.reduce((sum: number, item: any) => {
      const { qty } = cart[item.id] ?? { qty: 0 };
      return new Decimal(sum)
        .plus(new Decimal(item.unitPrice).times(qty))
        .toNumber();
    }, 0);
  }, [cart, data.items]);

  const selectedItems = Object.entries(cart).filter(([, v]) => v.qty > 0);
  const canSubmit = selectedItems.length > 0 && !isPending;

  const handleFinancialRefund = () => {
    setError(null);
    const payload = selectedItems.map(([itemId, { qty, isDamaged }]) => ({
      itemId,
      quantity: qty,
      isDamaged,
    }));

    if (refundMethod === "STORE_CREDIT" && !data.customerId) {
      setError("لا يمكن إضافة رصيد للمحفظة: التذكرة غير مرتبطة بعميل مسجل");
      return;
    }

    startTransition(async () => {
      // Use partialRefundSale since maintenance tickets share financial flow
      const result = await partialRefundSale({
        saleId: data.id,
        items: payload,
        refundMethod: refundMethod === "STORE_CREDIT" ? "STORE_CREDIT" : "CASH",
        csrfToken,
      });

      if (!result?.success) {
        setError((result as any)?.error ?? "فشل تنفيذ الاسترداد");
        return;
      }

      // If STORE_CREDIT selected, explicitly load the customer wallet
      if (refundMethod === "STORE_CREDIT" && data.customerId) {
        const creditRes = await issueStoreCredit({
          sourceId: data.id,
          customerId: data.customerId,
          amount: totalRefund,
          reason: "استرداد تذكرة صيانة",
          csrfToken,
        });
        if (!creditRes.success) {
          setError(`تم الاسترداد كنقاط نظامية، لكن فشل شحن المحفظة: ${creditRes.error}`);
          return;
        }
      }

      onSuccess(
        result.message ?? `تم استرداد مبلغ ${totalRefund.toFixed(2)} ج.م`
      );
    });
  };

  const handleReworkRedirect = () => {
    router.push(`/${locale}/tickets/new?rework=${data.id}`);
  };

  return (
    <CartWrapper>
      {/* Rework shortcut banner */}
      <div className="mx-4 mt-4">
        <button
          onClick={handleReworkRedirect}
          className="
            w-full flex items-center justify-between
            rounded-xl border border-violet-500/30 bg-violet-500/8
            px-4 py-3 text-sm text-violet-300
            hover:bg-violet-500/15 transition-colors group
          "
        >
          <div className="flex items-center gap-2">
            <ShieldX size={16} />
            <span>إنشاء تذكرة ضمان (Rework Ticket)</span>
          </div>
          <ExternalLink
            size={14}
            className="opacity-50 group-hover:opacity-100 transition-opacity"
          />
        </button>
      </div>

      <div className="px-4 mt-4">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <hr className="flex-1 border-white/10" />
          <span>أو تنفيذ استرداد مالي</span>
          <hr className="flex-1 border-white/10" />
        </div>
      </div>

      {/* Items Table */}
      <ItemsTable>
        <TableHead
          cols={["البند", "الكمية الأصلية", "المتاح", "السعر", "الكمية المرتجعة", "الحالة"]}
        />
        <tbody>
          {data.items.map((item: TicketLineItem) => {
            const available = item.quantity - item.refundedQty;
            const isService = item.itemType === "SERVICE";
            const label =
              item.itemType === "SERVICE"
                ? (item as any).description
                : (item as any).partName;
            const skuOrId =
              item.itemType === "PRODUCT" ? (item as any).sku : "—";

            return (
              <tr
                key={item.id}
                className="border-t border-white/5 hover:bg-white/[0.015] transition-colors"
              >
                <td className="py-3 px-4">
                  <p className="text-zinc-200 font-medium">{label}</p>
                  <p className="text-zinc-500 text-xs font-mono">{skuOrId}</p>
                  {isService && (
                    <span className="mt-1 inline-block text-[10px] bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded">
                      خدمة
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-zinc-400 font-mono text-sm">
                  {item.quantity}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`font-mono text-sm ${available > 0 ? "text-zinc-200" : "text-red-400"}`}
                  >
                    {available}
                  </span>
                </td>
                <td className="py-3 px-4 text-zinc-300 font-mono text-sm">
                  {item.unitPrice.toFixed(2)}
                </td>
                <td className="py-3 px-4">
                  <QtyInput
                    value={cart[item.id]?.qty ?? 0}
                    max={available}
                    disabled={available === 0}
                    onChange={(v: number) => setQty(item.id, v, available)}
                  />
                </td>
                <td className="py-3 px-4">
                  {!isService && (
                    <button
                      onClick={() => toggleDamaged(item.id, isService)}
                      disabled={
                        available === 0 || (cart[item.id]?.qty ?? 0) === 0
                      }
                      className={`
                        flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium
                        transition-all border
                        ${
                          cart[item.id]?.isDamaged
                            ? "border-red-500/50 bg-red-500/15 text-red-400"
                            : "border-white/10 bg-white/5 text-zinc-500 hover:text-zinc-300"
                        }
                        disabled:opacity-30 disabled:cursor-not-allowed
                      `}
                    >
                      <AlertTriangle size={12} />
                      {cart[item.id]?.isDamaged ? "تالف (Defective)" : "سليم (Good)"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </ItemsTable>

      {/* Refund Method */}
      <div className="px-4 py-4 border-t border-white/8">
        <p className="text-xs text-zinc-500 mb-3 font-medium uppercase tracking-wide">
          طريقة الاسترداد
        </p>
        <div className="flex gap-3">
          <RefundMethodBtn
            active={refundMethod === "CASH"}
            icon={<Banknote size={16} />}
            label="استرداد نقدي"
            sublabel="Cash"
            onClick={() => setRefundMethod("CASH")}
          />
          <RefundMethodBtn
            active={refundMethod === "STORE_CREDIT"}
            icon={<CreditCard size={16} />}
            label="إضافة لمحفظة العميل"
            sublabel="Store Credit"
            onClick={() => setRefundMethod("STORE_CREDIT")}
          />
        </div>
      </div>

      <CartFooter
        totalRefund={totalRefund}
        error={error}
        isPending={isPending}
        canSubmit={canSubmit}
        onSubmit={handleFinancialRefund}
        submitLabel="تنفيذ الاسترداد المالي"
        submitColor="violet"
      />
    </CartWrapper>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Shared Sub-components
// ══════════════════════════════════════════════════════════════════════════════

function CartWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      {children}
    </div>
  );
}

function ItemsTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-white/10 bg-white/[0.02]">
        {cols.map((col) => (
          <th
            key={col}
            className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500"
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function QtyInput({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number;
  max: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 0}
        className="w-7 h-7 rounded-lg border border-white/10 bg-white/5 text-zinc-300
          hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed
          flex items-center justify-center text-base leading-none transition-colors"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-14 text-center rounded-lg border border-white/10 bg-white/5
          py-1 text-sm text-zinc-200 font-mono
          focus:outline-none focus:ring-1 focus:ring-white/20
          disabled:opacity-30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        className="w-7 h-7 rounded-lg border border-white/10 bg-white/5 text-zinc-300
          hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed
          flex items-center justify-center text-base leading-none transition-colors"
      >
        +
      </button>
    </div>
  );
}

function RefundMethodBtn({
  active,
  icon,
  label,
  sublabel,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm
        transition-all cursor-pointer
        ${
          active
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
            : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/8 hover:text-zinc-200"
        }
      `}
    >
      <span className={active ? "text-emerald-400" : "text-zinc-500"}>
        {icon}
      </span>
      <div className="text-right">
        <p className="font-medium">{label}</p>
        <p className="text-xs opacity-60">{sublabel}</p>
      </div>
      {active && (
        <CheckCircle2 size={16} className="mr-auto text-emerald-400 shrink-0" />
      )}
    </button>
  );
}

function CartFooter({
  totalRefund,
  totalLabel = "إجمالي الاسترداد",
  error,
  isPending,
  canSubmit,
  onSubmit,
  submitLabel,
  submitColor = "emerald",
}: {
  totalRefund: number;
  totalLabel?: string;
  error: string | null;
  isPending: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  submitLabel: string;
  submitColor?: "emerald" | "sky" | "violet";
}) {
  const colorMap = {
    emerald: "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-900/40",
    sky: "bg-sky-500 hover:bg-sky-400 text-white shadow-sky-900/40",
    violet: "bg-violet-500 hover:bg-violet-400 text-white shadow-violet-900/40",
  };

  return (
    <div className="px-4 py-4 border-t border-white/8 space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500">{totalLabel}</p>
          <p className="text-2xl font-bold text-zinc-100 font-mono">
            {totalRefund.toFixed(2)}{" "}
            <span className="text-sm font-normal text-zinc-400">ج.م</span>
          </p>
        </div>

        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`
            flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold
            shadow-lg transition-all active:scale-95
            disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
            ${colorMap[submitColor]}
          `}
        >
          {isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ChevronRight size={16} />
          )}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
