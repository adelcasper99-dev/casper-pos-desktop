"use client";

import GlassModal from "@/components/ui/GlassModal";
import { Printer, CheckCircle, Loader2 } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { useState, useEffect, useRef } from "react";
import { getStoreSettings } from "@/actions/settings";
import { printService } from "@/lib/print-service";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { PAPER_SIZES } from "@/lib/constants";
import { generateThermalReceiptHTML } from "./ThermalReceiptTemplate";

interface ReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    saleData: any;
    settings?: any;
}

export default function ReceiptModal({ isOpen, onClose, saleData, settings: settingsProp }: ReceiptModalProps) {
    const t = useTranslations("POS");
    const [settings, setSettings] = useState<any>(settingsProp || null);
    const [printAttempted, setPrintAttempted] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [copyCount, setCopyCount] = useState(1);
    const [saveAsDefault, setSaveAsDefault] = useState(false);
    const receiptRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem('casper_default_print_copies');
        if (saved) setCopyCount(parseInt(saved, 10));
    }, []);

    useEffect(() => {
        if (isOpen) {
            setPrintAttempted(false);
            setIsPrinting(false);
            if (settingsProp) {
                setSettings(settingsProp);
            } else {
                getStoreSettings().then(res => {
                    if (res.success) setSettings(res.data);
                });
            }
        }
    }, [isOpen, settingsProp]);

    // Auto-print if enabled
    useEffect(() => {
        if (isOpen && settings?.autoPrint && saleData && !printAttempted) {
            setPrintAttempted(true);
            setTimeout(() => handlePrint(), 500);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, settings, saleData, printAttempted]);

    if (!saleData) return null;

    const handlePrint = async () => {
        if (!settings || isPrinting) return;

        setIsPrinting(true);
        if (saveAsDefault) {
            localStorage.setItem('casper_default_print_copies', copyCount.toString());
        }

        const receiptPrinter = localStorage.getItem('casper_receipt_printer') || undefined;
        const paperWidthMm = settings?.paperSize === '58mm'
            ? PAPER_SIZES.MOBILE
            : (settings?.paperSize === '100mm' ? PAPER_SIZES.WIDE : PAPER_SIZES.STANDARD);

        const printJob = async () => {
            const html = generateThermalReceiptHTML({ saleData, settings });

            for (let i = 0; i < copyCount; i++) {
                await printService.printHTML(html, receiptPrinter, { paperWidthMm });
            }
        };

        toast.promise(printJob(), {
            loading: t('printing') || 'Printing...',
            success: t('sentToPrinter') || 'Sent to printer',
            error: (err: Error) => {
                setIsPrinting(false);
                return `Print failed: ${err?.message || 'Unknown error'}`;
            },
            finally: () => setIsPrinting(false)
        });
    };

    // ... (rest of the component)
    const items = saleData.items ?? [];
    const total = saleData.totalAmount ?? 0;
    const currency = settings?.currency ?? 'SAR';
    const date = new Date(saleData.date);
    const dateStr = date.toLocaleDateString('ar-EG');
    const timeStr = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title={t('printReceipt') || "طباعة الإيصال"}>
            <div className="flex flex-col items-center justify-center p-4 space-y-5">

                {/* Success badge */}
                <div className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(34,197,94,0.5)]">
                        <CheckCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">{t('saleCompleted') || "تمت العملية بنجاح"}</h2>
                </div>

                {/* ── Receipt Preview ── */}
                <div
                    ref={receiptRef}
                    dir="rtl"
                    style={{
                        fontFamily: 'Arial, Tahoma, sans-serif',
                        fontSize: '12px',
                        color: '#000000',
                        backgroundColor: '#ffffff',
                        width: '300px',
                        maxWidth: '300px',
                        borderRadius: '0px',
                        border: '1px solid #000000',
                        overflow: 'hidden',
                        padding: '12px',
                        fontWeight: 600
                    }}
                >
                    {/* Header */}
                    <div style={{ textAlign: 'center', borderBottom: '1.5px solid #000000', paddingBottom: '8px', marginBottom: '8px' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {settings?.name ?? 'CASPER POS'}
                        </div>
                        {settings?.phone && (
                            <div style={{ fontSize: '11px', marginTop: '4px' }}>📞 {settings.phone}</div>
                        )}
                        {settings?.address && (
                            <div style={{ fontSize: '10px', marginTop: '2px' }}>📍 {settings.address}</div>
                        )}
                    </div>

                    {/* Info */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid #000000', paddingBottom: '6px', marginBottom: '4px' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '12px' }}>#{saleData.invoiceNumber || "0000"}</div>
                            <div>{dateStr} - {timeStr}</div>
                        </div>
                    </div>

                    {/* Items */}
                    <div style={{ padding: '4px 0' }}>
                        {items.length === 0 && (
                            <div style={{ textAlign: 'center', fontSize: '11px', color: '#a1a1aa' }}>لا توجد عناصر</div>
                        )}
                        {items.map((item: any, i: number) => (
                            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #000000' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '12px' }}>
                                    <span>{item.name}</span>
                                    <span>{formatCurrency(item.price * (item.quantity || 1), currency)}</span>
                                </div>
                                {(item.storage || item.color) && (
                                    <div style={{ fontSize: '11px', marginTop: '2px' }}>{[item.storage, item.color].filter(Boolean).join(' - ')}</div>
                                )}
                                {item.quantity > 1 && (
                                    <div style={{ fontSize: '10px' }}>الكمية: {item.quantity} x {formatCurrency(item.price, currency)}</div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Total Box */}
                    <div style={{ background: '#000000', color: '#ffffff', margin: '12px -12px', padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', opacity: 0.8 }}>الإجمالي</div>
                        <div style={{ fontSize: '20px', fontWeight: 700 }}>{formatCurrency(total, currency)}</div>
                    </div>

                    {/* Footer */}
                    <div style={{ textAlign: 'center', borderTop: '1px solid #000000', paddingTop: '8px', marginTop: '4px' }}>
                        <div style={{ fontSize: '11px' }}>{settings?.receiptFooter || 'شكراً لزيارتكم'}</div>
                    </div>
                </div>

                {/* Controls */}
                <div className="w-full max-w-[300px] bg-muted/30 p-4 rounded-2xl border border-border/50 space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-bold opacity-70">{t('copyCount') || 'عدد النسخ'}</label>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setCopyCount(Math.max(1, copyCount - 1))}
                                className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors font-black"
                            >-</button>
                            <span className="w-8 text-center font-black">{copyCount}</span>
                            <button
                                onClick={() => setCopyCount(copyCount + 1)}
                                className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors font-black"
                            >+</button>
                        </div>
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={saveAsDefault}
                            onChange={(e) => setSaveAsDefault(e.target.checked)}
                            className="w-4 h-4 rounded border-2 border-muted bg-transparent"
                        />
                        <span className="text-sm opacity-70 group-hover:opacity-100 transition-opacity">
                            {t('saveAsDefault') || 'حفظ كافتراضي'}
                        </span>
                    </label>
                </div>

                {/* Actions */}
                <div className="flex gap-3 w-full max-w-[300px]">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-foreground font-bold"
                        disabled={isPrinting}
                    >
                        {t('close') || 'إغلاق'}
                    </button>
                    <button
                        onClick={handlePrint}
                        disabled={!settings || isPrinting}
                        className="flex-1 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isPrinting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Printer className="w-4 h-4" />
                        )}
                        {isPrinting ? (t('printing') || 'جاري الطباعة...') : (t('print') || 'طباعة')}
                    </button>
                </div>
            </div>
        </GlassModal>
    );
}
