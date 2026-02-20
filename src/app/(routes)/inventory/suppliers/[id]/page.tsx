import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/actions/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getTranslations } from "@/lib/i18n-mock";
import { ArrowLeft, Phone, Mail, MapPin, Wallet, TrendingUp, History, Receipt, CreditCard } from "lucide-react";
import Link from "next/link";
import SupplierHistoryTable from "@/components/inventory/SupplierHistoryTable";
import SupplierActions from "@/components/inventory/SupplierActions";

// Type definition for merged transaction
interface Transaction {
    id: string;
    date: Date;
    type: 'INVOICE' | 'PAYMENT';
    reference: string;
    amount: number;
    status: string;
    isCredit: boolean;
    method?: string;
    items?: {
        name: string;
        sku: string;
        category: string;
        quantity: number;
        unitCost: number;
    }[];
}



export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // 1. Security Check
    const user = await getCurrentUser();
    if (!user || !hasPermission(user.permissions, PERMISSIONS.INVENTORY_VIEW)) {
        redirect('/unauthorized');
    }

    // 2. Fetch Supplier Data
    const supplier = await prisma.supplier.findUnique({
        where: { id },
        include: {
            _count: {
                select: { invoices: true, payments: true }
            }
        }
    });

    if (!supplier) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold text-red-500">Supplier Not Found</h2>
                <Link href="/inventory" className="text-cyan-500 hover:underline mt-4 block">
                    &larr; Back to Inventory
                </Link>
            </div>
        );
    }

    // 3. Fetch History (Last 50 Transactions)
    // We fetch Invoices and Payments separately then merge, as Union queries in Prisma are tricky
    const [invoices, payments] = await Promise.all([
        prisma.purchaseInvoice.findMany({
            where: { supplierId: id },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                category: true
                            }
                        }
                    }
                }
            }
        }),
        prisma.supplierPayment.findMany({
            where: { supplierId: id },
            orderBy: { paymentDate: 'desc' },
            take: 50
        })
    ]);

    // 4. Merge and Sort
    const transactions: Transaction[] = [
        ...invoices.map(inv => ({
            id: inv.id,
            date: inv.createdAt,
            type: 'INVOICE' as const,
            reference: inv.invoiceNumber || 'INV-???',
            amount: inv.totalAmount.toNumber(),
            status: inv.status,
            isCredit: false,
            items: inv.items.map(item => ({
                name: item.product.name,
                sku: item.product.sku,
                category: item.product.category.name,
                quantity: item.quantity,
                unitCost: item.unitCost.toNumber()
            }))
        })),


        ...payments.map(pay => ({
            id: pay.id,
            date: pay.paymentDate,
            type: 'PAYMENT' as const,
            reference: 'PAYMENT',
            amount: pay.amount.toNumber(),
            status: 'COMPLETED',
            isCredit: true,
            method: pay.method
        }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 50); // Hard limit combined list to 50 for now

    const stats = {
        totalInvoices: supplier._count.invoices,
        totalPayments: supplier._count.payments,
        averageInvoice: invoices.length > 0
            ? invoices.reduce((acc, i) => acc + i.totalAmount.toNumber(), 0) / invoices.length
            : 0
    };

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
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Current Balance</h3>
                        <div className={`p-2 rounded-lg ${supplier.balance.toNumber() > 0 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                            <Wallet className="w-5 h-5" />
                        </div>
                    </div>
                    <div className={`text-3xl font-mono font-bold ${supplier.balance.toNumber() > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        ${supplier.balance.toNumber().toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        {supplier.balance.toNumber() > 0 ? "Amount owed to supplier" : "No outstanding debt"}
                    </p>
                </div>

                {/* Stats Card 1 */}
                <div className="glass-card p-6 border border-border rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Total Invoices</h3>
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                            <Receipt className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">
                        {stats.totalInvoices}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Lifetime invoices
                    </p>
                </div>

                {/* Stats Card 2 */}
                <div className="glass-card p-6 border border-border rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Avg. Invoice</h3>
                        <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">
                        ${stats.averageInvoice.toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Average transaction size
                    </p>
                </div>
            </div>

            {/* Main Content Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Actions & Details */}
                <div className="space-y-6">
                    <SupplierActions
                        supplierId={supplier.id}
                        supplierName={supplier.name}
                        balance={supplier.balance.toNumber()}
                        phone={supplier.phone}
                        email={supplier.email}
                        address={supplier.address}
                        transactions={transactions}
                    />
                </div>

                {/* Right: History Table (Spans 2 cols) */}
                <div className="lg:col-span-2 space-y-4">
                    <h3 className="font-bold text-xl flex items-center gap-2">
                        <History className="w-5 h-5 text-indigo-400" />
                        Transaction History
                    </h3>

                    <SupplierHistoryTable transactions={transactions} />
                </div>
            </div>
        </div>
    );
}
