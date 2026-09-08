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
import { partialRefundTicket } from "../../../actions/ticket-actions";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "@/lib/i18n-mock";
import { Button } from "@/components/ui/button";

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
    data.items.forEach((i: SaleLineItem) => {
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

  const handleSelectAll = () => {
    const next: SaleCartState = {};
    data.items.forEach((item: SaleLineItem) => {
      const available = item.quantity - item.refundedQty;
      next[item.id] = { qty: Math.max(0, available), isDamaged: false };
    });
    setCart(next);
  };

  const handleClearAll = () => {
    const next: SaleCartState = {};
    data.items.forEach((item: SaleLineItem) => {
      next[item.id] = { qty: 0, isDamaged: false };
    });
    setCart(next);
  };

  const toggleDamaged = (id: string) =>
    setCart((prev) => ({
      ...prev,
      [id]: { ...prev[id], isDamaged: !prev[id].isDamaged },
    }));

  const totalRefund = useMemo(() => {
    return data.items.reduce((sum: number, item: SaleLineItem) => {
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
        setError(result?.error ?? result?.message ?? "فشل تنفيذ المرتجع");
        return;
      }

      onSuccess(
        result.message ?? `تم الإرجاع بمبلغ ${totalRefund.toFixed(2)} ج.م`
      );
    });
  };

  return (
    <CartWrapper>
      {/* 1-Click Select All Bar */}
      <div className="mx-4 mt-4 flex items-center justify-between gap-2 p-2 rounded-xl bg-white/[0.02] border border-white/10">
        <span className="text-xs text-zinc-400 font-bold mr-2">خيارات سريعة:</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            className="bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-xs font-bold h-8 rounded-lg"
          >
            ⚡ إرجاع كامل الفاتورة (تحديد الكل)
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-zinc-400 hover:text-zinc-200 text-xs h-8 rounded-lg"
          >
            تفريغ
          </Button>
        </div>
      </div>

      {/* Items Table */}
      <ItemsTable>
        <TableHead
          cols={["الصنف", "الكمية الأصلية", "المتاح", "السعر", "الكمية المرتجعة", "الحالة"]}
        />
        <tbody>
          {data.items.map((item: SaleLineItem) => {
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
    data.items.forEach((i: PurchaseLineItem) => {
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

  const handleSelectAll = () => {
    const next: PurchaseCartState = {};
    data.items.forEach((item: PurchaseLineItem) => {
      const available = item.quantity - item.returnedQty;
      next[item.id] = { qty: Math.max(0, available) };
    });
    setCart(next);
  };

  const handleClearAll = () => {
    const next: PurchaseCartState = {};
    data.items.forEach((item: PurchaseLineItem) => {
      next[item.id] = { qty: 0 };
    });
    setCart(next);
  };

  const totalRefund = useMemo(() => {
    return data.items.reduce((sum: number, item: PurchaseLineItem) => {
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
        setError(result?.error ?? result?.message ?? "فشل تنفيذ المرتجع");
      }
    });
  };

  return (
    <CartWrapper>
      {/* 1-Click Select All Bar */}
      <div className="mx-4 mt-4 flex items-center justify-between gap-2 p-2 rounded-xl bg-white/[0.02] border border-white/10">
        <span className="text-xs text-zinc-400 font-bold mr-2">خيارات سريعة:</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            className="bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20 text-xs font-bold h-8 rounded-lg"
          >
            ⚡ إرجاع كامل الأصناف المتاحة (تحديد الكل)
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-zinc-400 hover:text-zinc-200 text-xs h-8 rounded-lg"
          >
            تفريغ
          </Button>
        </div>
      </div>

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
    data.items.forEach((i: TicketLineItem) => {
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

  const handleSelectAll = () => {
    const next: SaleCartState = {};
    data.items.forEach((item: TicketLineItem) => {
      const available = item.quantity - item.refundedQty;
      next[item.id] = { qty: Math.max(0, available), isDamaged: false };
    });
    setCart(next);
  };

  const handleClearAll = () => {
    const next: SaleCartState = {};
    data.items.forEach((item: TicketLineItem) => {
      next[item.id] = { qty: 0, isDamaged: false };
    });
    setCart(next);
  };

  const toggleDamaged = (id: string, isService: boolean) => {
    if (isService) return; // Services cannot be flagged as damaged
    setCart((prev) => ({
      ...prev,
      [id]: { ...prev[id], isDamaged: !prev[id].isDamaged },
    }));
  };

  const { totalRefund, partsTotal, laborTotal } = useMemo(() => {
    let parts = new Decimal(0);
    let labor = new Decimal(0);
    data.items.forEach((item: TicketLineItem) => {
      const { qty } = cart[item.id] ?? { qty: 0 };
      const line = new Decimal(item.unitPrice).times(qty);
      if (item.itemType === "SERVICE") {
        labor = labor.plus(line);
      } else {
        parts = parts.plus(line);
      }
    });
    const total = parts.plus(labor);
    return {
      totalRefund: total.toNumber(),
      partsTotal: parts.toNumber(),
      laborTotal: labor.toNumber(),
    };
  }, [cart, data.items]);

  const selectedItems = Object.entries(cart).filter(([, v]) => v.qty > 0);
  const canSubmit = selectedItems.length > 0 && !isPending;

  const handleFinancialRefund = () => {
    setError(null);
    if (totalRefund > data.totalAmount) {
      setError(`المبلغ المحدد للاسترداد (${totalRefund.toFixed(2)} ج.م) يتجاوز إجمالي المبلغ المدفوع المتاح (${data.totalAmount.toFixed(2)} ج.م)`);
      return;
    }

    const payload = selectedItems.map(([itemId, { qty, isDamaged }]) => ({
      itemId,
      quantity: qty,
      isDamaged,
    }));

    if (refundMethod === "STORE_CREDIT" && !data.customerId) {
      setError("لا يمكن إضافة رصيد للمحفظة: التذكرة غير مرتبطة بعميل مسجل");
      return;
    }

    const idempotencyKey = `REF-${data.id.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    startTransition(async () => {
      const result = await partialRefundTicket({
        ticketId: data.id,
        items: payload,
        refundMethod: refundMethod === "STORE_CREDIT" ? "STORE_CREDIT" : "CASH",
        idempotencyKey,
        csrfToken,
      });

      if (!result?.success) {
        setError(result?.error ?? result?.message ?? "فشل تنفيذ الاسترداد");
        return;
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
      {/* 1-Click Action Header */}
      <div className="mx-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Rework Shortcut Banner */}
        <button
          onClick={handleReworkRedirect}
          type="button"
          className="
            flex items-center justify-between
            rounded-xl border border-violet-500/40 bg-violet-500/10
            px-4 py-3 text-sm text-violet-300 font-bold
            hover:bg-violet-500/20 hover:border-violet-400 transition-all group shadow-sm
          "
        >
          <div className="flex items-center gap-2">
            <ShieldX size={18} className="text-violet-400" />
            <span>🛡️ إنشاء تذكرة ضمان (Rework Ticket)</span>
          </div>
          <ExternalLink
            size={14}
            className="opacity-60 group-hover:opacity-100 transition-opacity"
          />
        </button>

        {/* 1-Click Select All */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-zinc-200 text-xs font-bold h-11 rounded-xl"
          >
            ⚡ تحديد الكل (استرداد كامل)
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-zinc-400 hover:text-zinc-200 text-xs h-11 rounded-xl px-3"
          >
            تفريغ
          </Button>
        </div>
      </div>

      <div className="px-4 mt-4">
        <div className="flex items-center gap-2 text-xs text-zinc-500 font-bold">
          <hr className="flex-1 border-white/10" />
          <span>بنود تذكرة الصيانة القابلة للاسترداد</span>
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
                ? item.description
                : item.partName;
            const skuOrId =
              item.itemType === "PRODUCT" ? item.sku : "—";

            return (
              <tr
                key={item.id}
                className="border-t border-white/5 hover:bg-white/[0.015] transition-colors"
              >
                <td className="py-3 px-4">
                  <p className="text-zinc-200 font-bold">{label}</p>
                  <p className="text-zinc-500 text-xs font-mono">{skuOrId}</p>
                  {isService && (
                    <span className="mt-1 inline-block text-[10px] bg-violet-500/20 text-violet-300 font-black px-2 py-0.5 rounded border border-violet-500/30">
                      أجر يد / خدمة
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-zinc-400 font-mono text-sm">
                  {item.quantity}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`font-mono text-sm font-bold ${available > 0 ? "text-emerald-400" : "text-zinc-500"}`}
                  >
                    {available}
                  </span>
                </td>
                <td className="py-3 px-4 text-zinc-300 font-mono text-sm font-bold">
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
                  {!isService ? (
                    <button
                      type="button"
                      onClick={() => toggleDamaged(item.id, isService)}
                      disabled={
                        available === 0 || (cart[item.id]?.qty ?? 0) === 0
                      }
                      className={`
                        flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold
                        transition-all border
                        ${
                          cart[item.id]?.isDamaged
                            ? "border-red-500/50 bg-red-500/20 text-red-300"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        }
                        disabled:opacity-30 disabled:cursor-not-allowed
                      `}
                    >
                      <AlertTriangle size={12} />
                      {cart[item.id]?.isDamaged ? "تالف (Defective)" : "سليم (Good)"}
                    </button>
                  ) : (
                    <span className="text-[11px] text-zinc-500 font-mono">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </ItemsTable>

      {/* Visual Breakdown of Selected Items */}
      {selectedItems.length > 0 && (
        <div className="mx-4 my-3 p-3 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between text-xs">
          <div className="flex items-center gap-4 text-zinc-300 font-bold">
            <span>قطع الغيار: <span className="text-emerald-400 font-mono">{partsTotal.toFixed(2)} ج.م</span></span>
            <span>•</span>
            <span>المصنعية: <span className="text-violet-400 font-mono">{laborTotal.toFixed(2)} ج.م</span></span>
          </div>
          <div className="text-zinc-400 font-medium">
            عدد البنود المحددة: <span className="font-mono text-white font-bold">{selectedItems.length}</span>
          </div>
        </div>
      )}

      {/* Refund Method */}
      <div className="px-4 py-4 border-t border-white/8">
        <p className="text-xs text-zinc-400 mb-3 font-bold uppercase tracking-wide">
          طريقة الاسترداد للعميل
        </p>
        <div className="flex gap-3">
          <RefundMethodBtn
            active={refundMethod === "CASH"}
            icon={<Banknote size={16} />}
            label="استرداد نقدي"
            sublabel="خصم من الدرج / الخزينة"
            onClick={() => setRefundMethod("CASH")}
          />
          <RefundMethodBtn
            active={refundMethod === "STORE_CREDIT"}
            icon={<CreditCard size={16} />}
            label="إضافة لمحفظة العميل"
            sublabel="رصيد دائن للعميل"
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
