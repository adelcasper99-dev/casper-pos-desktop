
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "@/lib/i18n-mock";
import GlassModal from "../ui/GlassModal";
import { Banknote, CreditCard, Clock, Truck, Loader2, Store, User, Smartphone, ArrowRightLeft, XCircle, Shield, CalendarCheck, UserCircle, Printer, CheckCircle } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { processSale } from "@/actions/pos";
import { getBranchTreasuriesForDropdown } from "@/actions/treasury";
import { getCurrentUser } from "@/actions/auth";
import clsx from "clsx";
import ReceiptModal from "./ReceiptModal";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";


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
    const { handleKeyDown, getNavProps } = useKeyboardNavigation();
    const { 
        items, 
        getTotal, 
        clearCart, 
        customerName, 
        customerPhone, 
        customerAddress, // 🆕 Pull Address
        customerBalance, 
        customerId, 
        tableId, 
        tableName, 
        discountAmount = 0, 
        discountPercentage = 0 
    } = useCartStore();
    const { isOnline } = useNetworkStatus(); // Used for UI status indicator only

    const [loading, setLoading] = useState(false);

    // Treasury States
    const [treasuries, setTreasuries] = useState<any[]>([]);
    const [fetchingTreasuries, setFetchingTreasuries] = useState(true);
    const [selectedTreasuryId, setSelectedTreasuryId] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'VISA' | 'WALLET' | 'INSTAPAY' | 'ACCOUNT' | 'DEFERRED'>('CASH');

    const [isDelivery, setIsDelivery] = useState(false);
    const [saleResult, setSaleResult] = useState<any>(null); // Store sale result for receipt
    const [receivedAmount, setReceivedAmount] = useState<number | ''>('');

    // Fetch Treasuries
    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;

        async function loadTreasuries() {
            setFetchingTreasuries(true);
            try {
                // Fetch all treasuries to ensure they appear even if branch IDs mismatch
                const res = await getBranchTreasuriesForDropdown('all');
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
    const [address, setAddress] = useState(customerAddress || "");

    const [error, setError] = useState<string | null>(null);
    const [canForce, setCanForce] = useState(false);
    const errorRef = useRef<HTMLDivElement>(null);
    const closeBtnRef = useRef<HTMLButtonElement>(null);

    // Auto-focus error area or close button to capture keyboard events
    useEffect(() => {
        if (error) {
            // Give the DOM a moment to render the error banner
            setTimeout(() => {
                errorRef.current?.focus();
            }, 100);
        } else if (isOpen) {
            // Return focus to a safe button when error cleared or modal opened
            setTimeout(() => {
                closeBtnRef.current?.focus();
            }, 100);
        }
    }, [error, isOpen]);

    // Handle Keyboard Navigation (Arrows & Escape)
    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (!isOpen || saleResult) return;

            if (e.key === 'Escape' && error) {
                setError(null);
                setCanForce(false);
                e.stopPropagation();
                return;
            }

            // 1. Treasury/Payment Method Switching (Left/Right)
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const combinedMethods = [...treasuries, { id: 'ACCOUNT', name: 'ACCOUNT', isAccount: true }];
                const currentIndex = combinedMethods.findIndex(m => 
                    (paymentMethod === 'ACCOUNT' || paymentMethod === 'DEFERRED') ? m.id === 'ACCOUNT' : m.id === selectedTreasuryId
                );
                
                if (currentIndex !== -1) {
                    let nextIndex = e.key === 'ArrowRight' ? currentIndex + 1 : currentIndex - 1;
                    if (nextIndex >= combinedMethods.length) nextIndex = 0;
                    if (nextIndex < 0) nextIndex = combinedMethods.length - 1;

                    const nextMethod = combinedMethods[nextIndex] as any;
                    if (nextMethod.isAccount) {
                        if (customerId) {
                            setPaymentMethod("ACCOUNT");
                            setSelectedTreasuryId('');
                        }
                    } else {
                        setSelectedTreasuryId(nextMethod.id);
                        setPaymentMethod(nextMethod.paymentMethod || 'CASH');
                    }
                    e.preventDefault();
                }
            }

            // 2. Vertical Navigation (Up/Down)
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const active = document.activeElement;
                const isAmountFocus = active?.getAttribute('name') === 'receivedAmount' || active?.classList.contains('glass-input');
                
                if (e.key === 'ArrowDown') {
                    if (!isAmountFocus) {
                        // Focus the received amount input if it exists
                        const amountInput = document.querySelector('input[type="number"]') as HTMLInputElement;
                        amountInput?.focus();
                    } else {
                        // Focus the checkout button
                        const checkoutBtn = document.querySelector('button.bg-cyan-500:not([disabled])') as HTMLButtonElement;
                        checkoutBtn?.focus();
                    }
                } else if (e.key === 'ArrowUp') {
                    // Focus back to safe zone (close button or top of modal)
                    closeBtnRef.current?.focus();
                }
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [isOpen, error, treasuries, selectedTreasuryId, paymentMethod, customerId, saleResult]);

    // Sync local state with store when modal opens or store changes
    useEffect(() => {
        setName(customerName);
        setPhone(customerPhone);
        setAddress(customerAddress || ""); // 🆕 Pre-fill address
        setError(null);
        setCanForce(false);
    }, [customerName, customerPhone, customerAddress, isOpen]);

    // ... (Calculations stay same)
    // Recalculate Totals
    const subTotal = getTotal();
    const effectiveSubTotal = Math.max(0, subTotal - discountAmount);
    const taxRate = Number(settings?.taxRate || 0);
    const taxAmount = effectiveSubTotal * (taxRate / 100);
    const finalTotal = effectiveSubTotal + taxAmount;

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
            discountAmount: discountAmount,
            discountPercentage: discountPercentage,
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

        const result = await processSale(payload);

        setLoading(false);

        if (result.success) {
            setSaleResult({
                saleId: result.saleId,
                invoiceNumber: result.saleId ? `S-${result.saleId.split('-')[0].toUpperCase()}` : undefined,
                items: currentItems,
                totalAmount: finalTotal, // Use calculated total from client or result
                subTotal: subTotal,
                discountAmount: discountAmount,
                discountPercentage: discountPercentage,
                taxAmount: taxAmount,
                date: new Date(),
                customer: saleCustomerData,
                customerName: saleCustomerData?.name,
                customerPhone: saleCustomerData?.phone,
                customerBalance: customerBalance,
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
                        <p className="text-zinc-400 text-sm">{t('saleId')}: {saleResult.invoiceNumber}</p>
                    </div>

                    <div className="w-full glass-card bg-white/5 border border-white/10 p-6 space-y-3">
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
                            className="glass-card bg-white/5 hover:bg-white/10 text-white font-bold py-4 flex items-center justify-center gap-2 transition-all"
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
                <div className="glass-card bg-white/5 backdrop-blur-md p-4">
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
                                {...getNavProps(1)}
                                name="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, 1, 4, () => (document.getElementById('checkout-form') as HTMLFormElement)?.requestSubmit())}
                                placeholder={t('customerName') || "الاسم"}
                                className="glass-input w-full"
                                required
                            />
                            <input
                                {...getNavProps(2)}
                                name="phone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, 2, 4, () => (document.getElementById('checkout-form') as HTMLFormElement)?.requestSubmit())}
                                placeholder={t('customerPhone')}
                                className="glass-input w-full"
                                required
                            />
                            <textarea
                                {...getNavProps(3)}
                                name="address"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder={t('deliveryAddress')}
                                className="glass-input w-full resize-none h-20"
                                onKeyDown={(e) => handleKeyDown(e, 3, 4, () => (document.getElementById('checkout-form') as HTMLFormElement)?.requestSubmit())}
                                required
                            ></textarea>
                        </form>
                    )}
                </div>

                {/* Warranty Selector */}
                <div className="glass-card bg-white/5 backdrop-blur-md p-4 space-y-3">
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
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                        <span className="text-muted-foreground font-medium">{t('total')}</span>
                        <div className="flex flex-col items-end">
                            <span className="text-3xl font-bold text-cyan-400">{formatCurrency(finalTotal)}</span>
                            {discountAmount > 0 && (
                                <span className="text-[10px] text-green-400 font-bold">
                                    خصم {formatCurrency(discountAmount)} -
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Quick Change Calculator (Visual Only) */}
                    {(paymentMethod === 'CASH' || paymentMethod === 'WALLET') && (
                        <div className="mt-4 p-4 glass-card bg-black/40 border border-white/10 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                            <h4 className="text-xs text-zinc-400 font-bold uppercase tracking-wider flex items-center justify-between">
                                حاسبة الباقي (للمساعدة فقط)
                                {receivedAmount !== '' && (
                                    <button onClick={() => setReceivedAmount('')} className="text-[10px] text-zinc-500 hover:text-red-400 uppercase transition-colors">مسح</button>
                                )}
                            </h4>
                            <div className="grid grid-cols-2 gap-3 items-center">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-500 font-bold uppercase italic">المبلغ المستلم</label>
                                    <div className="relative">
                                        <input
                                            {...getNavProps(0)}
                                            type="number"
                                            value={receivedAmount}
                                            onChange={(e) => setReceivedAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    if (isDelivery) {
                                                        // Focus the next delivery field
                                                        handleKeyDown(e, 0, 4, undefined);
                                                    } else {
                                                        // Finalize Checkout
                                                        handleCheckout(new FormData());
                                                    }
                                                }
                                            }}
                                            placeholder="0.00"
                                            className="glass-input h-9 py-1 text-sm w-full pr-8"
                                            min="0"
                                            step="0.01"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px] font-bold">ج.م</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-500 font-bold uppercase italic">الباقي للعميل</label>
                                    <div className={`h-9 flex items-center justify-center rounded-lg border font-bold ${typeof receivedAmount === 'number' && receivedAmount < finalTotal ? 'text-xs text-red-400 bg-red-500/10 border-red-500/30' : 'text-lg'} transition-colors ${typeof receivedAmount === 'number' && receivedAmount >= finalTotal ? 'text-green-400 bg-green-500/10 border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.15)]' : typeof receivedAmount === 'number' && receivedAmount < finalTotal ? '' : 'text-zinc-500 bg-white/5 border-white/10'}`}>
                                        {typeof receivedAmount === 'number' ? (receivedAmount >= finalTotal ? formatCurrency(receivedAmount - finalTotal) : 'مبلغ غير كافٍ') : '0.00'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Error Banner & Force Option */}
                {error && (
                    <div
                        ref={errorRef}
                        tabIndex={-1}
                        className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl flex items-center gap-3 animate-shake justify-between outline-none focus:ring-2 focus:ring-red-500/50"
                    >
                        <div className="flex items-start gap-3">
                            <XCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-bold text-red-500 text-sm">{t('transactionFailed')}</h4>
                                <p className="text-red-400 text-xs">{error}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {canForce && (
                                <button
                                    onClick={() => handleCheckout(new FormData(), true)}
                                    className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-2 rounded-lg whitespace-nowrap"
                                >
                                    {t('forceSale')}
                                </button>
                            )}
                            <button
                                onClick={() => { setError(null); setCanForce(false); }}
                                className="p-1 hover:bg-red-500/20 rounded-md text-red-400 transition-colors"
                            >
                                <XCircle className="w-4 h-4 opacity-70" />
                            </button>
                        </div>
                    </div>
                )}

                <button
                    onClick={() => isDelivery ? (document.getElementById('checkout-form') as HTMLFormElement)?.requestSubmit() : handleCheckout(new FormData())}
                    disabled={loading || (typeof receivedAmount === 'number' && receivedAmount < finalTotal)}
                    className={clsx(
                        "w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all",
                        loading || (typeof receivedAmount === 'number' && receivedAmount < finalTotal)
                            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                            : "bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_20px_rgba(0,242,255,0.3)]"
                    )}
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
                "flex flex-col items-center justify-center gap-2 p-4 glass-card border transition-all duration-300 relative group overflow-hidden",
                active
                    ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-[0_0_20px_rgba(0,242,255,0.15)] scale-[1.02]"
                    : disabled
                        ? "opacity-30 grayscale cursor-not-allowed border-white/5"
                        : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:border-white/20"
            )}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
            
            <Icon className={clsx("w-6 h-6 transition-transform duration-300", active && "scale-110")} />
            <span className="text-[10px] font-bold uppercase text-center tracking-wider">{label}</span>
            {isDefault && (
                <span className="absolute top-2 right-2 bg-cyan-500/20 text-cyan-300 text-[8px] px-1.5 py-0.5 rounded-full border border-cyan-500/30 font-black uppercase">
                    Default
                </span>
            )}

            {/* Tooltip for disabled state */}
            {disabled && warning && (
                <div className="absolute bottom-full mb-2 bg-black/80 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10">
                    {warning}
                </div>
            )}
        </button>
    );
}
