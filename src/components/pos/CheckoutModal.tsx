
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "@/lib/i18n-mock";
import GlassModal from "../ui/GlassModal";
import { Banknote, CreditCard, Clock, Truck, Loader2, Store, User, Smartphone, ArrowRightLeft, XCircle, Shield, CalendarCheck, UserCircle, Printer, CheckCircle } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { processSale } from "@/actions/pos";
import { getBranchTreasuriesForDropdown } from "@/actions/treasury";
import { getCurrentUser } from "@/actions/auth";
import clsx from "clsx";
import ReceiptModal from "./ReceiptModal";
import { offlineDB } from "@/lib/offline-db";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { safeRandomUUID } from "@/lib/utils";
import { useFormatCurrency } from "@/contexts/SettingsContext";

import { useRouter } from "next/navigation";
// import { searchEmployeeByPhone } from "@/actions/employee-transaction-actions";

interface CheckoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings?: any;
    csrfToken?: string;
}

export default function CheckoutModal({ isOpen, onClose, settings, csrfToken }: CheckoutModalProps) {
    const formatCurrency = useFormatCurrency();
    const t = useTranslations("POS");
    const router = useRouter();
    const { items, getTotal, clearCart, customerName, customerPhone, customerId, tableId, tableName } = useCartStore();
    const { isOnline } = useNetworkStatus();
    const [loading, setLoading] = useState(false);

    // Treasury States
    const [treasuries, setTreasuries] = useState<any[]>([]);
    const [fetchingTreasuries, setFetchingTreasuries] = useState(true);
    const [selectedTreasuryId, setSelectedTreasuryId] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'VISA' | 'WALLET' | 'INSTAPAY' | 'ACCOUNT' | 'DEFERRED'>('CASH');

    const [isDelivery, setIsDelivery] = useState(false);
    const [saleResult, setSaleResult] = useState<any>(null); // Store sale result for receipt

    // Fetch Treasuries
    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;

        async function loadTreasuries() {
            setFetchingTreasuries(true);
            try {
                const user = await getCurrentUser();
                const res = await getBranchTreasuriesForDropdown(user?.branchId || null);
                if (res.success && res.data && isMounted) {
                    setTreasuries(res.data);
                    // Auto-select the first default treasury if available
                    const defaultTreasury = res.data.find(t => t.isDefault) || res.data[0];
                    if (defaultTreasury) {
                        setSelectedTreasuryId(defaultTreasury.id);
                        setPaymentMethod((defaultTreasury.paymentMethod || 'CASH') as any);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch treasuries", err);
            } finally {
                if (isMounted) setFetchingTreasuries(false);
            }
        }

        loadTreasuries();

        return () => { isMounted = false; };
    }, [isOpen]);

    // Warranty Settings (Default: 30 days)
    const [warrantyEnabled, setWarrantyEnabled] = useState(false);
    const [warrantyDays, setWarrantyDays] = useState(30);

    // Delivery / Customer Details
    const [name, setName] = useState(customerName || '');
    const [phone, setPhone] = useState(customerPhone);
    const [address, setAddress] = useState("");

    const [error, setError] = useState<string | null>(null);
    const [canForce, setCanForce] = useState(false);

    // Sync local state with store when modal opens or store changes
    useEffect(() => {
        setName(customerName);
        setPhone(customerPhone);
        setError(null);
        setCanForce(false);
    }, [customerName, customerPhone, isOpen]);

    // ... (Calculations stay same)
    const subTotal = getTotal();
    const taxRate = Number(settings?.taxRate || 0);
    const taxAmount = subTotal * (taxRate / 100);
    const finalTotal = subTotal + taxAmount;

    async function handleCheckout(formData: FormData, force = false) {
        setLoading(true);
        setError(null);
        if (!force) setCanForce(false);

        // If Delivery, get from internal state (more reliable than FormData for force actions)
        let saleCustomerData = undefined;

        if (isDelivery) {
            saleCustomerData = {
                name: name,
                phone: phone,
                address: address,
            };
        } else if (customerName || customerPhone) {
            saleCustomerData = {
                name: customerName,
                phone: customerPhone,
                id: customerId, // 🆕 Pass ID
                address: ""
            };
        }

        // Snapshot items for receipt before clearing cart
        const currentItems = [...items];

        const payload = {
            items: items.map(i => ({ id: i.id, quantity: i.quantity, price: i.price })),
            paymentMethod: paymentMethod, // Keep for backward compatibility with reporting
            treasuryId: paymentMethod !== 'ACCOUNT' && paymentMethod !== 'DEFERRED' ? selectedTreasuryId : undefined,
            totalAmount: finalTotal, // Send Tax Inclusive Total
            customer: saleCustomerData,
            warranty: warrantyEnabled ? {
                warrantyDays: warrantyDays,
                warrantyExpiryDate: new Date(Date.now() + warrantyDays * 24 * 60 * 60 * 1000)
            } : undefined,
            tableId: tableId,
            tableName: tableName,
            force: force, // <--- Send Force Flag
            csrfToken
        };

        // 🛡️ OFFLINE HANDLING
        if (!isOnline) {
            try {
                // Construct offline sale object
                const offlineSale = {
                    id: safeRandomUUID(),
                    items: items.map(i => ({
                        productId: i.id,
                        productName: i.name,
                        quantity: i.quantity,
                        unitPrice: i.price,
                        unitCost: 0 // Will be resolved by server on sync if possible, or 0
                    })),
                    totalAmount: finalTotal,
                    taxAmount: taxAmount,
                    paymentMethod: paymentMethod,
                    treasuryId: paymentMethod !== 'ACCOUNT' && paymentMethod !== 'DEFERRED' ? selectedTreasuryId : undefined,
                    customerName: saleCustomerData?.name,
                    customerPhone: saleCustomerData?.phone,
                    tableId: tableId,
                    tableName: tableName,
                    createdAt: new Date(),
                    synced: 0 as const, // 0 = false for IndexedDB query compatibility
                    syncRetries: 0
                };

                await offlineDB.sales.add(offlineSale);

                // Optimistic Success
                setSaleResult({
                    saleId: offlineSale.id, // Temporary ID
                    items: currentItems,
                    totalAmount: finalTotal,
                    date: new Date(),
                    customer: saleCustomerData,
                    paymentMethod: paymentMethod,
                    warranty: warrantyEnabled ? {
                        warrantyDays: warrantyDays,
                        warrantyExpiryDate: new Date(Date.now() + warrantyDays * 24 * 60 * 60 * 1000)
                    } : null,
                    isOffline: true // Flag for receipt
                });
                clearCart();
                setLoading(false);
                return;

            } catch (err) {
                console.error("Offline Save Error:", err);
                setError("Failed to save offline sale. Please try again.");
                setLoading(false);
                return;
            }
        }

        const result = await processSale(payload);

        setLoading(false);

        if (result.success) {
            setSaleResult({
                saleId: result.saleId,
                items: currentItems,
                totalAmount: finalTotal, // Use calculated total from client or result
                date: new Date(),
                customer: saleCustomerData,
                paymentMethod: paymentMethod,
                tableId: tableId,
                tableName: tableName,
                warranty: warrantyEnabled ? {
                    warrantyDays: warrantyDays,
                    warrantyExpiryDate: new Date(Date.now() + warrantyDays * 24 * 60 * 60 * 1000)
                } : undefined
            });
            clearCart();
            // Refresh to update shift totals in header
            router.refresh();
        } else {
            // Enhanced Visual Alert
            const msg = result?.error || result?.message || "Transaction failed";
            setError(msg);
            // Check if it's a stock error to offer override
            if (msg.includes("Insufficient")) {
                setCanForce(true);
            }
        }
    }

    // If sale is successful, show Success Summary
    if (saleResult) {
        return (
            <GlassModal isOpen={true} onClose={() => { setSaleResult(null); onClose(); }} title={t('saleCompleted') || "Sale Completed"}>
                <div className="flex flex-col items-center gap-6 py-8 text-center animate-fly-in">
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                        <CheckCircle className="w-10 h-10 text-green-400" />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-white">{t('orderConfirmed') || "Order Confirmed!"}</h2>
                        <p className="text-zinc-400 text-sm">{t('saleId')}: {saleResult.saleId}</p>
                    </div>

                    <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-400">{t('totalAmount')}</span>
                            <span className="text-white font-bold text-lg">{formatCurrency(saleResult.totalAmount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-400">{t('paymentMethod')}</span>
                            <span className="text-cyan-400 font-bold uppercase">{t(saleResult.paymentMethod.toLowerCase()) || saleResult.paymentMethod}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 w-full gap-3 pt-4">
                        <button
                            onClick={() => {
                                // Explicit trigger for ReceiptModal logic
                                setSaleResult({ ...saleResult, showPrint: true });
                            }}
                            className="bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 border border-white/10 transition-all"
                        >
                            <Printer className="w-5 h-5" />
                            {t('printReceipt') || "Print Receipt"}
                        </button>

                        <button
                            onClick={() => { setSaleResult(null); onClose(); }}
                            className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,242,255,0.3)] transition-all"
                        >
                            {t('nextSale') || "Next Sale"}
                        </button>
                    </div>
                </div>

                {/* Receipt Modal as Overlay if requested */}
                {saleResult.showPrint && (
                    <ReceiptModal
                        isOpen={true}
                        onClose={() => setSaleResult({ ...saleResult, showPrint: false })}
                        saleData={saleResult}
                        settings={settings}
                    />
                )}
            </GlassModal>
        );
    }

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title={t('checkout')}>
            <div className="space-y-6">
                {/* Payment Methods */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {fetchingTreasuries ? (
                        <div className="col-span-full flex justify-center py-4 text-cyan-500">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    ) : (
                        <>
                            {/* Map through dynamic treasuries */}
                            {treasuries.map(tData => {
                                // Match icon based on treasury's mapped paymentMethod string
                                let TIcon = Banknote;
                                if (tData.paymentMethod === 'VISA' || tData.paymentMethod === 'CARD') TIcon = CreditCard;
                                else if (tData.paymentMethod === 'WALLET') TIcon = Smartphone;
                                else if (tData.paymentMethod === 'INSTAPAY') TIcon = ArrowRightLeft;

                                return (
                                    <PaymentMethod
                                        key={tData.id}
                                        label={tData.name}
                                        icon={TIcon}
                                        active={paymentMethod !== 'ACCOUNT' && paymentMethod !== 'DEFERRED' && selectedTreasuryId === tData.id}
                                        onClick={() => {
                                            setSelectedTreasuryId(tData.id);
                                            setPaymentMethod(tData.paymentMethod || 'CASH');
                                        }}
                                        isDefault={tData.isDefault}
                                    />
                                );
                            })}

                            {/* Keep Deferred/Account explicitly distinct since it bypassed treasury entirely */}
                            <PaymentMethod
                                label={t('deferred')} // or "ACCOUNT" / "آجل"
                                icon={User}
                                active={paymentMethod === "ACCOUNT" || paymentMethod === "DEFERRED"}
                                onClick={() => {
                                    setPaymentMethod("ACCOUNT");
                                    setSelectedTreasuryId('');
                                }}
                                disabled={!customerId}
                                warning={!customerId ? t('selectCustomerFirst') : undefined}
                            />
                        </>
                    )}
                </div>

                {/* 👷 Employee Detection Banner REMOVED */}

                {/* Delivery Toggle & Form */}
                {/* ... (Keep existing structure) ... */}
                <div className="border border-border rounded-xl p-4 bg-muted/30">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isDelivery}
                            onChange={(e) => setIsDelivery(e.target.checked)}
                            className="w-5 h-5 accent-cyan-400 rounded bg-muted border-border"
                        />
                        <div className="flex items-center gap-2">
                            <Truck className="w-5 h-5 text-muted-foreground" />
                            <span className="font-medium text-foreground">{t('deliveryOrder')}</span>
                        </div>
                    </label>

                    {isDelivery && (
                        <form id="checkout-form" action={(formData) => handleCheckout(formData, false)} className="mt-4 space-y-3 animate-fly-in">
                            <input
                                name="name"
                                defaultValue={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('notes')}
                                className="glass-input w-full"
                                required
                            />
                            <input
                                name="phone"
                                defaultValue={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder={t('customerPhone')}
                                className="glass-input w-full"
                                required
                            />
                            <textarea name="address" placeholder={t('deliveryAddress')} className="glass-input w-full resize-none h-20" required></textarea>
                        </form>
                    )}
                </div>

                {/* Warranty Selector */}
                <div className="border border-border rounded-xl p-4 bg-muted/30 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={warrantyEnabled}
                            onChange={(e) => setWarrantyEnabled(e.target.checked)}
                            className="w-5 h-5 accent-green-400 rounded bg-muted border-border"
                        />
                        <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-green-400" />
                            <span className="font-medium text-foreground">{t('warrantyTitle')}</span>
                        </div>
                    </label>

                    {warrantyEnabled && (
                        <div className="space-y-2 animate-fly-in">
                            <label className="text-sm text-muted-foreground flex items-center gap-2">
                                <CalendarCheck className="w-4 h-4" />
                                {t('warrantyPeriod')}
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                                {[30, 60, 90, 180].map((days) => (
                                    <button
                                        key={days}
                                        type="button"
                                        onClick={() => setWarrantyDays(days)}
                                        className={clsx(
                                            "p-3 rounded-lg border text-center transition-all",
                                            warrantyDays === days
                                                ? "bg-green-500/20 border-green-500 text-green-400 font-bold"
                                                : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                                        )}
                                    >
                                        <div className="text-lg font-bold">{days}</div>
                                        <div className="text-xs">{t('warrantyDays')}</div>
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground text-center" suppressHydrationWarning>
                                📅 {t('warrantyExpires')}: {new Date(Date.now() + warrantyDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
                            </p>
                        </div>
                    )}
                </div>

                {/* Total & Action */}
                <div className="pt-4 border-t border-border space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground text-sm">
                        <span>{t('subtotal')}</span>
                        <span>{formatCurrency(subTotal)}</span>
                    </div>
                    {taxRate > 0 && (
                        <div className="flex items-center justify-between text-cyan-400 text-sm">
                            <span>{t('tax')} ({taxRate}%)</span>
                            <span>{formatCurrency(taxAmount)}</span>
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t('total')}</span>
                        <span className="text-3xl font-bold text-cyan-400">{formatCurrency(finalTotal)}</span>
                    </div>
                </div>

                {/* Error Banner & Force Option */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl flex items-center gap-3 animate-shake justify-between">
                        <div className="flex items-start gap-3">
                            <XCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-bold text-red-500 text-sm">{t('transactionFailed')}</h4>
                                <p className="text-red-400 text-xs">{error}</p>
                            </div>
                        </div>
                        {canForce && (
                            <button
                                onClick={() => handleCheckout(new FormData(), true)}
                                className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-2 rounded-lg whitespace-nowrap"
                            >
                                {t('forceSale')}
                            </button>
                        )}
                    </div>
                )}

                <button
                    onClick={() => isDelivery ? (document.getElementById('checkout-form') as HTMLFormElement)?.requestSubmit() : handleCheckout(new FormData())}
                    disabled={loading}
                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,242,255,0.3)] transition-all"
                >
                    {loading ? <Loader2 className="animate-spin" /> : <Banknote />}
                    {t('confirmPayment')}
                </button>
            </div>
        </GlassModal>
    );
}

function PaymentMethod({ label, icon: Icon, active, onClick, disabled, warning, isDefault }: any) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={clsx(
                "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-200 relative group",
                active
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(0,242,255,0.2)]"
                    : disabled
                        ? "bg-muted/20 border-transparent text-muted-foreground/30 cursor-not-allowed"
                        : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
            )}
        >
            <Icon className="w-6 h-6" />
            <span className="text-xs font-bold uppercase text-center">{label}</span>
            {isDefault && (
                <span className="absolute top-1 right-1 bg-cyan-500/30 text-cyan-300 text-[9px] px-1 rounded-sm border border-cyan-500/50">
                    Default
                </span>
            )}

            {/* Tooltip for disabled state */}
            {disabled && warning && (
                <div className="absolute bottom-full mb-2 bg-red-500 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {warning}
                </div>
            )}
        </button>
    );
}
