import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/actions/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "@/lib/i18n-mock";
import { getCSRFToken } from "@/lib/csrf";
import { toNumber } from "@/lib/decimal-utils";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, MapPin, Wallet, TrendingUp, History, Receipt } from "lucide-react";
import SupplierHistoryTable from "@/components/inventory/SupplierHistoryTable";

export const dynamic = 'force-dynamic';

interface Props {
    params: Promise<{ id: string }>;
}

export type TransactionType = 'INVOICE' | 'PAYMENT' | 'SALE';

export interface Transaction {
    id: string;
    date: Date;
    type: TransactionType;
    reference: string;
    amount: number;
    status: string;
    isCredit: boolean;
    balanceAfter?: number;
    method?: string;
    warehouseId?: string;
    items?: Array<{
        id: string;
        name: string;
        sku: string;
        category: string;
        quantity: number;
        unitCost: number;
        returnedQty: number;
        product?: {
            name: string;
            stocks: Array<{
                warehouseId: string;
                quantity: number;
            }>;
        };
    }>;
}

export default async function SupplierDetailPage({ params }: Props) {
    const { id } = await params;

    // 1. Fetch Supplier Base Info
    const supplier = await prisma.supplier.findUnique({
        where: { id },
        include: {
            linkedUser: true
        }
    });

    if (!supplier) {
        notFound();
    }

    // 2. Fetch User Permissions (Mocked or actual)
    const permissions = {
        canEdit: true,
        canDelete: true,
        canRecordPayment: true,
    };

    // 3. Fetch all history components in parallel
    const [invoices, payments, sales, warehouses] = await Promise.all([
        prisma.purchaseInvoice.findMany({
            where: { supplierId: id },
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                category: true,
                                stocks: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        }),
        prisma.supplierPayment.findMany({
            where: { supplierId: id },
            orderBy: { paymentDate: 'desc' }
        }),
        supplier.linkedUserId ? prisma.sale.findMany({
            where: { customerId: supplier.linkedUserId },
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                category: true,
                                stocks: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        }) : Promise.resolve([]),
        prisma.warehouse.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true }
        })
    ]);

    // 4. Merge and Sort
    const transactions: Transaction[] = [
        ...invoices.map(inv => ({
            id: inv.id,
            date: inv.createdAt,
            type: 'INVOICE' as const,
            reference: inv.invoiceNumber || 'INV-???',
            amount: toNumber(inv.totalAmount),
            status: inv.status,
            isCredit: false, // Increases Debt
            warehouseId: inv.warehouseId,
            items: inv.items.map(item => ({
                id: item.id,
                name: item.product?.name || '',
                sku: item.product?.sku || '',
                category: item.product?.category?.name || '',
                quantity: toNumber(item.quantity),
                unitCost: toNumber(item.unitCost),
                returnedQty: toNumber(item.returnedQty),
                product: {
                    name: item.product?.name || '',
                    stocks: (item.product?.stocks || []).map(s => ({
                        warehouseId: s.warehouseId,
                        quantity: toNumber(s.quantity)
                    }))
                }
            }))
        })),
        ...payments
            .filter(pay => pay.method !== 'SALE_OFFSET')
            .map(pay => ({
                id: pay.id,
                date: pay.paymentDate,
                type: 'PAYMENT' as const,
                reference: 'PAYMENT',
                amount: toNumber(pay.amount),
                status: 'COMPLETED',
                isCredit: true, // Reduces Debt
                method: pay.method
            })),
        ...sales.map(sale => ({
            id: sale.id,
            date: sale.createdAt,
            type: 'SALE' as const,
            reference: sale.id.split('-')[0].toUpperCase(),
            amount: toNumber(sale.totalAmount),
            status: sale.status,
            isCredit: true, // Reduces Debt
            method: sale.paymentMethod,
            items: sale.items.map(item => ({
                id: item.id,
                name: item.product?.name || '',
                sku: item.product?.sku || '',
                category: item.product?.category?.name || '',
                quantity: toNumber(item.quantity),
                unitCost: toNumber(item.unitPrice),
                returnedQty: toNumber(item.refundedQty),
                product: {
                    name: item.product?.name || '',
                    stocks: (item.product?.stocks || []).map(s => ({
                        warehouseId: s.warehouseId,
                        quantity: toNumber(s.quantity)
                    }))
                }
            }))
        }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 500);

    // 5. Calculate Running Balance
    let currentBalance = toNumber(supplier.balance);

    const transactionsWithBalance = transactions.map(tx => {
        const balanceAfterTx = currentBalance;
        if (tx.isCredit) {
            currentBalance += tx.amount; 
        } else {
            currentBalance -= tx.amount;
        }

        return {
            ...tx,
            runningBalance: balanceAfterTx
        };
    });

    const stats = {
        totalInvoices: invoices.length,
        totalPayments: payments.length,
        averageInvoice: invoices.length > 0
            ? invoices.reduce((acc, i) => acc + toNumber(i.totalAmount), 0) / invoices.length
            : 0
    };

    const csrfToken = await getCSRFToken();
    const tSuppliers = await getTranslations('Inventory.Suppliers');
    const supplierBal = toNumber(supplier.balance);

    return (
        <div className="p-6 space-y-6 w-full animate-fade-in">
            {/* Header / Nav */}
            <div className="flex items-center gap-4">
                <Link
                    href="/inventory"
                    className="p-2 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{supplier.name}</h1>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        {supplier.phone && (
                            <span className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5" /> {supplier.phone}
                            </span>
                        )}
                        {supplier.email && (
                            <span className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5" /> {supplier.email}
                            </span>
                        )}
                        {supplier.address && (
                            <span className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" /> {supplier.address}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Account Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Balance Card */}
                <div className="glass-card p-6 bg-gradient-to-br from-card to-muted/20 border border-border rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{tSuppliers('Details.currentBalance')}</h3>
                        <div className={`p-2 rounded-lg ${supplierBal > 0 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                            <Wallet className="w-5 h-5" />
                        </div>
                    </div>
                    <div className={`text-3xl font-mono font-bold ${supplierBal > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {Math.abs(supplierBal).toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        {supplierBal > 0 
                            ? tSuppliers('Details.amountOwed') 
                            : supplierBal < 0 
                                ? 'دائن لنا (رصيد مستحق)' 
                                : tSuppliers('Details.noDebt')}
                    </p>
                </div>

                {/* Stats Card 1 */}
                <div className="glass-card p-6 border border-border rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{tSuppliers('Details.totalInvoices')}</h3>
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                            <Receipt className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">
                        {stats.totalInvoices}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        {tSuppliers('Details.lifetimeInvoices')}
                    </p>
                </div>

                {/* Stats Card 2 */}
                <div className="glass-card p-6 border border-border rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{tSuppliers('Details.averageInvoice')}</h3>
                        <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">
                        ${stats.averageInvoice.toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        {tSuppliers('Details.avgTransactionSize')}
                    </p>
                </div>
            </div>

            {/* Main Content Sections */}
            <div className="space-y-4">
                <h3 className="font-bold text-xl flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-400" />
                    {tSuppliers('Details.transactionHistory')}
                </h3>

                <SupplierHistoryTable 
                    transactions={transactionsWithBalance} 
                    supplierId={supplier.id}
                    supplierName={supplier.name}
                    balance={supplierBal}
                    phone={supplier.phone}
                    email={supplier.email}
                    address={supplier.address}
                    csrfToken={csrfToken || ''}
                />
            </div>
        </div>
    );
}
