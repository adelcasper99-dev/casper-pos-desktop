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
    const [enabledFormats, setEnabledFormats] = useState({ thermal: true, a4: true });
    const receiptRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem('casper_default_print_copies');
        if (saved) setCopyCount(parseInt(saved, 10));

        const registryStr = localStorage.getItem(PRINTER_REGISTRY_KEY);
        if (registryStr) {
            try {
                const registry = JSON.parse(registryStr);
                const isA4 = registry.receiptFormat === 'a4';
                const thermalEnabled = registry.enableThermal !== false;
                const a4Enabled = registry.enableA4 !== false;

                setEnabledFormats({ thermal: thermalEnabled, a4: a4Enabled });

                if (isA4 && a4Enabled) {
                    setReceiptFormat('a4');
                } else if (!thermalEnabled && a4Enabled) {
                    setReceiptFormat('a4');
                } else {
                    setReceiptFormat('thermal');
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

        const registry = printService.getRegistry();
        const rawReceiptPrinter = receiptFormat === 'a4'
            ? registry?.a4Printer
            : (registry?.thermalPrinter || registry?.receiptPrinter);

        const receiptPrinter = (rawReceiptPrinter && rawReceiptPrinter !== 'none') ? rawReceiptPrinter : undefined;

        const printJob = async () => {
            const html = receiptFormat === 'a4'
                ? generateA4ReceiptHTML({ saleData, settings })
                : generateThermalReceiptHTML({ saleData, settings });

            if (receiptFormat === 'a4') {
                // Ensure A4 jobs have the correct paper width and use printHTML for standard routing
                await printService.printHTML(html, receiptPrinter || '', { paperWidthMm: 210 });
            } else {
                const widthToUse = settings?.paperSize === '58mm' ? 58 : 80;
                for (let i = 0; i < copyCount; i++) {
                    await printService.printThermal(html, receiptPrinter || '', widthToUse);
                }
            }
        };

        try {
            await toast.promise(printJob(), {
                loading: t('printing') || 'Printing...',
                success: t('sentToPrinter') || 'Sent to printer',
                error: (err: any) => `Print failed: ${err?.message || 'Unknown error'}`
            });
        } catch (e) {
            console.error("Print promise error:", e);
        } finally {
            setIsPrinting(false);
        }
    };

    const handleExportPDF = async () => {
        if (!settings || isPrinting) return;

        setIsPrinting(true);
        const html = generateA4ReceiptHTML({ saleData, settings });
        const filename = `Invoice_${saleData.invoiceNumber || 'Draft'}_${new Date().getTime()}.pdf`;

        try {
            const result = await printService.saveToPDF(html, filename);
            if (result.success) {
                toast.success(t('pdfExported') || "تم تصدير PDF بنجاح");
            } else if (result.error !== 'Cancelled') {
                toast.error(`PDF export failed: ${result.error}`);
            }
        } catch (e: any) {
            toast.error(`Error: ${e.message}`);
        } finally {
            setIsPrinting(false);
        }
    };

    // ... (rest of the component)
    const items = saleData.items ?? [];
    const total = saleData.totalAmount ?? 0;
    const currency = settings?.currency ?? 'EGP';
    const date = new Date(saleData.date || new Date());
    const dateStr = date.toLocaleDateString('ar-EG');
    const timeStr = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title={t('printReceipt') || "طباعة الإيصال"}>
            <div className="flex flex-col items-center justify-center p-4 space-y-5">

                {/* Success badge & Format Toggle */}
                <div className="w-full flex flex-col items-center gap-4">
                    {saleData.invoiceNumber !== "DRAFT" ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(34,197,94,0.5)]">
                                <CheckCircle className="w-8 h-8" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">{t('saleCompleted') || "تمت العملية بنجاح"}</h2>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <h2 className="text-xl font-bold text-cyan-400">{t('speedPrintPreview') || "معاينة الطباعة السريعة"}</h2>
                            <p className="text-sm text-zinc-400">هذا الطلب لم يتم محاسبته بعد</p>
                        </div>
                    )}

                    {/* Format Switcher Tabs - Show container if at least one is enabled */}
                    {(enabledFormats.thermal || enabledFormats.a4) && (
                        <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-white/5 w-64 shadow-inner">
                            {enabledFormats.thermal && (
                                <button
                                    onClick={() => setReceiptFormat('thermal')}
                                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all duration-200 ${receiptFormat === 'thermal' ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'text-zinc-500 hover:text-white'}`}
                                >
                                    {t('thermalRoll') || "Thermal Roll"}
                                </button>
                            )}
                            {enabledFormats.a4 && (
                                <button
                                    onClick={() => setReceiptFormat('a4')}
                                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all duration-200 ${receiptFormat === 'a4' ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'text-zinc-500 hover:text-white'}`}
                                >
                                    {t('standardA4') || "Standard A4"}
                                </button>
                            )}
                        </div>
                    )}
                </div>

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
                            margin: '0 auto',
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
                                            {t('balance') || "الرصيد"}: {new Intl.NumberFormat('en-US', { style: 'currency', currency: settings?.currency || 'EGP' }).format(saleData.customerBalance)}
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
                <div className="flex flex-col gap-3 w-full max-w-[300px]">
                    <div className="flex gap-3 w-full">
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

                    {receiptFormat === 'a4' && printService.isElectron() && (
                        <button
                            onClick={handleExportPDF}
                            disabled={isPrinting}
                            className="w-full py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 border border-white/5 text-white font-bold transition-all flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {t('exportPDF') || 'تصدير كـ PDF'}
                        </button>
                    )}
                </div>
            </div>
        </GlassModal>
    );
}
