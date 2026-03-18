"use server";

import { prisma } from "@/lib/prisma";
import { secureAction } from "@/lib/safe-action";
import { Decimal } from "@prisma/client/runtime/library";
import { AccountingEngine } from "@/lib/accounting/transaction-factory";
import { getCurrentUser } from "./auth";
import { PERMISSIONS } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { financialRepo } from "@/lib/repositories/financial-repo";


// ──────────────────────────────────────────────
// Types returned to the client (serialized)
// ──────────────────────────────────────────────

export interface SaleLineItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  itemType: "PRODUCT" | "SERVICE" | string;
  quantity: number;
  refundedQty: number;
  unitPrice: number;
}

export interface FetchedSale {
  id: string;
  invoiceNumber?: string | null;
  status: string;
  paymentMethod: string;
  customerName: string | null;
  customerId: string | null;
  totalAmount: number;
  createdAt: string;
  items: SaleLineItem[];
}

export interface PurchaseLineItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  returnedQty: number;
  unitCost: number;
}

export interface FetchedPurchase {
  id: string;
  invoiceNumber?: string | null;
  status: string;
  supplierName: string;
  totalAmount: number;
  purchaseDate: string;
  items: PurchaseLineItem[];
}

export interface TicketPartItem {
  id: string;
  partId: string;
  partName: string;
  sku: string;
  quantity: number;
  refundedQty: number;
  unitPrice: number;
  itemType: "PRODUCT";
}

export interface TicketServiceItem {
  id: string;
  description: string;
  quantity: number;
  refundedQty: number;
  unitPrice: number;
  itemType: "SERVICE";
}

export type TicketLineItem = TicketPartItem | TicketServiceItem;

export interface FetchedTicket {
  id: string;
  ticketNumber?: string | null;
  status: string;
  customerName: string | null;
  customerId: string | null;
  totalAmount: number;
  createdAt: string;
  items: TicketLineItem[];
}

// ──────────────────────────────────────────────
// Fetchers
// ──────────────────────────────────────────────

export async function getSaleById(
  id: string
): Promise<{ success: boolean; data?: FetchedSale; error?: string }> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { name: true, sku: true } },
          },
        },
      },
    });

    if (!sale) return { success: false, error: "الفاتورة غير موجودة" };

    return {
      success: true,
      data: {
        id: sale.id,
        invoiceNumber: (sale as any).invoiceNumber ?? null,
        status: sale.status,
        paymentMethod: sale.paymentMethod,
        customerName: sale.customerName ?? null,
        customerId: (sale as any).customerId ?? null,
        totalAmount: Number(sale.totalAmount),
        createdAt: sale.createdAt.toISOString(),
        items: sale.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          productName: (i as any).product?.name ?? "—",
          sku: (i as any).product?.sku ?? "—",
          itemType: (i as any).itemType ?? "PRODUCT",
          quantity: i.quantity,
          refundedQty: (i as any).refundedQty ?? 0,
          unitPrice: Number(i.unitPrice),
        })),
      },
    };
  } catch (err: any) {
    console.error("[getSaleById]", err);
    return { success: false, error: err.message };
  }
}

export async function getPurchaseById(
  id: string
): Promise<{ success: boolean; data?: FetchedPurchase; error?: string }> {
  try {
    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
      include: {
        supplier: { select: { name: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
    });

    if (!invoice) return { success: false, error: "أمر الشراء غير موجود" };

    return {
      success: true,
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber ?? null,
        status: invoice.status,
        supplierName: invoice.supplier.name,
        totalAmount: Number(invoice.totalAmount),
        purchaseDate: invoice.purchaseDate.toISOString(),
        items: invoice.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          productName: (i as any).product?.name ?? "—",
          sku: (i as any).product?.sku ?? "—",
          quantity: i.quantity,
          returnedQty: (i as any).returnedQty ?? 0,
          unitCost: Number(i.unitCost),
        })),
      },
    };
  } catch (err: any) {
    console.error("[getPurchaseById]", err);
    return { success: false, error: err.message };
  }
}

export async function getTicketById(
  id: string
): Promise<{ success: boolean; data?: FetchedTicket; error?: string }> {
  try {
    const ticket = await (prisma as any).ticket.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        parts: {
          include: {
            product: { select: { name: true, sku: true } },
          },
        },
      },
    });

    if (!ticket) return { success: false, error: "التذكرة غير موجودة" };

    const partItems: TicketLineItem[] = (ticket.parts ?? []).map((p: any) => ({
      id: p.id,
      partId: p.productId,
      partName: p.product?.name ?? p.name ?? "—",
      sku: p.product?.sku ?? "—",
      quantity: p.quantity,
      refundedQty: p.refundedQty ?? 0,
      unitPrice: Number(p.price ?? 0),
      itemType: "PRODUCT" as const,
    }));

    // In desktop schema, services might be simple entries or not existing as a separate model
    // Let's assume maintenance costs are in RepairPrice
    const serviceItems: TicketLineItem[] = [];
    if (Number(ticket.repairPrice) > 0) {
       serviceItems.push({
          id: `SVC-${ticket.id}`,
          description: "تكلفة الإصلاح (المصنعية)",
          quantity: 1,
          refundedQty: 0,
          unitPrice: Number(ticket.repairPrice),
          itemType: "SERVICE" as const,
       });
    }

    const total = Number(ticket.totalAmount ?? 0);

    return {
      success: true,
      data: {
        id: ticket.id,
        ticketNumber: ticket.barcode ?? null,
        status: ticket.status,
        customerName: ticket.customer?.name ?? (ticket as any).customerName ?? null,
        customerId: (ticket as any).customerId ?? null,
        totalAmount: total,
        createdAt: ticket.createdAt.toISOString(),
        items: [...partItems, ...serviceItems],
      },
    };
  } catch (err: any) {
    console.error("[getTicketById]", err);
    return { success: false, error: err.message };
  }
}

// ──────────────────────────────────────────────
// Store Credit (Wallet Top-up)
// ──────────────────────────────────────────────

/**
 * Issues a store credit (محفظة العميل) for a return.
 * Decrements customer.balance (positive = owes us; negative = we owe them).
 * Creates a CREDIT CustomerTransaction + accounting journal entry.
 */
export const issueStoreCredit = secureAction(
  async (data: {
    sourceId: string;
    customerId: string;
    amount: number;
    reason?: string;
    csrfToken?: string;
  }) => {
    const { sourceId, customerId, amount, reason } = data;
    if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");

    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const amountDecimal = new Decimal(amount);

    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true },
      });
      if (!customer) throw new Error("العميل غير موجود في النظام");

      // 1. CustomerTransaction — type CREDIT - with auto journal
      await financialRepo.createCustomerTransaction(tx, {
        customerId,
        type: "CREDIT",
        amount: amountDecimal,
        description:
          `رصيد مرتجع (Store Credit) — مرجع: ${sourceId.slice(0, 8).toUpperCase()}` +
          (reason ? ` | ${reason}` : ""),
        reference: sourceId,
        createdBy: currentUser.id,
        branchId: currentUser.branchId || null
      });

      // 2. Decrement balance (credit = we owe customer)
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: { decrement: amountDecimal } },
      });

      // 3. Double-entry — Debit Revenue / Credit Customer Liability
      await AccountingEngine.recordTransaction(
        {
          description: `Store Credit — ${sourceId.slice(0, 8).toUpperCase()}`,
          reference: sourceId,
          branchId: currentUser.branchId ?? undefined,
          lines: [
            {
              accountCode: "4000",
              debit: amount,
              credit: 0,
              description: "Sales Revenue Reversed (Store Credit)",
            },
            {
              accountCode: "2150",
              debit: 0,
              credit: amount,
              description: "Customer Wallet Liability",
            },
          ],
        },
        tx
      );

      // 4. Audit
      await (tx as any).actionLog.create({
        data: {
          action: "STORE_CREDIT_ISSUED",
          details: `Amount: ${amount}, Source: ${sourceId}, Reason: ${reason ?? "Return"}`,
          userId: currentUser.id,
          branchId: currentUser.branchId,
        },
      });
    });

    revalidatePath("/returns");

    return {
      success: true,
      message: `تم إضافة ${amount.toFixed(2)} ج.م لمحفظة العميل`,
    };
  },
  { permission: PERMISSIONS.POS_ACCESS }
);

// ──────────────────────────────────────────────
// Rework Pre-fill Fetcher
// ──────────────────────────────────────────────

export interface ReworkPrefill {
  originalTicketNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deviceBrand: string;
  deviceModel: string;
  deviceImei?: string;
  deviceColor?: string;
  issueDescription: string;
}

export async function getTicketForRework(
  ticketId: string
): Promise<{ success: boolean; data?: ReworkPrefill; error?: string }> {
  try {
    const ticket = await (prisma as any).ticket.findFirst({
      where: {
        OR: [
          { id: ticketId },
          { barcode: { equals: ticketId } },
        ],
      },
      select: {
        barcode: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        deviceBrand: true,
        deviceModel: true,
        deviceImei: true,
        deviceColor: true,
        issueDescription: true,
      },
    });

    if (!ticket) return { success: false, error: "التذكرة الأصلية غير موجودة" };

    return {
      success: true,
      data: {
        originalTicketNumber: ticket.barcode,
        customerName: ticket.customerName ?? "",
        customerPhone: ticket.customerPhone ?? "",
        customerEmail: ticket.customerEmail ?? undefined,
        deviceBrand: ticket.deviceBrand ?? "",
        deviceModel: ticket.deviceModel ?? "",
        deviceImei: ticket.deviceImei ?? undefined,
        deviceColor: ticket.deviceColor ?? undefined,
        issueDescription: `إعادة إصلاح ضمان — الأصل: ${ticket.barcode} | ${ticket.issueDescription ?? ""}`,
      },
    };
  } catch (err: any) {
    console.error("[getTicketForRework]", err);
    return { success: false, error: err.message };
  }
}
// ──────────────────────────────────────────────
// Advanced Search Fetcher
// ──────────────────────────────────────────────

export interface SearchResult {
  id: string;
  label: string; // Displayed in the combobox (e.g., "#INV-001 - Name")
  subLabel: string; // (e.g., "0123456789 | 2024-01-01")
  total: number;
  customerName: string;
  customerPhone: string;
  productName: string;
  quantity: number;
  invoiceDate: string;
  unitPrice: number;
  referenceNumber: string;
}

export async function searchReturns(
  type: "SALES" | "PURCHASES" | "MAINTENANCE",
  query: string,
  startDate?: string,
  endDate?: string
): Promise<{ success: boolean; data: SearchResult[] }> {
  try {
    const q = query.trim();
    // If no query and no dates, return empty
    if (!q && !startDate && !endDate) return { success: true, data: [] };

    let results: SearchResult[] = [];
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const hasDates = Object.keys(dateFilter).length > 0;

    if (type === "SALES") {
      const sales = await prisma.sale.findMany({
        where: {
          AND: [
             hasDates ? { createdAt: dateFilter } : {},
             q ? {
               OR: [
                 { id: { contains: q } },
                 { customerName: { contains: q } },
                 { customerPhone: { contains: q } },
                 { items: { some: { product: { name: { contains: q } } } } },
                 { items: { some: { product: { sku: { contains: q } } } } },
               ]
             } : {}
          ]
        } as any,
        include: {
          items: {
            include: {
              product: { select: { name: true, sku: true } },
            },
          },
        },
        take: 30,
        orderBy: { createdAt: "desc" },
      });
      results = sales.flatMap((s) => {
        const items = s.items.length > 0 ? s.items : [null];
        return items.map((item: any) => ({
          id: s.id,
          label: `${s.customerName ?? s.id.slice(0, 8)}`,
          subLabel: `${s.customerPhone ?? ""} | ${s.createdAt.toLocaleDateString()}`,
          total: Number(s.totalAmount),
          customerName: s.customerName ?? "—",
          customerPhone: s.customerPhone ?? "—",
          productName: item?.product?.name ?? "—",
          quantity: item?.quantity ?? 0,
          invoiceDate: s.createdAt.toISOString(),
          unitPrice: Number(item?.unitPrice ?? 0),
          referenceNumber: (s as any).invoiceNumber ?? s.id.slice(0, 8).toUpperCase(),
        }));
      });
    } else if (type === "PURCHASES") {
      const purchases = await prisma.purchaseInvoice.findMany({
        where: {
          AND: [
            hasDates ? { purchaseDate: dateFilter } : {},
            q ? {
              OR: [
                { id: { contains: q } },
                { invoiceNumber: { contains: q } },
                { supplier: { name: { contains: q } } },
                { items: { some: { product: { name: { contains: q } } } } },
                { items: { some: { product: { sku: { contains: q } } } } },
              ]
            } : {}
          ]
        },
        include: {
          supplier: true,
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
        take: 30,
        orderBy: { purchaseDate: "desc" },
      });
      results = purchases.flatMap((p) => {
        const items = p.items.length > 0 ? p.items : [null];
        return items.map((item: any) => ({
          id: p.id,
          label: `${p.invoiceNumber ?? p.id.slice(0, 8)} - ${p.supplier.name}`,
          subLabel: p.purchaseDate.toLocaleDateString(),
          total: Number(p.totalAmount),
          customerName: p.supplier.name,
          customerPhone: "—",
          productName: item?.product?.name ?? "—",
          quantity: item?.quantity ?? 0,
          invoiceDate: p.purchaseDate.toISOString(),
          unitPrice: Number(item?.unitCost ?? 0),
          referenceNumber: p.invoiceNumber ?? p.id.slice(0, 8).toUpperCase(),
        }));
      });
    } else if (type === "MAINTENANCE") {
      const tickets = await (prisma as any).ticket.findMany({
        where: {
          AND: [
            hasDates ? { createdAt: dateFilter } : {},
            q ? {
              OR: [
                { id: { contains: q } },
                { barcode: { contains: q } },
                { customerName: { contains: q } },
                { customerPhone: { contains: q } },
                { parts: { some: { product: { name: { contains: q } } } } },
                { parts: { some: { product: { sku: { contains: q } } } } },
              ]
            } : {}
          ]
        } as any,
        include: {
          parts: {
            include: {
              product: { select: { name: true, sku: true } },
            },
          },
        },
        take: 30,
        orderBy: { createdAt: "desc" },
      });
      results = tickets.flatMap((t: any) => {
        const parts = Array.isArray(t.parts) && t.parts.length > 0
          ? t.parts
          : [{
              quantity: 1,
              price: Number(t.repairPrice ?? 0),
              product: { name: "خدمة صيانة", sku: "SERVICE" }
            }];
        return parts.map((part: any) => ({
          id: t.id,
          label: `${t.Barcode ?? t.barcode ?? t.id.slice(0, 8)} - ${t.customerName ?? "—"}`,
          subLabel: `${t.customerPhone ?? ""} | ${t.createdAt.toLocaleDateString()}`,
          total: Number(t.totalAmount ?? 0),
          customerName: t.customerName ?? "—",
          customerPhone: t.customerPhone ?? "—",
          productName: part.product?.name ?? part.name ?? "—",
          quantity: Number(part.quantity ?? 0),
          invoiceDate: new Date(t.createdAt).toISOString(),
          unitPrice: Number(part.price ?? t.repairPrice ?? 0),
          referenceNumber: t.barcode ?? t.id.slice(0, 8).toUpperCase(),
        }));
      });
    }

    return { success: true, data: results };
  } catch (err: any) {
    console.error("[searchReturns]", err);
    return { success: false, data: [] };
  }
}
