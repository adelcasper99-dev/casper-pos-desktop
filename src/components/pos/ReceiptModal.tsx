"use client";

import GlassModal from "@/components/ui/GlassModal";
import { Printer, CheckCircle, Loader2 } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { useState, useEffect, useRef, useMemo } from "react";
import { getStoreSettings } from "@/actions/settings";
import { printService } from "@/lib/print-service";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { PAPER_SIZES } from "@/lib/constants";
import { generateThermalReceiptHTML } from "./ThermalReceiptTemplate";
import { generateA4ReceiptHTML } from "./A4ReceiptTemplate";
import { PRINTER_REGISTRY_KEY } from "@/types/printer-config";

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
    const [receiptFormat, setReceiptFormat] = useState<'thermal' | 'a4'>('thermal');
    const receiptRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem('casper_default_print_copies');
        if (saved) setCopyCount(parseInt(saved, 10));

        const registryStr = localStorage.getItem(PRINTER_REGISTRY_KEY);
        if (registryStr) {
            try {
                const registry = JSON.parse(registryStr);
                if (registry.receiptFormat === 'a4') {
                    setReceiptFormat('a4');
                }
            } catch (e) { }
        }
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
            const html = receiptFormat === 'a4'
                ? generateA4ReceiptHTML({ saleData, settings })
                : generateThermalReceiptHTML({ saleData, settings });

            const widthToUse = receiptFormat === 'a4'
                ? 210 // A4 width in mm
                : (settings?.paperSize === '58mm' ? 58 : 80);

            for (let i = 0; i < copyCount; i++) {
                await printService.printThermal(html, receiptPrinter || '', widthToUse);
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

                {/* Success badge - Hide if DRAFT */}
                {saleData.invoiceNumber !== "DRAFT" ? (
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(34,197,94,0.5)]">
                            <CheckCircle className="w-8 h-8" />
                        </div>
                        <h2 className="text-xl font-bold text-foreground">{t('saleCompleted') || "تمت العملية بنجاح"}</h2>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        {/* Optionally show a different header for DRAFT / Speed Print */}
                        <h2 className="text-xl font-bold text-cyan-400">{t('speedPrintPreview') || "معاينة الطباعة السريعة"}</h2>
                        <p className="text-sm text-zinc-400">هذا الطلب لم يتم محاسبته بعد</p>
                    </div>
                )}

                {receiptFormat === 'a4' ? (
                    // ── A4 Preview Container ── 
                    <div className="relative w-full flex justify-center py-2 shrink-0">
                        {/* Wrapper for scaled content to maintain document flow dimensions */}
                        <div style={{ width: '280px', height: '396px', position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    transform: 'scale(0.35)',
                                    transformOrigin: 'top left',
                                    width: '800px',
                                    height: '1131px', // A4 aspect ratio (1:1.414)
                                    background: '#fff',
                                }}>
                                <div dangerouslySetInnerHTML={{ __html: generateA4ReceiptHTML({ saleData, settings }) }} />
                            </div>
                        </div>
                    </div>
                ) : (
                    /* ── Thermal Receipt Preview ── */
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
                            {saleData.tableName && (
                                <div style={{ fontSize: '14px', fontWeight: 900, marginTop: '4px', padding: '4px', border: '1.5px solid #000' }}>
                                    {saleData.tableName}
                                </div>
                            )}
                            {saleData.customerName && (
                                <div style={{ marginTop: '4px', padding: '4px', borderTop: '1px dashed #000', borderBottom: '1px dashed #000' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 'bold' }}>👤 {saleData.customerName}</div>
                                    {saleData.customerPhone && (
                                        <div style={{ fontSize: '10px', marginTop: '2px', fontWeight: 'bold' }}>📞 {saleData.customerPhone}</div>
                                    )}
                                    {saleData.customerBalance !== undefined && saleData.customerBalance !== null && (
                                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: saleData.customerBalance > 0 ? '#b91c1c' : '#15803d' }}>
                                            {t('balance') || "الرصيد"}: {new Intl.NumberFormat('en-US', { style: 'currency', currency: settings?.currency || 'USD' }).format(saleData.customerBalance)}
                                        </div>
                                    )}
                                </div>
                            )}
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
                                        <span>{item.name}{Array.isArray(item.bundleComponents) && item.bundleComponents.length > 0 ? ' 📦' : ''}</span>
                                        <span>{formatCurrency(item.price * (item.quantity || 1), currency)}</span>
                                    </div>
                                    {(item.storage || item.color) && (
                                        <div style={{ fontSize: '11px', marginTop: '2px' }}>{[item.storage, item.color].filter(Boolean).join(' - ')}</div>
                                    )}
                                    {item.quantity > 1 && (
                                        <div style={{ fontSize: '10px' }}>الكمية: {item.quantity} x {formatCurrency(item.price, currency)}</div>
                                    )}
                                    {Array.isArray(item.bundleComponents) && item.bundleComponents.map((c: any, ci: number) => (
                                        <div key={ci} style={{ fontSize: '10px', color: '#444', paddingRight: '8px', marginTop: '2px', fontWeight: 500 }}>
                                            › {c.name}{c.quantityIncluded > 1 ? ` (x${c.quantityIncluded})` : ''}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* Consolidated Items Summary */}
                        {(() => {
                            const map = new Map<string, number>();
                            for (const item of items) {
                                const qty = item.quantity || 1;
                                if (Array.isArray(item.bundleComponents) && item.bundleComponents.length > 0) {
                                    for (const c of item.bundleComponents) {
                                        map.set(c.name, (map.get(c.name) || 0) + (c.quantityIncluded || 1) * qty);
                                    }
                                } else {
                                    map.set(item.name, (map.get(item.name) || 0) + qty);
                                }
                            }
                            const hasBundle = items.some((i: any) => Array.isArray(i.bundleComponents) && i.bundleComponents.length > 0);
                            if (!hasBundle) return null;
                            return (
                                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #000' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 900, textAlign: 'center', marginBottom: '4px', letterSpacing: '1px' }}>إجمالي الأصناف</div>
                                    {Array.from(map.entries()).map(([name, qty]) => (
                                        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, padding: '2px 0' }}>
                                            <span>{name}</span>
                                            <span style={{ fontWeight: 700 }}>{qty}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}

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
                )}

                {/* Controls */}
                <div className="w-full max-w-[300px] bg-zinc-800/80 p-4 rounded-2xl border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-white/90">{t('copyCount') || 'عدد النسخ'}</label>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setCopyCount(Math.max(1, copyCount - 1))}
                                className="w-8 h-8 rounded-lg bg-zinc-700 text-white flex items-center justify-center hover:bg-zinc-600 transition-colors font-black"
                            >-</button>
                            <span className="w-8 text-center font-black text-white">{copyCount}</span>
                            <button
                                onClick={() => setCopyCount(copyCount + 1)}
                                className="w-8 h-8 rounded-lg bg-zinc-700 text-white flex items-center justify-center hover:bg-zinc-600 transition-colors font-black"
                            >+</button>
                        </div>
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={saveAsDefault}
                            onChange={(e) => setSaveAsDefault(e.target.checked)}
                            className="w-4 h-4 rounded border-2 border-zinc-600 bg-zinc-900 focus:ring-cyan-500 checked:bg-cyan-500 text-cyan-500"
                        />
                        <span className="text-sm text-white/70 group-hover:text-white transition-colors">
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
